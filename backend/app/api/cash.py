# backend/app/api/cash.py

from fastapi import APIRouter, Header, Query, HTTPException
from typing import Optional

from app.core.session import session_store
from app.services.paritet.cash import (
    transfer_cash,
    cashout_check,
    cashout_execute,
    replenish_balance_qr,
)

import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cash", tags=["cash"])


# =========================
# 💰 ПРИЕМ НАЛИЧНЫХ
# =========================
@router.post("/transfer")
async def transfer_cash_route(
    user_id: int = Query(...),
    amount: float = Query(...),
    store_id: int = Query(...),
    x_session_id: str = Header(...),
):
    session = session_store.get(x_session_id)
    if not session:
        raise HTTPException(401, "Invalid session")

    try:
        payload = await transfer_cash(
            token=session.token,
            tvt_id=store_id,
            user_id=user_id,
            amount=amount,
        )

        return {
            "ok": True,
            "payload": payload,
        }

    except Exception as e:
        logger.exception("Ошибка приема наличных")
        raise HTTPException(400, str(e))


# =========================
# 💸 ПРОВЕРКА ВЫДАЧИ
# =========================
@router.post("/cashout/check")
async def cashout_check_route(
    user_id: int = Query(...),
    amount: float = Query(...),
    store_id: int = Query(...),
    x_session_id: str = Header(...),
):
    session = session_store.get(x_session_id)
    if not session:
        raise HTTPException(401, "Invalid session")

    try:
        payload = await cashout_check(
            token=session.token,
            tvt_id=store_id,
            user_id=user_id,
            amount=amount,
        )

        return {
            "ok": True,
            "payload": payload,
        }

    except Exception as e:
        logger.exception("Ошибка проверки выдачи")
        raise HTTPException(400, str(e))


# =========================
# 💸 ВЫДАЧА НАЛИЧНЫХ (С PIN)
# =========================
@router.post("/cashout")
async def cashout_execute_route(
    user_id: int = Query(...),
    amount: float = Query(...),
    pin: str = Query(...),
    store_id: int = Query(...),
    x_session_id: str = Header(...),
):
    session = session_store.get(x_session_id)
    if not session:
        raise HTTPException(401, "Invalid session")

    try:
        payload = await cashout_execute(
            token=session.token,
            tvt_id=store_id,
            user_id=user_id,
            amount=amount,
            pin=pin,
        )

        return {
            "ok": True,
            "payload": payload,
        }

    except Exception as e:
        logger.exception("Ошибка выдачи наличных")
        raise HTTPException(400, str(e))


# =========================
# 📱 QR ДЛЯ ПОПОЛНЕНИЯ
# =========================
@router.post("/qr")
async def replenish_qr_route(
    amount: float = Query(...),
    login: str = Query(...),
    store_id: int = Query(...),
    x_session_id: str = Header(...),
):
    session = session_store.get(x_session_id)
    if not session:
        raise HTTPException(401, "Invalid session")

    try:
        payload = await replenish_balance_qr(
            token=session.token,
            tvt_id=store_id,
            amount=amount,
            login=login,
        )

        return {
            "ok": True,
            "amount": payload.get("amount"),
            "qr_url": payload.get("payload"),
            "qr_base64": payload.get("imagecontent"),
            "image_type": payload.get("imagemediatype"),
            "ttl": 15,
        }

    except Exception as e:
        logger.exception("Ошибка генерации QR")
        raise HTTPException(400, str(e))