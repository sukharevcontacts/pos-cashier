from fastapi import APIRouter, HTTPException, Header, Query
import logging

from app.core.session import session_store
from app.services.paritet.status import get_status

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cashier", tags=["cashier"])


@router.get("/status")
async def status(
    x_session_id: str = Header(...),
    store_id: int = Query(...),  # ✔ теперь как у тебя на фронте
):
    """
    Получение актуального статуса кассы (баланс + наличка)

    store_id приходит с фронта (query)
    """

    session = session_store.get(x_session_id)
    if not session:
        raise HTTPException(401, "Invalid session")

    try:
        payload = await get_status(
            token=session.token,
            tvt_id=store_id
        )

        return {
            "owner_balance": float(payload.get("balance") or 0),
            "cash_balance": float(payload.get("moneyincashbox") or 0),
        }

    except Exception as e:
        logger.exception("Ошибка получения статуса кассы")
        raise HTTPException(400, str(e))