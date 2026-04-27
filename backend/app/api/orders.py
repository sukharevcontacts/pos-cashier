from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db


router = APIRouter(prefix="/cashier/orders", tags=["orders"])


class CreateOrderRequest(BaseModel):
    cashier_account: int = Field(..., description="Аккаунт кассира")
    store_id: int = Field(..., description="ТВТ")
    user_account: int = Field(..., description="Пайщик")
    session_id: str | None = Field(default=None, description="ID сессии")
    device_id: str | None = Field(default="web", description="ID устройства")


@router.post("/create")
async def create_order(
    payload: CreateOrderRequest,
    db: AsyncSession = Depends(get_db),
):
    access_result = await db.execute(
        text("""
            SELECT
                cs.cashier_account,
                cs.store_id,
                s.store_name
            FROM coop.pos_cashier_stores cs
            JOIN coop.pos_stores s
                ON s.store_id = cs.store_id
            WHERE cs.cashier_account = :cashier_account
              AND cs.store_id = :store_id
              AND cs.is_active = TRUE
              AND s.is_active = TRUE
            LIMIT 1
        """),
        {
            "cashier_account": payload.cashier_account,
            "store_id": payload.store_id,
        },
    )

    access = access_result.mappings().first()

    if not access:
        raise HTTPException(
            status_code=403,
            detail="Кассир не имеет доступа к этой ТВТ",
        )

    user_result = await db.execute(
        text("""
            SELECT
                user_account,
                user_phone,
                user_name,
                user_fam,
                user_otch,
                balance::float AS balance
            FROM coop.pos_users
            WHERE user_account = :user_account
              AND is_active = TRUE
            LIMIT 1
        """),
        {
            "user_account": payload.user_account,
        },
    )

    user = user_result.mappings().first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="Пайщик не найден или не активен",
        )

    order_result = await db.execute(
        text("""
            INSERT INTO coop.pos_orders (
                user_account,
                store_id,
                status,
                order_date,
                delivery_date,
                date_updated
            )
            VALUES (
                :user_account,
                :store_id,
                'in_progress',
                now(),
                current_date,
                now()
            )
            RETURNING
                order_number,
                user_account,
                store_id,
                status,
                order_date,
                delivery_date,
                date_updated
        """),
        {
            "user_account": payload.user_account,
            "store_id": payload.store_id,
        },
    )

    order = order_result.mappings().first()

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
                'create_order',
                'order',
                :target_id,
                TRUE,
                jsonb_build_object(
                    'order_number', CAST(:order_number AS bigint),
                    'user_account', CAST(:user_account AS bigint),
                    'session_id', CAST(:session_id AS text)
                ),
                :device_id
            )
        """),
        {
            "cashier_account": payload.cashier_account,
            "store_id": payload.store_id,
            "target_id": str(order["order_number"]),
            "order_number": order["order_number"],
            "user_account": payload.user_account,
            "session_id": payload.session_id,
            "device_id": payload.device_id or "web",
        },
    )

    await db.commit()

    return {
        "ok": True,
        "order": {
            "order_number": order["order_number"],
            "user_account": order["user_account"],
            "store_id": order["store_id"],
            "status": order["status"],
            "status_label": "Передан на выполнение",
            "order_date": order["order_date"],
            "delivery_date": order["delivery_date"],
            "date_updated": order["date_updated"],
            "order_sum": 0,
        },
        "user": dict(user),
    }


@router.get("/{order_number}")
async def get_order_details(
    order_number: int,
    cashier_account: int = Query(...),
    store_id: int = Query(...),
    session_id: str = Query(...),
    device_id: str = Query("web"),
    db: AsyncSession = Depends(get_db),
):
    access_result = await db.execute(
        text("""
            SELECT
                cs.cashier_account,
                cs.store_id,
                so.owner_account,
                owner.balance::float AS owner_balance,
                COALESCE(cl.cash_balance, 0)::float AS cash_balance,
                COALESCE(cl.cash_limit, 0)::float AS cash_limit
            FROM coop.pos_cashier_stores cs
            JOIN coop.pos_store_owners so
                ON so.store_id = cs.store_id
               AND so.is_active = TRUE
            JOIN coop.pos_users owner
                ON owner.user_account = so.owner_account
            LEFT JOIN coop.pos_cashier_limit cl
                ON cl.cashier_account = cs.cashier_account
               AND cl.store_owner_account = so.owner_account
               AND cl.is_active = TRUE
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

    access = access_result.mappings().first()

    if not access:
        raise HTTPException(status_code=403, detail="Кассир не имеет доступа к этой ТВТ")

    order_result = await db.execute(
        text("""
            SELECT
                o.order_number,
                o.user_account,
                o.store_id,
                o.status,
                o.order_date,
                o.delivery_date,
                o.date_updated,

                u.user_phone,
                u.user_name,
                u.user_fam,
                u.user_otch,
                u.balance::float AS user_balance,
                u.photo_url AS user_photo_url
            FROM coop.pos_orders o
            JOIN coop.pos_users u
                ON u.user_account = o.user_account
            WHERE o.order_number = :order_number
              AND o.store_id = :store_id
              AND o.status <> 'deleted'
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

    if order["status"] == "in_progress":
        await db.execute(
            text("""
                DELETE FROM coop.pos_order_edit_locks
                WHERE order_number = :order_number
                  AND locked_until < now()::timestamp
            """),
            {"order_number": order_number},
        )

        lock_insert_result = await db.execute(
            text("""
                INSERT INTO coop.pos_order_edit_locks (
                    order_number,
                    cashier_account,
                    store_id,
                    locked_at,
                    locked_until,
                    device_id,
                    session_id
                )
                VALUES (
                    :order_number,
                    :cashier_account,
                    :store_id,
                    now()::timestamp,
                    now()::timestamp + interval '2 minutes',
                    :device_id,
                    :session_id
                )
                ON CONFLICT (order_number) DO NOTHING
                RETURNING order_number
            """),
            {
                "order_number": order_number,
                "cashier_account": cashier_account,
                "store_id": store_id,
                "device_id": device_id,
                "session_id": session_id,
            },
        )

        inserted_lock = lock_insert_result.mappings().first()

        if not inserted_lock:
            lock_result = await db.execute(
                text("""
                    SELECT
                        order_number,
                        cashier_account,
                        store_id,
                        locked_until,
                        device_id,
                        session_id
                    FROM coop.pos_order_edit_locks
                    WHERE order_number = :order_number
                    LIMIT 1
                """),
                {"order_number": order_number},
            )

            lock = lock_result.mappings().first()

            same_session = (
                lock
                and lock["cashier_account"] == cashier_account
                and (
                    lock["session_id"] == session_id
                    or lock["device_id"] == device_id
                )
            )

            if same_session:
                await db.execute(
                    text("""
                        UPDATE coop.pos_order_edit_locks
                        SET
                            locked_until = now()::timestamp + interval '2 minutes',
                            updated_at = now()
                        WHERE order_number = :order_number
                    """),
                    {"order_number": order_number},
                )
            else:
                await db.rollback()
                raise HTTPException(
                    status_code=423,
                    detail="Заказ сейчас редактирует другой кассир",
                )

        await db.commit()

    lines_result = await db.execute(
        text("""
            SELECT
                od.order_line_id,
                od.order_number,
                od.item,

                pim.item_name,
                pim.photo_url,
                pim.item_type,
                pim.avg_weight::float AS avg_weight,
                pim.pack,

                od.qty::float AS qty,
                od.price::float AS price,
                od.qty_final::float AS qty_final,
                od.line_status,
                (od.qty_final * od.price)::float AS line_sum,

                COALESCE(soh.item_stock, 0)::float AS item_stock,
                COALESCE(soh.reserve, 0)::float AS reserve,
                COALESCE((soh.item_stock - soh.reserve), 0)::float AS available_qty,
                COALESCE((od.qty_final + (soh.item_stock - soh.reserve)), od.qty_final)::float AS max_qty_final
            FROM coop.pos_orders_data od
            JOIN coop.pos_item_master pim
                ON pim.item = od.item
            LEFT JOIN coop.pos_stores_soh soh
                ON soh.store_id = :store_id
               AND soh.item = od.item
            WHERE od.order_number = :order_number
              AND od.line_status = 'active'
            ORDER BY od.order_line_id
        """),
        {
            "order_number": order_number,
            "store_id": store_id,
        },
    )

    lines = [dict(row) for row in lines_result.mappings().all()]
    order_sum = sum(float(line["line_sum"] or 0) for line in lines)

    if order["status"] == "in_progress":
        status_label = "Передан на выполнение"
        readonly = False
    elif order["status"] == "done":
        status_label = "Выполнен"
        readonly = True
    else:
        status_label = order["status"]
        readonly = True

    return {
        "ok": True,
        "readonly": readonly,
        "order": {
            **dict(order),
            "status_label": status_label,
            "order_sum": order_sum,
        },
        "store": {
            "store_id": store_id,
            "owner_account": access["owner_account"],
            "owner_balance": access["owner_balance"],
            "cash_balance": access["cash_balance"],
            "cash_limit": access["cash_limit"],
        },
        "lines": lines,
    }


@router.post("/{order_number}/unlock")
async def unlock_order(
    order_number: int,
    cashier_account: int = Query(...),
    session_id: str = Query(...),
    device_id: str = Query("web"),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("""
            DELETE FROM coop.pos_order_edit_locks
            WHERE order_number = :order_number
              AND cashier_account = :cashier_account
              AND (
                    session_id = :session_id
                    OR device_id = :device_id
              )
        """),
        {
            "order_number": order_number,
            "cashier_account": cashier_account,
            "session_id": session_id,
            "device_id": device_id,
        },
    )

    await db.commit()

    return {
        "ok": True,
        "order_number": order_number,
    }


@router.post("/{order_number}/heartbeat")
async def heartbeat_order_lock(
    order_number: int,
    cashier_account: int = Query(...),
    session_id: str = Query(...),
    device_id: str = Query("web"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
            UPDATE coop.pos_order_edit_locks
            SET
                locked_until = now()::timestamp + interval '2 minutes',
                updated_at = now()
            WHERE order_number = :order_number
              AND cashier_account = :cashier_account
              AND (
                    session_id = :session_id
                    OR device_id = :device_id
              )
            RETURNING order_number, locked_until
        """),
        {
            "order_number": order_number,
            "cashier_account": cashier_account,
            "session_id": session_id,
            "device_id": device_id,
        },
    )

    row = result.mappings().first()

    if not row:
        await db.rollback()
        raise HTTPException(status_code=423, detail="Блокировка заказа потеряна")

    await db.commit()

    return {
        "ok": True,
        "order_number": row["order_number"],
        "locked_until": row["locked_until"],
    }


class DeleteOrderRequest(BaseModel):
    cashier_account: int = Field(..., description="Аккаунт кассира")
    store_id: int = Field(..., description="ТВТ")
    session_id: str | None = Field(default=None, description="ID сессии")
    device_id: str | None = Field(default="web", description="ID устройства")


@router.post("/{order_number}/delete")
async def delete_order(
    order_number: int,
    payload: DeleteOrderRequest,
    db: AsyncSession = Depends(get_db),
):
    device_id = payload.device_id or "web"

    # 1. Проверяем доступ кассира к ТВТ
    access_result = await db.execute(
        text("""
            SELECT 1
            FROM coop.pos_cashier_stores cs
            JOIN coop.pos_stores s
                ON s.store_id = cs.store_id
            WHERE cs.cashier_account = :cashier_account
              AND cs.store_id = :store_id
              AND cs.is_active = TRUE
              AND s.is_active = TRUE
            LIMIT 1
        """),
        {
            "cashier_account": payload.cashier_account,
            "store_id": payload.store_id,
        },
    )

    if not access_result.scalar():
        raise HTTPException(status_code=403, detail="Кассир не имеет доступа к этой ТВТ")

    # 2. Блокируем заказ
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
            FOR UPDATE
        """),
        {
            "order_number": order_number,
            "store_id": payload.store_id,
        },
    )

    order = order_result.mappings().first()

    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    if order["status"] == "deleted":
        raise HTTPException(status_code=400, detail="Заказ уже удален")

    if order["status"] == "done":
        raise HTTPException(status_code=400, detail="Выполненный заказ удалить нельзя")

    if order["status"] != "in_progress":
        raise HTTPException(status_code=400, detail="Удалить можно только заказ в статусе Передан на выполнение")

    # 3. Проверяем блокировку, если она есть
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

    if lock:
        same_lock_owner = (
            lock["cashier_account"] == payload.cashier_account
            and (
                lock["session_id"] == payload.session_id
                or lock["device_id"] == device_id
            )
        )

        if not same_lock_owner:
            raise HTTPException(
                status_code=423,
                detail="Заказ сейчас редактирует другой кассир",
            )

    # 4. Берем активные строки и блокируем остатки
    lines_result = await db.execute(
        text("""
            SELECT
                od.order_line_id,
                od.item,
                od.qty_final
            FROM coop.pos_orders_data od
            JOIN coop.pos_stores_soh soh
                ON soh.store_id = :store_id
               AND soh.item = od.item
            WHERE od.order_number = :order_number
              AND od.line_status = 'active'
              AND od.qty_final > 0
            FOR UPDATE OF od, soh
        """),
        {
            "order_number": order_number,
            "store_id": payload.store_id,
        },
    )

    lines = [dict(row) for row in lines_result.mappings().all()]

    # 5. Уменьшаем reserve, item_stock не трогаем
    for line in lines:
        await db.execute(
            text("""
                UPDATE coop.pos_stores_soh
                SET
                    reserve = reserve - CAST(:qty_final AS numeric),
                    updated_at = now()
                WHERE store_id = :store_id
                  AND item = :item
            """),
            {
                "qty_final": line["qty_final"],
                "store_id": payload.store_id,
                "item": line["item"],
            },
        )

    # 6. Помечаем строки удаленными
    await db.execute(
        text("""
            UPDATE coop.pos_orders_data
            SET
                line_status = 'deleted',
                qty_final = 0,
                date_time_updated = now()
            WHERE order_number = :order_number
              AND line_status = 'active'
        """),
        {
            "order_number": order_number,
        },
    )

    # 7. Помечаем заказ удаленным
    await db.execute(
        text("""
            UPDATE coop.pos_orders
            SET
                status = 'deleted',
                date_updated = now(),
                updated_at = now()
            WHERE order_number = :order_number
        """),
        {
            "order_number": order_number,
        },
    )

    # 8. Снимаем блокировку
    await db.execute(
        text("""
            DELETE FROM coop.pos_order_edit_locks
            WHERE order_number = :order_number
        """),
        {
            "order_number": order_number,
        },
    )

    # 9. Аудит
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
                'delete_order',
                'order',
                :target_id,
                TRUE,
                jsonb_build_object(
                    'order_number', CAST(:order_number AS bigint),
                    'user_account', CAST(:user_account AS bigint),
                    'lines_count', CAST(:lines_count AS bigint),
                    'session_id', CAST(:session_id AS text)
                ),
                :device_id
            )
        """),
        {
            "cashier_account": payload.cashier_account,
            "store_id": payload.store_id,
            "target_id": str(order_number),
            "order_number": order_number,
            "user_account": order["user_account"],
            "lines_count": len(lines),
            "session_id": payload.session_id,
            "device_id": device_id,
        },
    )

    await db.commit()

    return {
        "ok": True,
        "order_number": order_number,
        "status": "deleted",
        "status_label": "Удален",
        "released_lines": len(lines),
    }


class SaveOrderRequest(BaseModel):
    cashier_account: int = Field(..., description="Аккаунт кассира")
    store_id: int = Field(..., description="ТВТ")
    session_id: str | None = Field(default=None, description="ID сессии")
    device_id: str | None = Field(default="web", description="ID устройства")


@router.post("/{order_number}/save")
async def save_order(
    order_number: int,
    payload: SaveOrderRequest,
    db: AsyncSession = Depends(get_db),
):
    device_id = payload.device_id or "web"

    # 1. Проверяем доступ кассира к ТВТ
    access_result = await db.execute(
        text("""
            SELECT 1
            FROM coop.pos_cashier_stores cs
            JOIN coop.pos_stores s
                ON s.store_id = cs.store_id
            WHERE cs.cashier_account = :cashier_account
              AND cs.store_id = :store_id
              AND cs.is_active = TRUE
              AND s.is_active = TRUE
            LIMIT 1
        """),
        {
            "cashier_account": payload.cashier_account,
            "store_id": payload.store_id,
        },
    )

    if not access_result.scalar():
        raise HTTPException(status_code=403, detail="Кассир не имеет доступа к этой ТВТ")

    # 2. Проверяем заказ
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
              AND status <> 'deleted'
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

    if order["status"] == "done":
        raise HTTPException(status_code=400, detail="Выполненный заказ уже нельзя сохранять")

    # 3. Проверяем блокировку
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
            or lock["device_id"] == device_id
        )
    )

    if not same_lock_owner:
        raise HTTPException(status_code=423, detail="Заказ сейчас редактирует другой кассир")

    # 4. Считаем актуальную сумму заказа
    sum_result = await db.execute(
        text("""
            SELECT
                COALESCE(SUM(qty_final * price), 0)::float AS order_sum
            FROM coop.pos_orders_data
            WHERE order_number = :order_number
              AND line_status = 'active'
        """),
        {
            "order_number": order_number,
        },
    )

    order_sum = sum_result.scalar() or 0

    # 5. Обновляем updated_at заказа, статус не меняем
    await db.execute(
        text("""
            UPDATE coop.pos_orders
            SET
                updated_at = now()
            WHERE order_number = :order_number
        """),
        {
            "order_number": order_number,
        },
    )

    # 6. Снимаем блокировку
    await db.execute(
        text("""
            DELETE FROM coop.pos_order_edit_locks
            WHERE order_number = :order_number
        """),
        {
            "order_number": order_number,
        },
    )

    # 7. Аудит
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
                'save_order',
                'order',
                :target_id,
                TRUE,
                jsonb_build_object(
                    'order_number', CAST(:order_number AS bigint),
                    'user_account', CAST(:user_account AS bigint),
                    'order_sum', CAST(:order_sum AS numeric),
                    'session_id', CAST(:session_id AS text)
                ),
                :device_id
            )
        """),
        {
            "cashier_account": payload.cashier_account,
            "store_id": payload.store_id,
            "target_id": str(order_number),
            "order_number": order_number,
            "user_account": order["user_account"],
            "order_sum": order_sum,
            "session_id": payload.session_id,
            "device_id": device_id,
        },
    )

    await db.commit()

    return {
        "ok": True,
        "order_number": order_number,
        "status": order["status"],
        "status_label": "Передан на выполнение",
        "order_sum": order_sum,
    }
