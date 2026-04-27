from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db


router = APIRouter(prefix="/cashier/orders", tags=["order-payment"])


class PayOrderRequest(BaseModel):
    cashier_account: int = Field(..., description="Аккаунт кассира")
    store_id: int = Field(..., description="ТВТ")
    session_id: str = Field(..., description="ID сессии")
    device_id: str | None = Field(default="web", description="ID устройства")


def money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def qty(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


@router.post("/{order_number}/pay")
async def pay_order(
    order_number: int,
    payload: PayOrderRequest,
    db: AsyncSession = Depends(get_db),
):
    device_id = payload.device_id or "web"

    # 1. Проверяем заказ
    order_result = await db.execute(
        text("""
            SELECT
                o.order_number,
                o.user_account,
                o.store_id,
                o.status,
                u.balance AS user_balance
            FROM coop.pos_orders o
            JOIN coop.pos_users u
                ON u.user_account = o.user_account
            WHERE o.order_number = :order_number
              AND o.store_id = :store_id
            FOR UPDATE OF o, u
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
        raise HTTPException(status_code=400, detail="Оплатить можно только заказ в статусе Передан на выполнение")

    user_account = order["user_account"]

    # 2. Проверяем доступ кассира к ТВТ и владельца ТВТ
    access_result = await db.execute(
        text("""
            SELECT
                cs.cashier_account,
                cs.store_id,
                so.owner_account
            FROM coop.pos_cashier_stores cs
            JOIN coop.pos_store_owners so
                ON so.store_id = cs.store_id
               AND so.is_active = TRUE
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

    access = access_result.mappings().first()

    if not access:
        raise HTTPException(status_code=403, detail="Кассир не имеет доступа к этой ТВТ")

    owner_account = access["owner_account"]

    # 3. Проверяем активную блокировку заказа
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

    # 4. Берем строки заказа и блокируем остатки
    lines_result = await db.execute(
        text("""
            SELECT
                od.order_line_id,
                od.item,
                od.qty_final,
                od.price,
                pim.supplier_account,
                pim.item_name,
                soh.item_stock,
                soh.reserve
            FROM coop.pos_orders_data od
            JOIN coop.pos_item_master pim
                ON pim.item = od.item
            JOIN coop.pos_stores_soh soh
                ON soh.store_id = :store_id
               AND soh.item = od.item
            WHERE od.order_number = :order_number
              AND od.line_status = 'active'
              AND od.qty_final > 0
            ORDER BY od.order_line_id
            FOR UPDATE OF od, soh
        """),
        {
            "order_number": order_number,
            "store_id": payload.store_id,
        },
    )

    lines = [dict(row) for row in lines_result.mappings().all()]

    if not lines:
        raise HTTPException(status_code=400, detail="В заказе нет товаров для оплаты")

    total_amount = Decimal("0.00")
    supplier_amounts: dict[int, Decimal] = {}
    owner_amount = Decimal("0.00")

    for line in lines:
        line_qty = qty(line["qty_final"])
        line_price = money(line["price"])
        line_sum = money(line_qty * line_price)

        if line["supplier_account"] is None:
            raise HTTPException(
                status_code=400,
                detail=f"У товара {line['item']} не указан поставщик",
            )

        if qty(line["item_stock"]) < line_qty:
            raise HTTPException(
                status_code=400,
                detail=f"Недостаточно остатка по товару {line['item_name']}",
            )

        if qty(line["reserve"]) < line_qty:
            raise HTTPException(
                status_code=400,
                detail=f"Недостаточно резерва по товару {line['item_name']}",
            )

        supplier_part = money(line_sum * Decimal("0.15"))
        owner_part = money(line_sum - supplier_part)

        total_amount += line_sum
        supplier_amounts[line["supplier_account"]] = supplier_amounts.get(line["supplier_account"], Decimal("0.00")) + supplier_part
        owner_amount += owner_part

    total_amount = money(total_amount)
    owner_amount = money(owner_amount)

    if total_amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма заказа должна быть больше нуля")

    user_balance = money(order["user_balance"])

    if user_balance < total_amount:
        raise HTTPException(
            status_code=400,
            detail=f"Недостаточно паев на счете пайщика. Нужно {total_amount}, доступно {user_balance}",
        )

    # 5. Создаем шапку операции
    tx_result = await db.execute(
        text("""
            INSERT INTO coop.pos_account_transactions (
                transaction_type,
                status,
                cashier_account,
                store_id,
                owner_account,
                order_number,
                amount,
                comment,
                metadata
            )
            VALUES (
                'order_payment',
                'done',
                :cashier_account,
                :store_id,
                :owner_account,
                :order_number,
                CAST(:amount AS numeric),
                'Оплата заказа через кассу',
                jsonb_build_object(
                    'session_id', CAST(:session_id AS text),
                    'device_id', CAST(:device_id AS text)
                )
            )
            RETURNING transaction_id
        """),
        {
            "cashier_account": payload.cashier_account,
            "store_id": payload.store_id,
            "owner_account": owner_account,
            "order_number": order_number,
            "amount": total_amount,
            "session_id": payload.session_id,
            "device_id": device_id,
        },
    )

    transaction_id: UUID = tx_result.scalar_one()

    # 6. Движения по счетам
    movements: list[tuple[int, Decimal, str]] = []

    movements.append((user_account, -total_amount, "shareholder_debit"))

    for supplier_account, supplier_sum in sorted(supplier_amounts.items()):
        supplier_sum = money(supplier_sum)
        if supplier_sum != 0:
            movements.append((supplier_account, supplier_sum, "supplier_credit"))

    if owner_amount != 0:
        movements.append((owner_account, owner_amount, "owner_credit"))

    # 7. Последовательно блокируем и меняем балансы
    for account, amount_delta, line_type in movements:
        balance_result = await db.execute(
            text("""
                SELECT
                    user_account,
                    balance
                FROM coop.pos_users
                WHERE user_account = :account
                FOR UPDATE
            """),
            {"account": account},
        )

        balance_row = balance_result.mappings().first()

        if not balance_row:
            raise HTTPException(status_code=400, detail=f"Счет {account} не найден")

        balance_before = money(balance_row["balance"])
        balance_after = money(balance_before + amount_delta)

        if balance_after < 0:
            raise HTTPException(status_code=400, detail=f"Недостаточно паев на счете {account}")

        await db.execute(
            text("""
                UPDATE coop.pos_users
                SET
                    balance = CAST(:balance_after AS numeric),
                    updated_at = now()
                WHERE user_account = :account
            """),
            {
                "balance_after": balance_after,
                "account": account,
            },
        )

        await db.execute(
            text("""
                INSERT INTO coop.pos_account_transaction_lines (
                    transaction_id,
                    account,
                    amount_delta,
                    line_type,
                    balance_before,
                    balance_after
                )
                VALUES (
                    :transaction_id,
                    :account,
                    CAST(:amount_delta AS numeric),
                    :line_type,
                    CAST(:balance_before AS numeric),
                    CAST(:balance_after AS numeric)
                )
            """),
            {
                "transaction_id": transaction_id,
                "account": account,
                "amount_delta": amount_delta,
                "line_type": line_type,
                "balance_before": balance_before,
                "balance_after": balance_after,
            },
        )

    # 8. Уменьшаем остатки и резерв
    for line in lines:
        line_qty = qty(line["qty_final"])

        await db.execute(
            text("""
                UPDATE coop.pos_stores_soh
                SET
                    item_stock = item_stock - CAST(:line_qty AS numeric),
                    reserve = reserve - CAST(:line_qty AS numeric),
                    updated_at = now()
                WHERE store_id = :store_id
                  AND item = :item
            """),
            {
                "line_qty": line_qty,
                "store_id": payload.store_id,
                "item": line["item"],
            },
        )

    # 9. Переводим заказ в done
    await db.execute(
        text("""
            UPDATE coop.pos_orders
            SET
                status = 'done',
                date_updated = now(),
                updated_at = now()
            WHERE order_number = :order_number
        """),
        {
            "order_number": order_number,
        },
    )

    # 10. Снимаем блокировку
    await db.execute(
        text("""
            DELETE FROM coop.pos_order_edit_locks
            WHERE order_number = :order_number
        """),
        {
            "order_number": order_number,
        },
    )

    # 11. Аудит
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
                'pay_order',
                'order',
                :target_id,
                TRUE,
                jsonb_build_object(
                    'order_number', CAST(:order_number AS bigint),
                    'transaction_id', CAST(:transaction_id AS text),
                    'amount', CAST(:amount AS numeric),
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
            "transaction_id": str(transaction_id),
            "amount": total_amount,
            "session_id": payload.session_id,
            "device_id": device_id,
        },
    )

    await db.commit()

    return {
        "ok": True,
        "order_number": order_number,
        "transaction_id": str(transaction_id),
        "amount": float(total_amount),
        "status": "done",
        "status_label": "Выполнен",
    }
