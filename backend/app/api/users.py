from fastapi import APIRouter, HTTPException, Header, Query
from typing import Optional

from app.core.session import session_store
from app.services.paritet.users import (
    register_user as paritet_register_user,
    fill_out_profile as paritet_fill_out_profile,
    find_user as paritet_find_user,
)
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
            raise HTTPException(status_code=404, detail="Пайщик или заказ не найден")

        user_id = user.get("userid")
        user_account = user.get("account")

        # 5. ищем заказы
        orders = await paritet_find_orders(
            token=session.token,
            tvt_id=store_id,
            user_id=user_id
        )

        # 6. маппинг заказов под старый формат
        mapped_orders = [
            {
                "order_number": o.get("number"),
                "user_account": user_account,
                "store_id": store_id,
                "status": o.get("state"),
                "order_date": o.get("datecreate"),
                "delivery_date": None,
                "date_updated": o.get("datecreate"),
                "order_sum": o.get("price"),
                "status_label": o.get("state"),
            }
            for o in orders
        ]

        # 7. полный ответ (КРИТИЧНО — как раньше)
        return {
            "ok": True,
            "cashier": {
                "cashier_account": None,  # временно
                "store_id": store_id,
            },
            "store": {
                "store_id": store_id,
                "owner_account": None,
                "owner_balance": None,
                "cash_balance": 0,
                "cash_limit": 0,
            },
            "user": {
                "user_id": user_id,
                "user_account": user_account,
                "user_phone": user.get("phone"),
                "user_name": user.get("name"),
                "user_fam": None,
                "user_otch": None,
                "address": None,
                "email": user.get("email"),
                "date_of_birth": None,
                "balance": user.get("balance"),
                "photo_url": user.get("photoUrl") or user.get("photo"),
            },
            "orders": mapped_orders,
        }

    except HTTPException:
        raise

    except Exception as e:
        logger.exception("Ошибка поиска пайщика/заказа")
        raise HTTPException(400, str(e))

@router.post("/register")
async def register_shareholder(
    name: str = Query(...),
    birthdate: str = Query(...),
    phone: str = Query(...),
    email: str = Query(...),
    address: str = Query(...),
    x_session_id: str = Header(...),
    store_id: int = Query(...),
):
    session = session_store.get(x_session_id)
    if not session:
        raise HTTPException(401, "Invalid session")

    try:
        user = await paritet_register_user(
            token=session.token,
            tvt_id=store_id,
            name=name,
            birthdate=birthdate,
            phone=phone,
            email=email,
            address=address,
        )

        return {
            "ok": True,
            "user": {
                "user_id": user.get("userid"),
                "user_account": user.get("account"),
                "user_phone": user.get("phone"),
                "user_name": user.get("name"),
                "user_fam": None,
                "user_otch": None,
                "address": None,
                "email": user.get("email"),
                "date_of_birth": None,
                "balance": user.get("balance"),
                "photo_url": user.get("photoUrl") or user.get("photo"),
            },
        }

    except Exception as e:
        logger.exception("Ошибка регистрации пайщика")
        raise HTTPException(
            status_code=400,
            detail={"error": str(e)},
        )

@router.post("/profile")
async def fill_profile(
    user_id: int = Query(...),
    name: str = Query(...),
    birthdate: str = Query(...),
    phone: str = Query(...),
    email: str = Query(...),
    address: str = Query(...),
    x_session_id: str = Header(...),
    store_id: int = Query(...),
):
    session = session_store.get(x_session_id)
    if not session:
        raise HTTPException(401, "Invalid session")

    try:
        payload = await paritet_fill_out_profile(
            token=session.token,
            tvt_id=store_id,
            user_id=user_id,
            name=name,
            birthdate=birthdate,
            phone=phone,
            email=email,
            address=address,
        )

        return {
            "ok": True,
            "user": {
                "name": payload.get("name"),
                "birthdate": payload.get("birthdate"),
                "phone": payload.get("phone"),
                "email": payload.get("email"),
                "address": payload.get("address"),
            },
        }

    except Exception as e:
        logger.exception("Ошибка заполнения анкеты")
        raise HTTPException(
            status_code=400,
            detail={"error": str(e)},
        )
