from fastapi import APIRouter, HTTPException

from app.services.paritet.auth import paritet_auth
from app.core.session import session_store

router = APIRouter()


@router.post("/auth/login")
async def login(data: dict):
    """
    input:
    {
        "cashier_account": "...",
        "cashier_passwd": "..."
    }
    """
    try:
        payload = await paritet_auth(
            data["cashier_account"],
            data["cashier_passwd"],
        )

        # создаём нашу сессию
        session_id = session_store.create(payload["access_token"])

        return {
            "session_id": session_id,
            "cashier": {
                "cashier_account": str(data["cashier_account"]),
                "user_fam": None,
                "user_name": payload["name"],
                "user_otch": None,
                "name": payload["name"],
                "phone": payload["phone"],
            },
            "stores": [
                {
                    "store_id": tvt["id"],
                    "store_name": tvt["name"],
                    "store_address": tvt["address"],
                    "default_warehouse": tvt["default_warehouse"],
                }
                for tvt in payload.get("tvtlist", [])
            ],
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/auth/select-store")
async def select_store(data: dict):
    """
    input:
    {
        "session_id": "...",
        "store_id": 166,
        "default_warehouse": 38
    }
    """
    session = session_store.get(data["session_id"])

    if not session:
        raise HTTPException(401, "Invalid session")

    session_store.set_store(
        data["session_id"],
        data["store_id"],
        data["default_warehouse"],
    )

    return {"ok": True}