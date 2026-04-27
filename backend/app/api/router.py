from fastapi import APIRouter

from app.api import (
    auth,
    stores,
    users,
    orders,
    items,
    order_items,
    order_payment,
    order_receipt,
    topup,
    stock,
    transactions,
    cashier_settings,
)


api_router = APIRouter(prefix="/api")

api_router.include_router(auth.router)
api_router.include_router(stores.router)
api_router.include_router(users.router)
api_router.include_router(orders.router)
api_router.include_router(items.router)
api_router.include_router(order_items.router)
api_router.include_router(order_payment.router)
api_router.include_router(order_receipt.router)
api_router.include_router(topup.router)
api_router.include_router(stock.router)
api_router.include_router(transactions.router)
api_router.include_router(cashier_settings.router)
