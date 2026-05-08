from fastapi import APIRouter, HTTPException, Header, Query
from typing import Optional
import logging

from app.core.session import session_store
from app.services.paritet.catalog import get_catalog
from app.services.paritet.products import find_products, find_product_by_barcode
from app.services.paritet.stock import (
    post_goods as paritet_post_goods,
    writeoff_goods as paritet_writeoff_goods,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cashier/items", tags=["items"])


@router.get("/search")
async def search_products(
    q: Optional[str] = Query(None),
    barcode: Optional[str] = Query(None),
    ids: Optional[str] = Query(None),
    x_session_id: str = Header(...),
    store_id: int = Header(...)
):
    session = session_store.get(x_session_id)
    if not session:
        raise HTTPException(401, "Invalid session")

    try:
        # 🔹 поиск по ids
        if ids:
            try:
                id_list = [int(x) for x in ids.split(",") if x.strip()]
            except ValueError:
                raise HTTPException(400, "Invalid ids format")

            goods = await find_products(session.token, store_id, id_list)

            return {
                "goods": goods,
                "categories": []
            }

        # 🔹 поиск по штрихкоду
        if barcode:
            good = await find_product_by_barcode(session.token, store_id, barcode)

            return {
                "goods": [good] if good else [],
                "categories": []
            }

        # 🔹 поиск по названию
        if q:
            warehouse_id = session.warehouse_id
            payload = await get_catalog(
                token=session.token,
                tvt_id=store_id,
                body={
                    "text": q,
                    "category": -1,
                    "preview_width": 240,
                    "preview_height": 320,
                    "showavailable": True,
                    "warehouse": warehouse_id
                }
            )

            return {
                "goods": payload.get("goods", []),
                "categories": payload.get("categories", [])
            }

        # 🔹 просто каталог (верхний уровень)
        warehouse_id = session.warehouse_id
        payload = await get_catalog(
            token=session.token,
            tvt_id=store_id,
            body={
                "category": -1,
                "preview_width": 240,
                "preview_height": 320,
                "warehouse": warehouse_id
            }
        )

        return {
            "goods": payload.get("goods", []),
            "categories": payload.get("categories", [])
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Ошибка поиска товаров")
        raise HTTPException(400, str(e))


@router.post("/goods/post")
async def post_goods_route(
    product_id: int = Query(...),
    count: float = Query(...),
    store_id: int = Query(...),
    comment: Optional[str] = Query(None),
    x_session_id: str = Header(...),
):
    session = session_store.get(x_session_id)
    if not session:
        raise HTTPException(401, "Invalid session")

    try:
        await paritet_post_goods(
            token=session.token,
            tvt_id=store_id,
            warehouse_id=session.warehouse_id,
            product_id=product_id,
            count=count,
        )

        return {
            "ok": True,
            "product_id": product_id,
        }

    except Exception as e:
        logger.exception("Ошибка оприходования товара")
        raise HTTPException(400, str(e))


@router.post("/goods/writeoff")
async def writeoff_goods_route(
    product_id: int = Query(...),
    count: float = Query(...),
    store_id: int = Query(...),
    comment: Optional[str] = Query(None),
    x_session_id: str = Header(...),
):
    session = session_store.get(x_session_id)
    if not session:
        raise HTTPException(401, "Invalid session")

    try:
        await paritet_writeoff_goods(
            token=session.token,
            tvt_id=store_id,
            warehouse_id=session.warehouse_id,
            product_id=product_id,
            count=count,
        )

        return {
            "ok": True,
            "product_id": product_id,
        }

    except Exception as e:
        logger.exception("Ошибка списания товара")
        raise HTTPException(400, str(e))
