from typing import Any, Optional
import logging

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.session import session_store
from app.db.db_methods_pg import (
    add_pos_cashier_tablet_item,
    delete_pos_cashier_tablet_item,
    get_pos_cashier_tablet_items,
    reorder_pos_cashier_tablet_items,
    update_pos_cashier_tablet_item_state,
)
from app.services.paritet.products import find_products


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cashier/tablet", tags=["cashier-tablet"])


class AddTabletItemRequest(BaseModel):
    store_id: int = Field(..., ge=1)
    product_id: int = Field(..., ge=1)
    cashier_account: Optional[str] = None


class ReorderTabletItemsRequest(BaseModel):
    store_id: int = Field(..., ge=1)
    product_ids: list[int] = Field(default_factory=list)
    cashier_account: Optional[str] = None


class DeleteTabletItemRequest(BaseModel):
    store_id: int = Field(..., ge=1)
    product_id: int = Field(..., ge=1)
    cashier_account: Optional[str] = None


def _to_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _good_id(good: dict[str, Any]) -> int:
    return _to_int(good.get("id") or good.get("good_id") or good.get("item"), 0)


def _good_name(good: dict[str, Any]) -> str:
    return str(good.get("name") or good.get("good_name") or good.get("item_name") or "")


def _good_code(good: dict[str, Any]) -> Optional[str]:
    code = good.get("code")
    return str(code) if code is not None else None


def _good_unit(good: dict[str, Any]) -> Optional[str]:
    unit = good.get("unit") or good.get("pack")
    return str(unit) if unit is not None else None


def _good_photo_url(good: dict[str, Any]) -> Optional[str]:
    photo_url = good.get("preview") or good.get("photo_url")
    return str(photo_url) if photo_url else None


def _good_isfractional(good: dict[str, Any]) -> Optional[bool]:
    value = good.get("isfractional")

    if value is None:
        return None

    return bool(value)


def _is_good_available(good: dict[str, Any]) -> bool:
    item_stock = _to_float(good.get("count"), 0.0)
    available_qty = _to_float(good.get("availablecount"), item_stock)
    return available_qty > 0


def _fallback_from_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "product_name": row.get("product_name") or "",
        "product_code": row.get("product_code"),
        "product_unit": row.get("product_unit"),
        "product_isfractional": row.get("product_isfractional"),
        "product_photo_url": row.get("product_photo_url"),
    }


def _tablet_item_response(
    row: dict[str, Any],
    good: Optional[dict[str, Any]],
    is_available: bool,
) -> dict[str, Any]:
    fallback = _fallback_from_row(row)

    return {
        "id": row.get("id"),
        "store_id": row.get("store_id"),
        "product_id": row.get("product_id"),
        "sort_order": row.get("sort_order"),
        "is_active": row.get("is_active"),
        "is_available": is_available,
        "name": _good_name(good) if good else fallback["product_name"],
        "code": _good_code(good) if good else fallback["product_code"],
        "unit": _good_unit(good) if good else fallback["product_unit"],
        "isfractional": _good_isfractional(good) if good else fallback["product_isfractional"],
        "photo_url": _good_photo_url(good) if good else fallback["product_photo_url"],
        "product": good,
        "fallback": fallback,
        "last_synced_at": row.get("last_synced_at"),
        "last_available_at": row.get("last_available_at"),
        "last_unavailable_at": row.get("last_unavailable_at"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


def _get_session_or_401(x_session_id: str):
    session = session_store.get(x_session_id)

    if not session:
        raise HTTPException(401, "Invalid session")

    return session


def _ensure_selected_store(session, store_id: int):
    if not session.tvt_id:
        raise HTTPException(400, "Store not selected")

    if int(session.tvt_id) != int(store_id):
        raise HTTPException(400, "Selected store does not match store_id")


async def _load_paritet_goods_by_id(token: str, store_id: int, product_ids: list[int]) -> dict[int, dict[str, Any]]:
    if not product_ids:
        return {}

    goods = await find_products(token, int(store_id), product_ids)

    result: dict[int, dict[str, Any]] = {}
    for good in goods or []:
        product_id = _good_id(good)
        if product_id:
            result[product_id] = good

    return result


async def _build_tablet_response(
    *,
    store_id: int,
    token: str,
    cashier_account: Optional[str] = None,
) -> dict[str, Any]:
    rows = await get_pos_cashier_tablet_items(int(store_id))

    if rows is False:
        raise HTTPException(500, "Ошибка получения планшета товаров")

    rows = rows or []
    product_ids = [_to_int(row.get("product_id"), 0) for row in rows if _to_int(row.get("product_id"), 0)]
    goods_by_id = await _load_paritet_goods_by_id(token, int(store_id), product_ids)

    items: list[dict[str, Any]] = []

    for row in rows:
        product_id = _to_int(row.get("product_id"), 0)
        good = goods_by_id.get(product_id)
        is_available = bool(good and _is_good_available(good))

        update_result = await update_pos_cashier_tablet_item_state(
            store_id=int(store_id),
            product_id=product_id,
            is_available=is_available,
            product_name=_good_name(good) if good else None,
            product_code=_good_code(good) if good else None,
            product_unit=_good_unit(good) if good else None,
            product_isfractional=_good_isfractional(good) if good else None,
            product_photo_url=_good_photo_url(good) if good else None,
            cashier_account=cashier_account,
        )

        if update_result is False:
            logger.warning(
                "Не удалось обновить состояние товара планшета: store_id=%s product_id=%s",
                store_id,
                product_id,
            )

        items.append(_tablet_item_response(row, good, is_available))

    return {
        "ok": True,
        "store_id": int(store_id),
        "items": items,
    }


@router.get("")
async def get_cashier_tablet(
    store_id: int = Query(..., ge=1),
    cashier_account: Optional[str] = Query(None),
    x_session_id: str = Header(...),
):
    session = _get_session_or_401(x_session_id)
    _ensure_selected_store(session, store_id)

    try:
        return await _build_tablet_response(
            store_id=int(store_id),
            token=session.token,
            cashier_account=cashier_account,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Ошибка получения планшета товаров")
        raise HTTPException(400, str(e))


@router.post("/items")
async def add_cashier_tablet_item(
    payload: AddTabletItemRequest,
    x_session_id: str = Header(...),
):
    session = _get_session_or_401(x_session_id)
    _ensure_selected_store(session, payload.store_id)

    try:
        goods_by_id = await _load_paritet_goods_by_id(
            session.token,
            int(payload.store_id),
            [int(payload.product_id)],
        )
        good = goods_by_id.get(int(payload.product_id))

        if not good:
            raise HTTPException(404, "Товар не найден для выбранной точки")

        if not _is_good_available(good):
            raise HTTPException(400, "Товар недоступен для выбранной точки")

        result = await add_pos_cashier_tablet_item(
            store_id=int(payload.store_id),
            product_id=int(payload.product_id),
            product_name=_good_name(good),
            product_code=_good_code(good),
            product_unit=_good_unit(good),
            product_isfractional=_good_isfractional(good),
            product_photo_url=_good_photo_url(good),
            cashier_account=payload.cashier_account,
        )

        if result is False:
            raise HTTPException(500, "Ошибка добавления товара в планшет")

        return await _build_tablet_response(
            store_id=int(payload.store_id),
            token=session.token,
            cashier_account=payload.cashier_account,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Ошибка добавления товара в планшет")
        raise HTTPException(400, str(e))


@router.delete("/items/{product_id}")
async def delete_cashier_tablet_item(
    product_id: int,
    store_id: int = Query(..., ge=1),
    cashier_account: Optional[str] = Query(None),
    x_session_id: str = Header(...),
):
    session = _get_session_or_401(x_session_id)
    _ensure_selected_store(session, store_id)

    try:
        result = await delete_pos_cashier_tablet_item(
            store_id=int(store_id),
            product_id=int(product_id),
            cashier_account=cashier_account,
        )

        if result is False:
            raise HTTPException(500, "Ошибка удаления товара из планшета")

        return await _build_tablet_response(
            store_id=int(store_id),
            token=session.token,
            cashier_account=cashier_account,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Ошибка удаления товара из планшета")
        raise HTTPException(400, str(e))


@router.post("/items/delete")
async def delete_cashier_tablet_item_post(
    payload: DeleteTabletItemRequest,
    x_session_id: str = Header(...),
):
    return await delete_cashier_tablet_item(
        product_id=int(payload.product_id),
        store_id=int(payload.store_id),
        cashier_account=payload.cashier_account,
        x_session_id=x_session_id,
    )


@router.post("/reorder")
async def reorder_cashier_tablet_items(
    payload: ReorderTabletItemsRequest,
    x_session_id: str = Header(...),
):
    session = _get_session_or_401(x_session_id)
    _ensure_selected_store(session, payload.store_id)

    try:
        product_ids = [int(product_id) for product_id in payload.product_ids if int(product_id) > 0]

        result = await reorder_pos_cashier_tablet_items(
            store_id=int(payload.store_id),
            product_ids=product_ids,
            cashier_account=payload.cashier_account,
        )

        if result is False:
            raise HTTPException(500, "Ошибка сохранения порядка планшета")

        return await _build_tablet_response(
            store_id=int(payload.store_id),
            token=session.token,
            cashier_account=payload.cashier_account,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Ошибка сохранения порядка планшета")
        raise HTTPException(400, str(e))
