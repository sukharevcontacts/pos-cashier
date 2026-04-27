from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db


router = APIRouter(prefix="/cashier/orders", tags=["order-receipt"])


@router.get("/{order_number}/receipt")
async def get_order_receipt(
    order_number: int,
    cashier_account: int = Query(...),
    store_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    access_result = await db.execute(
        text("""
            SELECT
                cs.cashier_account,
                cs.store_id,
                s.store_name,
                s.store_address,
                so.owner_account
            FROM coop.pos_cashier_stores cs
            JOIN coop.pos_stores s
                ON s.store_id = cs.store_id
            LEFT JOIN coop.pos_store_owners so
                ON so.store_id = s.store_id
               AND so.is_active = TRUE
            WHERE cs.cashier_account = :cashier_account
              AND cs.store_id = :store_id
              AND cs.is_active = TRUE
              AND s.is_active = TRUE
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
                u.user_fam,
                u.user_name,
                u.user_otch,
                u.balance::float AS user_balance
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

    lines_result = await db.execute(
        text("""
            SELECT
                od.order_line_id,
                od.item,
                pim.item_name,
                pim.item_type,
                pim.pack,
                od.qty_final::float AS qty_final,
                od.price::float AS price,
                (od.qty_final * od.price)::float AS line_sum
            FROM coop.pos_orders_data od
            JOIN coop.pos_item_master pim
                ON pim.item = od.item
            WHERE od.order_number = :order_number
              AND od.line_status = 'active'
              AND od.qty_final > 0
            ORDER BY od.order_line_id
        """),
        {
            "order_number": order_number,
        },
    )

    lines = [dict(row) for row in lines_result.mappings().all()]
    order_sum = sum(float(row["line_sum"] or 0) for row in lines)

    payment_result = await db.execute(
        text("""
            SELECT
                transaction_id::text AS transaction_id,
                transaction_type,
                status,
                amount::float AS amount,
                created_at
            FROM coop.pos_account_transactions
            WHERE order_number = :order_number
              AND transaction_type = 'order_payment'
              AND status = 'done'
            ORDER BY created_at DESC
            LIMIT 1
        """),
        {
            "order_number": order_number,
        },
    )

    payment = payment_result.mappings().first()

    status_label = {
        "in_progress": "Передан на выполнение",
        "done": "Выполнен",
        "deleted": "Удален",
    }.get(order["status"], order["status"])

    return {
        "ok": True,
        "store": {
            "store_id": access["store_id"],
            "store_name": access["store_name"],
            "store_address": access["store_address"],
            "owner_account": access["owner_account"],
        },
        "order": {
            **dict(order),
            "status_label": status_label,
            "order_sum": order_sum,
        },
        "lines": lines,
        "payment": dict(payment) if payment else None,
    }
