from fastapi import APIRouter

from app.api import (
    auth,
    users,
    orders,
    items,
    order_receipt,
    transactions,
    cashier_settings,
    status,
    cash,
)


api_router = APIRouter(prefix="/api")

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(orders.router)
api_router.include_router(items.router)
api_router.include_router(order_receipt.router)
api_router.include_router(transactions.router)
api_router.include_router(cashier_settings.router)
api_router.include_router(status.router)
api_router.include_router(cash.router)
