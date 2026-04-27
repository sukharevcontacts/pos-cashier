from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db


router = APIRouter(prefix="/cashier/users", tags=["transactions"])


@router.get("/{user_account}/transactions")
async def get_user_transactions(
    user_account: int,
    cashier_account: int = Query(...),
    store_id: int = Query(...),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
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
            "cashier_account": cashier_account,
            "store_id": store_id,
        },
    )

    if not access_result.scalar():
        raise HTTPException(status_code=403, detail="Кассир не имеет доступа к этой ТВТ")

    user_result = await db.execute(
        text("""
            SELECT
                user_account,
                user_phone,
                user_fam,
                user_name,
                user_otch,
                balance::float AS balance
            FROM coop.pos_users
            WHERE user_account = :user_account
              AND is_active = TRUE
            LIMIT 1
        """),
        {
            "user_account": user_account,
        },
    )

    user = user_result.mappings().first()

    if not user:
        raise HTTPException(status_code=404, detail="Пайщик не найден")

    result = await db.execute(
        text("""
            SELECT
                l.line_id,
                l.transaction_id::text AS transaction_id,
                l.account,
                l.amount_delta::float AS amount_delta,
                l.line_type,
                l.balance_before::float AS balance_before,
                l.balance_after::float AS balance_after,
                l.created_at,

                t.transaction_type,
                t.status,
                t.cashier_account,
                t.store_id,
                t.owner_account,
                t.order_number,
                t.amount::float AS transaction_amount,
                t.comment,
                t.metadata,

                CASE t.transaction_type
                    WHEN 'cash_topup' THEN 'Пополнение наличными'
                    WHEN 'sbp_topup' THEN 'Пополнение СБП'
                    WHEN 'order_payment' THEN 'Оплата заказа'
                    WHEN 'refund' THEN 'Возврат'
                    WHEN 'correction' THEN 'Корректировка'
                    WHEN 'cash_collection' THEN 'Инкассация'
                    ELSE t.transaction_type
                END AS transaction_type_label,

                CASE l.line_type
                    WHEN 'shareholder_debit' THEN 'Списание с пайщика'
                    WHEN 'shareholder_credit' THEN 'Начисление пайщику'
                    WHEN 'supplier_credit' THEN 'Начисление поставщику'
                    WHEN 'supplier_debit' THEN 'Списание с поставщика'
                    WHEN 'owner_credit' THEN 'Начисление владельцу ТВТ'
                    WHEN 'owner_debit' THEN 'Списание с владельца ТВТ'
                    WHEN 'bank_debit' THEN 'Списание с технического счета'
                    WHEN 'bank_credit' THEN 'Начисление на технический счет'
                    WHEN 'correction_debit' THEN 'Корректировка: списание'
                    WHEN 'correction_credit' THEN 'Корректировка: начисление'
                    ELSE l.line_type
                END AS line_type_label

            FROM coop.pos_account_transaction_lines l
            JOIN coop.pos_account_transactions t
                ON t.transaction_id = l.transaction_id
            WHERE l.account = :user_account
            ORDER BY l.created_at DESC, l.line_id DESC
            LIMIT :limit
        """),
        {
            "user_account": user_account,
            "limit": limit,
        },
    )

    rows = [dict(row) for row in result.mappings().all()]

    return {
        "ok": True,
        "user": dict(user),
        "transactions": rows,
    }
