from fastapi import APIRouter, HTTPException, Query, Header
from pydantic import BaseModel, Field
from typing import Optional, List, Dict

from app.db.db_methods_pg import save_pos_order_done_event

from app.core.session import session_store
from app.services.paritet.orders import (
    get_order_details as paritet_get_order,
    create_order as paritet_create_order,
    cancel_order as paritet_cancel_order,
    replenish_balance_qr as paritet_replenish_balance_qr,
    done_order as paritet_done_order,
)

import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cashier/orders", tags=["orders"])


# =========================
# GET ORDER
# =========================

@router.get("/{order_number}")
async def get_order_details(
    order_number: int,
    store_id: int = Query(...),
    device_id: str = Query("web"),
    x_session_id: str = Header(...),
):
    session = session_store.get(x_session_id)
    if not session:
        raise HTTPException(401, "Invalid session")

    try:
        result = await paritet_get_order(
            token=session.token,
            tvt_id=store_id,
            order_number=order_number,
        )

        return {
            "ok": True,
            "readonly": result["readonly"],
            "order": result["order"],
            "store": {
                "store_id": store_id,
                "owner_account": None,
                "owner_balance": None,
                "cash_balance": 0,
                "cash_limit": 0,
            },
            "lines": result["lines"],
        }

    except Exception as e:
        logger.exception("Ошибка получения заказа")
        raise HTTPException(400, str(e))


# =========================
# SAVE ORDER (PARITET)
# =========================

class SaveOrderRequest(BaseModel):
    cashier_account: int
    store_id: int
    user_id: int
    lines: List[Dict]
    session_id: Optional[str] = None
    device_id: Optional[str] = "web"


@router.post("/{order_number}/save")
async def save_order(
    order_number: int,
    payload: SaveOrderRequest,
    x_session_id: str = Header(...),
):
    session = session_store.get(x_session_id)
    if not session:
        raise HTTPException(401, "Invalid session")

    try:
        # =========================
        # 1. МАППИНГ lines -> items
        # =========================
        items = [
            {
                "id": line["item"],
                "count": float(line.get("qty_final", 0)),
            }
            for line in payload.lines
            if float(line.get("qty_final", 0)) > 0
        ]

        if not items:
            raise HTTPException(400, "Нет товаров для сохранения")

        # =========================
        # 2. СОХРАНЕНИЕ В PARITET
        # =========================
        create_result = await paritet_create_order(
            token=session.token,
            tvt_id=payload.store_id,
            user_id=payload.user_id,
            order_number=order_number,
            items=items,
        )

        # =========================
        # 3. ОПРЕДЕЛЯЕМ НОМЕР ЗАКАЗА
        # =========================
        # если был новый заказ → берем из ответа
        actual_order_number = int(create_result.get("number") or order_number)

        # =========================
        # 4. ПЕРЕЧИТЫВАЕМ АКТУАЛЬНЫЙ ЗАКАЗ
        # =========================
        result = await paritet_get_order(
            token=session.token,
            tvt_id=payload.store_id,
            order_number=actual_order_number,
        )

        return {
            "ok": True,
            "order_number": actual_order_number,
            "readonly": result["readonly"],
            "order": result["order"],
            "lines": result["lines"],
        }

    except HTTPException:
        raise

    except Exception as e:
        logger.exception("Ошибка сохранения заказа")
        raise HTTPException(400, str(e))


# =========================
# CANCEL ORDER
# =========================

@router.post("/{order_number}/cancel")
async def cancel_order_route(
    order_number: int,
    store_id: int = Query(...),
    x_session_id: str = Header(...),
):
    session = session_store.get(x_session_id)
    if not session:
        raise HTTPException(401, "Invalid session")

    try:
        await paritet_cancel_order(
            token=session.token,
            tvt_id=store_id,
            order_number=order_number,
        )

        return {
            "ok": True,
            "order_number": order_number,
        }

    except Exception as e:
        logger.exception("Ошибка отмены заказа")
        raise HTTPException(400, str(e))


@router.post("/{order_number}/pay")
async def generate_order_payment_qr(
    order_number: int,
    store_id: int = Query(...),
    user_id: int = Query(...),
    amount: float = Query(...),
    x_session_id: str = Header(...),
):
    session = session_store.get(x_session_id)
    if not session:
        raise HTTPException(401, "Invalid session")

    try:
        data = await paritet_replenish_balance_qr(
            token=session.token,
            tvt_id=store_id,
            user_id=user_id,
            order_number=order_number,
            amount=amount,
        )

        return {
            "ok": True,
            "order_number": order_number,
            "amount": data.get("amount"),
            "qr_url": data.get("payload"),
            "qr_base64": data.get("imagecontent"),
            "image_type": data.get("imagemediatype"),
            "ttl": 15,
        }

    except Exception as e:
        logger.exception("Ошибка генерации QR оплаты")
        raise HTTPException(400, str(e))

@router.post("/{order_number}/done")
async def done_order_route(
    order_number: int,
    store_id: int = Query(...),
    user_account: str = Query(...),
    x_session_id: str = Header(...),
):
    session = session_store.get(x_session_id)
    if not session:
        raise HTTPException(401, "Invalid session")

    try:
        data = await paritet_done_order(
            token=session.token,
            tvt_id=store_id,
            order_number=order_number,
        )

        ok = data.get("code") == 200
        payload = data.get("payload") or {}

        if ok:
            try:
                stat_result = await save_pos_order_done_event(
                    user_account=str(user_account),
                    order_id=int(order_number),
                    store_id=int(store_id),
                )

                if stat_result is False:
                    logger.error(
                        "Заказ проведён в Paritet, но не удалось записать событие выкупа: "
                        f"order_number={order_number}, "
                        f"user_account={user_account}, "
                        f"store_id={store_id}"
                    )

            except Exception:
                logger.exception(
                    "Заказ проведён в Paritet, но запись события выкупа завершилась ошибкой: "
                    f"order_number={order_number}, "
                    f"user_account={user_account}, "
                    f"store_id={store_id}"
                )

        return {
            "ok": data.get("code") == 200,
            "order_number": order_number,
            "error": data.get("error"),
            "payload": data.get("payload") or {},
        }

    except Exception as e:
        logger.exception("Ошибка проведения заказа")
        raise HTTPException(400, str(e))


# =========================
# LOCKS (оставляем локально)
# =========================

@router.post("/{order_number}/unlock")
async def unlock_order(
    order_number: int,
    cashier_account: int = Query(...),
    session_id: str = Query(...),
    device_id: str = Query("web"),
    db=None,
):
    # если хочешь — позже выпилим полностью
    return {
        "ok": True,
        "order_number": order_number,
    }


@router.post("/{order_number}/heartbeat")
async def heartbeat_order_lock(
    order_number: int,
    cashier_account: int = Query(...),
    session_id: str = Query(...),
    device_id: str = Query("web"),
    db=None,
):
    return {
        "ok": True,
        "order_number": order_number,
    }