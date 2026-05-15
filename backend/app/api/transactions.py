from typing import Any

from fastapi import APIRouter, Query


router = APIRouter(prefix="/cashier/users", tags=["transactions"])


@router.get("/{user_account}/transactions")
async def get_user_transactions(
    user_account: str,
    cashier_account: str = Query(...),
    store_id: int = Query(...),
    limit: int = Query(default=50, ge=1, le=200),
) -> dict[str, Any]:
    """
    Временная заглушка истории операций.

    История операций будет переведена на Paritet API.
    Роут оставлен для совместимости с фронтом, чтобы не ломать экран пайщика.
    """

    return {
        "ok": True,
        "source": "stub",
        "message": "История операций временно недоступна. Будет подключена через Paritet API.",
        "user": {
            "user_account": str(user_account),
            "user_phone": None,
            "user_fam": None,
            "user_name": None,
            "user_otch": None,
            "balance": None,
        },
        "transactions": [],
        "meta": {
            "cashier_account": str(cashier_account),
            "store_id": store_id,
            "limit": limit,
        },
    }