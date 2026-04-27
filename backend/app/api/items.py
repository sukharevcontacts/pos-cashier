from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db


router = APIRouter(prefix="/cashier/items", tags=["items"])


@router.get("")
async def list_items_for_store(
    cashier_account: int = Query(...),
    store_id: int = Query(...),
    q: str | None = Query(default=None),
    category: str | None = Query(default=None),
    subcategory: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
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
            "cashier_account": cashier_account,
            "store_id": store_id,
        },
    )

    if not access_result.scalar():
        raise HTTPException(status_code=403, detail="Кассир не имеет доступа к этой ТВТ")

    q_clean = (q or "").strip()
    category_clean = (category or "").strip()
    subcategory_clean = (subcategory or "").strip()

    result = await db.execute(
        text("""
            SELECT
                pim.item,
                pim.item_name,
                pim.item_category,
                pim.item_subcategory,
                pim.photo_url,
                pim.supplier_account,
                pim.item_type,
                pim.avg_weight::float AS avg_weight,
                pim.pack,

                pil.store_id,
                pil.price::float AS price,
                pil.status,

                COALESCE(soh.item_stock, 0)::float AS item_stock,
                COALESCE(soh.reserve, 0)::float AS reserve,
                COALESCE(soh.item_stock - soh.reserve, 0)::float AS available_qty
            FROM coop.pos_item_loc pil
            JOIN coop.pos_item_master pim
                ON pim.item = pil.item
            LEFT JOIN coop.pos_stores_soh soh
                ON soh.store_id = pil.store_id
               AND soh.item = pil.item
            WHERE pil.store_id = :store_id
              AND pil.status = 1
              AND pil.is_active = TRUE
              AND pim.is_active = TRUE
              AND (:category = '' OR COALESCE(NULLIF(trim(pim.item_category), ''), 'Без категории') = :category)
              AND (:subcategory = '' OR COALESCE(NULLIF(trim(pim.item_subcategory), ''), 'Без подкатегории') = :subcategory)
              AND (
                    :q = ''
                    OR pim.item::text = :q
                    OR lower(pim.item_name) LIKE '%' || lower(:q) || '%'
                    OR lower(COALESCE(pim.item_category, '')) LIKE '%' || lower(:q) || '%'
                    OR lower(COALESCE(pim.item_subcategory, '')) LIKE '%' || lower(:q) || '%'
              )
            ORDER BY
                pim.item_category NULLS LAST,
                pim.item_subcategory NULLS LAST,
                pim.item_name
            LIMIT :limit
        """),
        {
            "cashier_account": cashier_account,
            "store_id": store_id,
            "q": q_clean,
            "category": category_clean,
            "subcategory": subcategory_clean,
            "limit": limit,
        },
    )

    return {
        "ok": True,
        "items": [dict(row) for row in result.mappings().all()],
    }


@router.get("/categories")
async def list_item_categories_for_store(
    cashier_account: int = Query(...),
    store_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
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
            "cashier_account": cashier_account,
            "store_id": store_id,
        },
    )

    if not access_result.scalar():
        raise HTTPException(status_code=403, detail="Кассир не имеет доступа к этой ТВТ")

    result = await db.execute(
        text("""
            SELECT
                COALESCE(NULLIF(trim(pim.item_category), ''), 'Без категории') AS category,
                COALESCE(NULLIF(trim(pim.item_subcategory), ''), 'Без подкатегории') AS subcategory,
                COUNT(*)::int AS items_count
            FROM coop.pos_item_loc pil
            JOIN coop.pos_item_master pim
                ON pim.item = pil.item
            LEFT JOIN coop.pos_stores_soh soh
                ON soh.store_id = pil.store_id
               AND soh.item = pil.item
            WHERE pil.store_id = :store_id
              AND pil.status = 1
              AND pil.is_active = TRUE
              AND pim.is_active = TRUE
            GROUP BY
                COALESCE(NULLIF(trim(pim.item_category), ''), 'Без категории'),
                COALESCE(NULLIF(trim(pim.item_subcategory), ''), 'Без подкатегории')
            ORDER BY
                category,
                subcategory
        """),
        {
            "store_id": store_id,
        },
    )

    rows = [dict(row) for row in result.mappings().all()]

    categories_map = {}

    for row in rows:
        category = row["category"]
        subcategory = row["subcategory"]
        items_count = row["items_count"]

        if category not in categories_map:
            categories_map[category] = {
                "category": category,
                "items_count": 0,
                "subcategories": [],
            }

        categories_map[category]["items_count"] += items_count
        categories_map[category]["subcategories"].append({
            "subcategory": subcategory,
            "items_count": items_count,
        })

    return {
        "ok": True,
        "categories": list(categories_map.values()),
    }
