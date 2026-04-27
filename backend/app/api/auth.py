from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db


router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    cashier_account: int = Field(..., description="Аккаунт кассира")
    cashier_passwd: str = Field(..., description="Пароль кассира")


@router.post("/login")
async def login(
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    cashier_sql = text("""
        SELECT
            c.cashier_account,
            c.is_active,
            u.user_name,
            u.user_fam,
            u.user_otch
        FROM coop.pos_cashiers c
        JOIN coop.pos_users u
            ON u.user_account = c.cashier_account
        WHERE c.cashier_account = :cashier_account
          AND c.cashier_passwd = :cashier_passwd
          AND c.is_active = TRUE
          AND u.is_active = TRUE
        LIMIT 1
    """)

    cashier_result = await db.execute(
        cashier_sql,
        {
            "cashier_account": payload.cashier_account,
            "cashier_passwd": payload.cashier_passwd,
        },
    )

    cashier = cashier_result.mappings().first()

    if not cashier:
        raise HTTPException(
            status_code=401,
            detail="Неверный логин или пароль кассира",
        )

    stores_sql = text("""
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

    stores_result = await db.execute(
        stores_sql,
        {"cashier_account": payload.cashier_account},
    )

    stores = [dict(row) for row in stores_result.mappings().all()]

    return {
        "ok": True,
        "session_id": str(uuid4()),
        "cashier": {
            "cashier_account": cashier["cashier_account"],
            "user_fam": cashier["user_fam"],
            "user_name": cashier["user_name"],
            "user_otch": cashier["user_otch"],
        },
        "stores": stores,
    }
