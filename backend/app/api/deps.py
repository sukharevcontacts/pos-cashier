from fastapi import Header, HTTPException
from app.core.session import session_store


async def get_session(x_session_id: str = Header(...)):
    session = session_store.get(x_session_id)

    if not session:
        raise HTTPException(401, "Invalid session")

    if not session.tvt_id:
        raise HTTPException(400, "Store not selected")

    return session