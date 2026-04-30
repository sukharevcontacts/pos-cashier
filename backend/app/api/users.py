from fastapi import APIRouter, HTTPException, Header, Query
from typing import Optional

from app.core.session import session_store
from app.services.paritet.users import find_user as paritet_find_user
from app.services.paritet.orders import find_orders as paritet_find_orders
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cashier", tags=["cashier"])


@router.get("/search")
async def search_shareholder(
    account: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    x_session_id: str = Header(...),
    store_id_header: Optional[int] = Header(None, alias="store_id"),
    store_id_query: Optional[int] = Query(None, alias="store_id"),
):
    """
    Поддерживаем:
    - старый фронт: q + store_id (query)
    - новый вариант: account + store_id (header)
    """

    # 1. сессия
    session = session_store.get(x_session_id)
    if not session:
        raise HTTPException(401, "Invalid session")

    # 2. значение поиска
    search_value = account or q
    if not search_value:
        raise HTTPException(400, "account or q required")

    search_value = str(search_value).strip()

    # 3. store_id (из header или query)
    store_id = store_id_header or store_id_query
    if not store_id:
        raise HTTPException(400, "store_id required")

    try:
        logger.info(f"Search shareholder: {search_value}, store={store_id}")

        # 4. ищем пользователя
        user = await paritet_find_user(
            token=session.token,
            tvt_id=store_id,
            account=search_value
        )

        if not user:
            logger.info("User not found")
            return {"found": False}

        user_id = user.get("userid")

        # 5. ищем заказы
        orders = await paritet_find_orders(
            token=session.token,
            tvt_id=store_id,
            user_id=user_id
        )

        # 6. маппинг заказов
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

        # 7. итог
        return {
            "found": True,
            "user": {
                "id": user_id,
                "name": user.get("name"),
                "phone": user.get("phone"),
                "email": user.get("email"),
                "balance": user.get("balance"),
                "account": user.get("account"),
            },
            "orders": mapped_orders
        }

    except Exception as e:
        logger.exception("Ошибка поиска пайщика/заказа")
        raise HTTPException(400, str(e))