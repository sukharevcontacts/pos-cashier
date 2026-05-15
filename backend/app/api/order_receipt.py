from typing import Any

from fastapi import APIRouter, Query


router = APIRouter(prefix="/cashier/orders", tags=["order-receipt"])


@router.get("/{order_number}/receipt")
async def get_order_receipt(
    order_number: str,
    cashier_account: str = Query(...),
    store_id: int = Query(...),
) -> dict[str, Any]:
    """
    Временная заглушка чека заказа.

    Чек будет переведён на Paritet API.
    Роут оставлен для совместимости с фронтом, чтобы не ломать экран заказа.
    """

    return {
        "ok": True,
        "source": "stub",
        "message": "Чек временно недоступен. Будет подключён через Paritet API.",
        "store": {
            "store_id": store_id,
            "store_name": None,
            "store_address": None,
            "owner_account": None,
        },
        "order": {
            "order_number": str(order_number),
            "user_account": None,
            "store_id": store_id,
            "status": None,
            "status_label": "Чек временно недоступен",
            "order_date": None,
            "delivery_date": None,
            "date_updated": None,
            "user_phone": None,
            "user_fam": None,
            "user_name": None,
            "user_otch": None,
            "user_balance": None,
            "order_sum": 0,
        },
        "lines": [],
        "payment": None,
        "meta": {
            "cashier_account": str(cashier_account),
            "store_id": store_id,
        },
    }