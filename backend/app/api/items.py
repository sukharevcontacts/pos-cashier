from fastapi import APIRouter, HTTPException, Header, Query

from app.core.session import session_store
from app.services.paritet.catalog import get_catalog

router = APIRouter(prefix="/cashier", tags=["cashier"])


@router.get("/catalog")
async def catalog(
    x_session_id: str = Header(...),
    store_id: int = Query(...)
):
    session = session_store.get(x_session_id)
    if not session:
        raise HTTPException(401, "Invalid session")

    try:
        goods = await get_catalog(
            token=session.token,
            tvt_id=store_id
        )

        # маппинг
        return [
            {
                "id": g.get("id"),
                "name": g.get("name"),
                "price": g.get("price"),
                "unit": g.get("unit"),
                "available": g.get("availablecount"),
                "isFractional": g.get("isfractional"),
                "image": g.get("preview"),
            }
            for g in goods
        ]

    except Exception as e:
        raise HTTPException(400, str(e))