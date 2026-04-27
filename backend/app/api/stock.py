from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db


router = APIRouter(prefix="/cashier/stock", tags=["stock"])


class StockReceiptRequest(BaseModel):
    cashier_account: int = Field(..., description="Аккаунт кассира")
    store_id: int = Field(..., description="ТВТ")
    item: int = Field(..., description="Код товара")
    qty_delta: Decimal = Field(..., description="Количество прихода")
    comment: str | None = Field(default=None, description="Комментарий")
    session_id: str | None = Field(default=None, description="ID сессии")
    device_id: str | None = Field(default="web", description="ID устройства")


@router.post("/receipt")
async def stock_receipt(
    payload: StockReceiptRequest,
    db: AsyncSession = Depends(get_db),
):
    device_id = payload.device_id or "web"
    qty_delta = Decimal(str(payload.qty_delta))

    if qty_delta <= 0:
        raise HTTPException(status_code=400, detail="Количество прихода должно быть больше нуля")

    # 1. Проверяем доступ кассира к ТВТ
    access_result = await db.execute(
        text("""
            SELECT 1
            FROM coop.pos_cashier_stores cs
            JOIN coop.pos_stores s
                ON s.store_id = cs.store_id
            WHERE cs.cashier_account = :cashier_account
              AND cs.store_id = :store_id
              AND cs.is_active = TRUE
              AND s.is_active = TRUE
            LIMIT 1
        """),
        {
            "cashier_account": payload.cashier_account,
            "store_id": payload.store_id,
        },
    )

    if not access_result.scalar():
        raise HTTPException(status_code=403, detail="Кассир не имеет доступа к этой ТВТ")

    # 2. Проверяем товар на ТВТ
    item_result = await db.execute(
        text("""
            SELECT
                pim.item,
                pim.item_name,
                pim.item_type,
                pim.avg_weight,
                pim.pack,
                pil.price,
                pil.status
            FROM coop.pos_item_loc pil
            JOIN coop.pos_item_master pim
                ON pim.item = pil.item
            WHERE pil.store_id = :store_id
              AND pil.item = :item
              AND pil.status = 1
              AND pil.is_active = TRUE
              AND pim.is_active = TRUE
            LIMIT 1
        """),
        {
            "store_id": payload.store_id,
            "item": payload.item,
        },
    )

    item = item_result.mappings().first()

    if not item:
        raise HTTPException(status_code=404, detail="Товар не найден или недоступен на этой ТВТ")

    if item["item_type"] == "piece" and qty_delta != qty_delta.to_integral_value():
        raise HTTPException(status_code=400, detail="Для штучного товара количество прихода должно быть целым")

    if item["item_type"] == "weight":
        if (qty_delta * Decimal("1000")) != (qty_delta * Decimal("1000")).to_integral_value():
            raise HTTPException(status_code=400, detail="Весовой товар можно приходовать кратно 1 грамму")

    # 3. Если по какой-то причине строки остатка нет — создаем
    await db.execute(
        text("""
            INSERT INTO coop.pos_stores_soh (
                store_id,
                item,
                item_stock,
                reserve
            )
            VALUES (
                :store_id,
                :item,
                0,
                0
            )
            ON CONFLICT (store_id, item) DO NOTHING
        """),
        {
            "store_id": payload.store_id,
            "item": payload.item,
        },
    )

    # 4. Блокируем остаток
    soh_result = await db.execute(
        text("""
            SELECT
                store_id,
                item,
                item_stock,
                reserve
            FROM coop.pos_stores_soh
            WHERE store_id = :store_id
              AND item = :item
            FOR UPDATE
        """),
        {
            "store_id": payload.store_id,
            "item": payload.item,
        },
    )

    soh = soh_result.mappings().first()

    if not soh:
        raise HTTPException(status_code=500, detail="Не удалось получить остаток товара")

    stock_before = Decimal(str(soh["item_stock"]))
    reserve_before = Decimal(str(soh["reserve"]))
    stock_after = stock_before + qty_delta

    if stock_after < reserve_before:
        raise HTTPException(status_code=400, detail="Остаток не может стать меньше резерва")

    # 5. Увеличиваем item_stock, reserve не трогаем
    await db.execute(
        text("""
            UPDATE coop.pos_stores_soh
            SET
                item_stock = CAST(:stock_after AS numeric),
                updated_at = now()
            WHERE store_id = :store_id
              AND item = :item
        """),
        {
            "stock_after": stock_after,
            "store_id": payload.store_id,
            "item": payload.item,
        },
    )

    # 6. Аудит
    await db.execute(
        text("""
            INSERT INTO coop.pos_cashier_actions (
                cashier_account,
                store_id,
                action_type,
                target_type,
                target_id,
                success,
                before_data,
                after_data,
                device_id
            )
            VALUES (
                :cashier_account,
                :store_id,
                'stock_receipt',
                'item',
                :target_id,
                TRUE,
                jsonb_build_object(
                    'item_stock', CAST(:stock_before AS numeric),
                    'reserve', CAST(:reserve_before AS numeric)
                ),
                jsonb_build_object(
                    'item', CAST(:item AS bigint),
                    'item_name', CAST(:item_name AS text),
                    'qty_delta', CAST(:qty_delta AS numeric),
                    'item_stock', CAST(:stock_after AS numeric),
                    'reserve', CAST(:reserve_before AS numeric),
                    'comment', CAST(:comment AS text),
                    'session_id', CAST(:session_id AS text)
                ),
                :device_id
            )
        """),
        {
            "cashier_account": payload.cashier_account,
            "store_id": payload.store_id,
            "target_id": str(payload.item),
            "item": payload.item,
            "item_name": item["item_name"],
            "qty_delta": qty_delta,
            "stock_before": stock_before,
            "stock_after": stock_after,
            "reserve_before": reserve_before,
            "comment": payload.comment or "",
            "session_id": payload.session_id,
            "device_id": device_id,
        },
    )

    await db.commit()

    return {
        "ok": True,
        "store_id": payload.store_id,
        "item": payload.item,
        "item_name": item["item_name"],
        "item_type": item["item_type"],
        "qty_delta": float(qty_delta),
        "item_stock_before": float(stock_before),
        "item_stock_after": float(stock_after),
        "reserve": float(reserve_before),
        "available_qty_after": float(stock_after - reserve_before),
    }
