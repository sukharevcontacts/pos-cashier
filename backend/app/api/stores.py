from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db


router = APIRouter(prefix="/cashier", tags=["cashier"])


@router.get("/stores")
async def get_cashier_stores(
    cashier_account: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    sql = text("""
        SELECT
            s.store_id,
            s.store_name,
            s.store_address,
            so.owner_account,
            owner.balance AS owner_balance
        FROM coop.pos_cashier_stores cs
        JOIN coop.pos_stores s
            ON s.store_id = cs.store_id
        LEFT JOIN coop.pos_store_owners so
            ON so.store_id = s.store_id
           AND so.is_active = TRUE
        LEFT JOIN coop.pos_users owner
            ON owner.user_account = so.owner_account
        WHERE cs.cashier_account = :cashier_account
          AND cs.is_active = TRUE
          AND s.is_active = TRUE
        ORDER BY s.store_name
    """)

    result = await db.execute(sql, {"cashier_account": cashier_account})
    stores = [dict(row) for row in result.mappings().all()]

    if not stores:
        raise HTTPException(
            status_code=404,
            detail="У кассира нет доступных ТВТ",
        )

    return {
        "cashier_account": cashier_account,
        "stores": stores,
    }
