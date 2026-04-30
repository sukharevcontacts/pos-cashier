from fastapi import APIRouter, HTTPException, Header, Query

from app.core.session import session_store
from app.services.paritet.users import find_user as paritet_find_user
from app.services.paritet.orders import find_orders as paritet_find_orders
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cashier", tags=["cashier"])


@router.get("/search")
async def search_shareholder(
    account: str = Query(...),
    x_session_id: str = Header(...),
    store_id: int = Header(...)
):
    session = session_store.get(x_session_id)
    if not session:
        raise HTTPException(401, "Invalid session")

    try:
        # 1. ищем пользователя
        user = await paritet_find_user(
            token=session.token,
            tvt_id=store_id,
            account=account
        )

        if not user:
            return {"found": False}

        # 2. ищем его заказы
        orders = await paritet_find_orders(
            token=session.token,
            tvt_id=store_id,
            user_id=user.get("userid")
        )

        # 3. маппинг заказов
        mapped_orders = [
            {
                "id": o.get("id"),
                "number": o.get("number"),
                "date": o.get("datecreate"),
                "status": o.get("state"),
                "price": o.get("price"),
                "can_edit": o.get("canedit"),
                "can_cancel": o.get("cancancel"),
            }
            for o in orders
        ]

        # 4. итоговый ответ
        return {
            "found": True,
            "user": {
                "id": user.get("userid"),
                "name": user.get("name"),
                "phone": user.get("phone"),
                "email": user.get("email"),
                "balance": user.get("balance"),
                "account": user.get("account"),
            },
            "orders": mapped_orders
        }

    except Exception as e:
        logger.error(f"Ошибка поиска пайщика/заказа: {e}")
        raise HTTPException(400, str(e))