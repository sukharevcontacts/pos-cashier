from fastapi import APIRouter, HTTPException, Header

from app.core.session import session_store
from app.services.paritet.status import get_status

router = APIRouter()


@router.get("/status")
async def status(
    x_session_id: str = Header(...),
    store_id: int = Header(...)
):
    """
    Временно:
    store_id приходит с фронта
    позже уберем (перенесем в session)
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
            "balance": payload.get("balance", 0),
            "money_in_cashbox": payload.get("moneyincashbox", 0),
        }

    except Exception as e:
        raise HTTPException(400, str(e))