from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db


router = APIRouter(prefix="/cashier/orders", tags=["order-items"])


class AddOrderItemRequest(BaseModel):
    cashier_account: int = Field(..., description="Аккаунт кассира")
    store_id: int = Field(..., description="ТВТ")
    item: int = Field(..., description="Код товара")
    session_id: str = Field(..., description="ID сессии")
    device_id: str | None = Field(default="web", description="ID устройства")


@router.post("/{order_number}/items/add")
async def add_item_to_order(
    order_number: int,
    payload: AddOrderItemRequest,
    db: AsyncSession = Depends(get_db),
):
    # 1. Проверяем заказ
    order_result = await db.execute(
        text("""
            SELECT
                order_number,
                user_account,
                store_id,
                status
            FROM coop.pos_orders
            WHERE order_number = :order_number
              AND store_id = :store_id
            LIMIT 1
        """),
        {
            "order_number": order_number,
            "store_id": payload.store_id,
        },
    )

    order = order_result.mappings().first()

    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    if order["status"] != "in_progress":
        raise HTTPException(status_code=400, detail="Изменять можно только заказ в статусе Передан на выполнение")

    # 2. Проверяем доступ кассира к ТВТ
    access_result = await db.execute(
        text("""
            SELECT 1
            FROM coop.pos_cashier_stores cs
            WHERE cs.cashier_account = :cashier_account
              AND cs.store_id = :store_id
              AND cs.is_active = TRUE
            LIMIT 1
        """),
        {
            "cashier_account": payload.cashier_account,
            "store_id": payload.store_id,
        },
    )

    if not access_result.scalar():
        raise HTTPException(status_code=403, detail="Кассир не имеет доступа к этой ТВТ")

    # 3. Проверяем блокировку заказа
    lock_result = await db.execute(
        text("""
            SELECT
                order_number,
                cashier_account,
                session_id,
                device_id,
                locked_until
            FROM coop.pos_order_edit_locks
            WHERE order_number = :order_number
              AND locked_until >= now()::timestamp
            LIMIT 1
        """),
        {
            "order_number": order_number,
        },
    )

    lock = lock_result.mappings().first()

    if not lock:
        raise HTTPException(status_code=423, detail="Нет активной блокировки заказа. Откройте заказ заново")

    same_lock_owner = (
        lock["cashier_account"] == payload.cashier_account
        and (
            lock["session_id"] == payload.session_id
            or lock["device_id"] == (payload.device_id or "web")
        )
    )

    if not same_lock_owner:
        raise HTTPException(status_code=423, detail="Заказ сейчас редактирует другой кассир")

    # 4. Блокируем остаток товара
    item_result = await db.execute(
        text("""
            SELECT
                pim.item,
                pim.item_name,
                pim.item_type,
                pim.avg_weight,
                pim.pack,
                pil.price,
                soh.item_stock,
                soh.reserve,
                (soh.item_stock - soh.reserve) AS available_qty
            FROM coop.pos_item_loc pil
            JOIN coop.pos_item_master pim
                ON pim.item = pil.item
            JOIN coop.pos_stores_soh soh
                ON soh.store_id = pil.store_id
               AND soh.item = pil.item
            WHERE pil.store_id = :store_id
              AND pil.item = :item
              AND pil.status = 1
              AND pil.is_active = TRUE
              AND pim.is_active = TRUE
            FOR UPDATE OF soh
        """),
        {
            "store_id": payload.store_id,
            "item": payload.item,
        },
    )

    item = item_result.mappings().first()

    if not item:
        raise HTTPException(status_code=404, detail="Товар не найден на этой ТВТ")

    if item["item_type"] == "piece":
        qty_to_add = 1
    else:
        qty_to_add = float(item["avg_weight"] or 0)

    if qty_to_add <= 0:
        raise HTTPException(status_code=400, detail="У товара не задано количество для добавления")

    available_qty = float(item["available_qty"] or 0)

    if available_qty < qty_to_add:
        raise HTTPException(
            status_code=400,
            detail=f"Недостаточно остатка. Доступно: {available_qty}",
        )

    # 5. Ищем активную строку товара в заказе
    existing_line_result = await db.execute(
        text("""
            SELECT
                order_line_id,
                qty_final
            FROM coop.pos_orders_data
            WHERE order_number = :order_number
              AND item = :item
              AND line_status = 'active'
            LIMIT 1
            FOR UPDATE
        """),
        {
            "order_number": order_number,
            "item": payload.item,
        },
    )

    existing_line = existing_line_result.mappings().first()

    if existing_line:
        line_result = await db.execute(
            text("""
                UPDATE coop.pos_orders_data
                SET
                    qty_final = qty_final + CAST(:qty_to_add AS numeric),
                    date_time_updated = now()
                WHERE order_line_id = :order_line_id
                RETURNING
                    order_line_id,
                    order_number,
                    item,
                    qty::float AS qty,
                    price::float AS price,
                    qty_final::float AS qty_final,
                    line_status,
                    (qty_final * price)::float AS line_sum
            """),
            {
                "qty_to_add": qty_to_add,
                "order_line_id": existing_line["order_line_id"],
            },
        )
    else:
        line_result = await db.execute(
            text("""
                INSERT INTO coop.pos_orders_data (
                    order_number,
                    item,
                    qty,
                    price,
                    qty_final,
                    line_status
                )
                VALUES (
                    :order_number,
                    :item,
                    0,
                    :price,
                    :qty_to_add,
                    'active'
                )
                RETURNING
                    order_line_id,
                    order_number,
                    item,
                    qty::float AS qty,
                    price::float AS price,
                    qty_final::float AS qty_final,
                    line_status,
                    (qty_final * price)::float AS line_sum
            """),
            {
                "order_number": order_number,
                "item": payload.item,
                "price": item["price"],
                "qty_to_add": qty_to_add,
            },
        )

    line = line_result.mappings().first()

    # 6. Увеличиваем резерв
    await db.execute(
        text("""
            UPDATE coop.pos_stores_soh
            SET
                reserve = reserve + CAST(:qty_to_add AS numeric),
                updated_at = now()
            WHERE store_id = :store_id
              AND item = :item
        """),
        {
            "qty_to_add": qty_to_add,
            "store_id": payload.store_id,
            "item": payload.item,
        },
    )

    # 7. Обновляем блокировку
    await db.execute(
        text("""
            UPDATE coop.pos_order_edit_locks
            SET
                locked_until = now()::timestamp + interval '2 minutes',
                updated_at = now()
            WHERE order_number = :order_number
        """),
        {
            "order_number": order_number,
        },
    )

    # 8. Аудит
    await db.execute(
        text("""
            INSERT INTO coop.pos_cashier_actions (
                cashier_account,
                store_id,
                action_type,
                target_type,
                target_id,
                success,
                after_data,
                device_id
            )
            VALUES (
                :cashier_account,
                :store_id,
                'add_order_item',
                'order_line',
                CAST(:order_line_id AS text),
                TRUE,
                jsonb_build_object(
                    'order_number', CAST(:order_number AS bigint),
                    'item', CAST(:item AS bigint),
                    'qty_to_add', CAST(:qty_to_add AS numeric),
                    'session_id', CAST(:session_id AS text)
                ),
                :device_id
            )
        """),
        {
            "cashier_account": payload.cashier_account,
            "store_id": payload.store_id,
            "order_line_id": str(line["order_line_id"]),
            "order_number": order_number,
            "item": payload.item,
            "qty_to_add": qty_to_add,
            "session_id": payload.session_id,
            "device_id": payload.device_id or "web",
        },
    )

    await db.commit()

    return {
        "ok": True,
        "order_number": order_number,
        "added_qty": qty_to_add,
        "line": dict(line),
    }


class UpdateOrderLineQtyRequest(BaseModel):
    cashier_account: int = Field(..., description="Аккаунт кассира")
    store_id: int = Field(..., description="ТВТ")
    qty_final: Decimal = Field(..., description="Новое итоговое количество")
    session_id: str = Field(..., description="ID сессии")
    device_id: str | None = Field(default="web", description="ID устройства")


class DeleteOrderLineRequest(BaseModel):
    cashier_account: int = Field(..., description="Аккаунт кассира")
    store_id: int = Field(..., description="ТВТ")
    session_id: str = Field(..., description="ID сессии")
    device_id: str | None = Field(default="web", description="ID устройства")


async def _check_order_edit_access(
    db: AsyncSession,
    order_number: int,
    cashier_account: int,
    store_id: int,
    session_id: str,
    device_id: str,
):
    order_result = await db.execute(
        text("""
            SELECT
                order_number,
                user_account,
                store_id,
                status
            FROM coop.pos_orders
            WHERE order_number = :order_number
              AND store_id = :store_id
            LIMIT 1
        """),
        {
            "order_number": order_number,
            "store_id": store_id,
        },
    )

    order = order_result.mappings().first()

    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    if order["status"] != "in_progress":
        raise HTTPException(status_code=400, detail="Изменять можно только заказ в статусе Передан на выполнение")

    access_result = await db.execute(
        text("""
            SELECT 1
            FROM coop.pos_cashier_stores cs
            WHERE cs.cashier_account = :cashier_account
              AND cs.store_id = :store_id
              AND cs.is_active = TRUE
            LIMIT 1
        """),
        {
            "cashier_account": cashier_account,
            "store_id": store_id,
        },
    )

    if not access_result.scalar():
        raise HTTPException(status_code=403, detail="Кассир не имеет доступа к этой ТВТ")

    lock_result = await db.execute(
        text("""
            SELECT
                order_number,
                cashier_account,
                session_id,
                device_id,
                locked_until
            FROM coop.pos_order_edit_locks
            WHERE order_number = :order_number
              AND locked_until >= now()::timestamp
            LIMIT 1
        """),
        {
            "order_number": order_number,
        },
    )

    lock = lock_result.mappings().first()

    if not lock:
        raise HTTPException(status_code=423, detail="Нет активной блокировки заказа. Откройте заказ заново")

    same_lock_owner = (
        lock["cashier_account"] == cashier_account
        and (
            lock["session_id"] == session_id
            or lock["device_id"] == device_id
        )
    )

    if not same_lock_owner:
        raise HTTPException(status_code=423, detail="Заказ сейчас редактирует другой кассир")

    return order


@router.post("/{order_number}/lines/{order_line_id}/qty")
async def update_order_line_qty(
    order_number: int,
    order_line_id: int,
    payload: UpdateOrderLineQtyRequest,
    db: AsyncSession = Depends(get_db),
):
    device_id = payload.device_id or "web"

    await _check_order_edit_access(
        db=db,
        order_number=order_number,
        cashier_account=payload.cashier_account,
        store_id=payload.store_id,
        session_id=payload.session_id,
        device_id=device_id,
    )

    if payload.qty_final < 0:
        raise HTTPException(status_code=400, detail="Количество не может быть отрицательным")

    line_result = await db.execute(
        text("""
            SELECT
                od.order_line_id,
                od.order_number,
                od.item,
                od.qty_final,
                od.price,
                pim.item_type,
                soh.item_stock,
                soh.reserve,
                (soh.item_stock - soh.reserve) AS available_qty
            FROM coop.pos_orders_data od
            JOIN coop.pos_item_master pim
                ON pim.item = od.item
            JOIN coop.pos_stores_soh soh
                ON soh.store_id = :store_id
               AND soh.item = od.item
            WHERE od.order_line_id = :order_line_id
              AND od.order_number = :order_number
              AND od.line_status = 'active'
            FOR UPDATE OF od, soh
        """),
        {
            "store_id": payload.store_id,
            "order_line_id": order_line_id,
            "order_number": order_number,
        },
    )

    line = line_result.mappings().first()

    if not line:
        raise HTTPException(status_code=404, detail="Строка заказа не найдена")

    old_qty = Decimal(str(line["qty_final"]))
    new_qty = payload.qty_final
    diff = new_qty - old_qty

    if line["item_type"] == "piece" and new_qty != new_qty.to_integral_value():
        raise HTTPException(status_code=400, detail="Для штучного товара количество должно быть целым")

    if line["item_type"] == "weight":
        # 1 грамм = 0.001 кг
        if (new_qty * Decimal("1000")) != (new_qty * Decimal("1000")).to_integral_value():
            raise HTTPException(status_code=400, detail="Весовой товар можно менять кратно 1 грамму")

    available_qty = Decimal(str(line["available_qty"]))

    if diff > available_qty:
        raise HTTPException(
            status_code=400,
            detail=f"Недостаточно остатка. Доступно дополнительно: {available_qty}",
        )

    updated_line_result = await db.execute(
        text("""
            UPDATE coop.pos_orders_data
            SET
                qty_final = CAST(:new_qty AS numeric),
                date_time_updated = now()
            WHERE order_line_id = :order_line_id
            RETURNING
                order_line_id,
                order_number,
                item,
                qty::float AS qty,
                price::float AS price,
                qty_final::float AS qty_final,
                line_status,
                (qty_final * price)::float AS line_sum
        """),
        {
            "new_qty": new_qty,
            "order_line_id": order_line_id,
        },
    )

    updated_line = updated_line_result.mappings().first()

    await db.execute(
        text("""
            UPDATE coop.pos_stores_soh
            SET
                reserve = reserve + CAST(:diff AS numeric),
                updated_at = now()
            WHERE store_id = :store_id
              AND item = :item
        """),
        {
            "diff": diff,
            "store_id": payload.store_id,
            "item": line["item"],
        },
    )

    await db.execute(
        text("""
            UPDATE coop.pos_order_edit_locks
            SET
                locked_until = now()::timestamp + interval '2 minutes',
                updated_at = now()
            WHERE order_number = :order_number
        """),
        {
            "order_number": order_number,
        },
    )

    await db.execute(
        text("""
            INSERT INTO coop.pos_cashier_actions (
                cashier_account,
                store_id,
                action_type,
                target_type,
                target_id,
                success,
                before_data,
                after_data,
                device_id
            )
            VALUES (
                :cashier_account,
                :store_id,
                'update_order_line_qty',
                'order_line',
                :target_id,
                TRUE,
                jsonb_build_object(
                    'qty_final', CAST(:old_qty AS numeric)
                ),
                jsonb_build_object(
                    'order_number', CAST(:order_number AS bigint),
                    'order_line_id', CAST(:order_line_id AS bigint),
                    'item', CAST(:item AS bigint),
                    'qty_final', CAST(:new_qty AS numeric),
                    'diff', CAST(:diff AS numeric),
                    'session_id', CAST(:session_id AS text)
                ),
                :device_id
            )
        """),
        {
            "cashier_account": payload.cashier_account,
            "store_id": payload.store_id,
            "target_id": str(order_line_id),
            "old_qty": old_qty,
            "order_number": order_number,
            "order_line_id": order_line_id,
            "item": line["item"],
            "new_qty": new_qty,
            "diff": diff,
            "session_id": payload.session_id,
            "device_id": device_id,
        },
    )

    await db.commit()

    return {
        "ok": True,
        "order_number": order_number,
        "line": dict(updated_line),
    }


@router.post("/{order_number}/lines/{order_line_id}/delete")
async def delete_order_line(
    order_number: int,
    order_line_id: int,
    payload: DeleteOrderLineRequest,
    db: AsyncSession = Depends(get_db),
):
    device_id = payload.device_id or "web"

    await _check_order_edit_access(
        db=db,
        order_number=order_number,
        cashier_account=payload.cashier_account,
        store_id=payload.store_id,
        session_id=payload.session_id,
        device_id=device_id,
    )

    line_result = await db.execute(
        text("""
            SELECT
                od.order_line_id,
                od.order_number,
                od.item,
                od.qty_final
            FROM coop.pos_orders_data od
            JOIN coop.pos_stores_soh soh
                ON soh.store_id = :store_id
               AND soh.item = od.item
            WHERE od.order_line_id = :order_line_id
              AND od.order_number = :order_number
              AND od.line_status = 'active'
            FOR UPDATE OF od, soh
        """),
        {
            "store_id": payload.store_id,
            "order_line_id": order_line_id,
            "order_number": order_number,
        },
    )

    line = line_result.mappings().first()

    if not line:
        raise HTTPException(status_code=404, detail="Строка заказа не найдена")

    old_qty = Decimal(str(line["qty_final"]))

    await db.execute(
        text("""
            UPDATE coop.pos_orders_data
            SET
                line_status = 'deleted',
                qty_final = 0,
                date_time_updated = now()
            WHERE order_line_id = :order_line_id
        """),
        {
            "order_line_id": order_line_id,
        },
    )

    await db.execute(
        text("""
            UPDATE coop.pos_stores_soh
            SET
                reserve = reserve - CAST(:old_qty AS numeric),
                updated_at = now()
            WHERE store_id = :store_id
              AND item = :item
        """),
        {
            "old_qty": old_qty,
            "store_id": payload.store_id,
            "item": line["item"],
        },
    )

    await db.execute(
        text("""
            UPDATE coop.pos_order_edit_locks
            SET
                locked_until = now()::timestamp + interval '2 minutes',
                updated_at = now()
            WHERE order_number = :order_number
        """),
        {
            "order_number": order_number,
        },
    )

    await db.execute(
        text("""
            INSERT INTO coop.pos_cashier_actions (
                cashier_account,
                store_id,
                action_type,
                target_type,
                target_id,
                success,
                before_data,
                after_data,
                device_id
            )
            VALUES (
                :cashier_account,
                :store_id,
                'delete_order_line',
                'order_line',
                :target_id,
                TRUE,
                jsonb_build_object(
                    'qty_final', CAST(:old_qty AS numeric)
                ),
                jsonb_build_object(
                    'order_number', CAST(:order_number AS bigint),
                    'order_line_id', CAST(:order_line_id AS bigint),
                    'item', CAST(:item AS bigint),
                    'session_id', CAST(:session_id AS text)
                ),
                :device_id
            )
        """),
        {
            "cashier_account": payload.cashier_account,
            "store_id": payload.store_id,
            "target_id": str(order_line_id),
            "old_qty": old_qty,
            "order_number": order_number,
            "order_line_id": order_line_id,
            "item": line["item"],
            "session_id": payload.session_id,
            "device_id": device_id,
        },
    )

    await db.commit()

    return {
        "ok": True,
        "order_number": order_number,
        "order_line_id": order_line_id,
    }
