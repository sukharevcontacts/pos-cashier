from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db


router = APIRouter(prefix="/cashier", tags=["cashier"])


@router.get("/search")
async def search_shareholder(
    cashier_account: int = Query(...),
    store_id: int = Query(...),
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
):
    q_clean = q.strip()
    q_digits = "".join(ch for ch in q_clean if ch.isdigit())

    if not q_digits:
        raise HTTPException(status_code=400, detail="Введите номер П/С, телефон или номер заказа")

    # 1. Проверяем, что кассир имеет доступ к этой ТВТ
    access_sql = text("""
        SELECT
            cs.cashier_account,
            cs.store_id,
            so.owner_account,
            owner.balance::float AS owner_balance,
            cl.cash_balance::float AS cash_balance,
            cl.cash_limit::float AS cash_limit
        FROM coop.pos_cashier_stores cs
        JOIN coop.pos_store_owners so
            ON so.store_id = cs.store_id
           AND so.is_active = TRUE
        JOIN coop.pos_users owner
            ON owner.user_account = so.owner_account
        LEFT JOIN coop.pos_cashier_limit cl
            ON cl.cashier_account = cs.cashier_account
           AND cl.store_owner_account = so.owner_account
           AND cl.is_active = TRUE
        WHERE cs.cashier_account = :cashier_account
          AND cs.store_id = :store_id
          AND cs.is_active = TRUE
        LIMIT 1
    """)

    access_result = await db.execute(
        access_sql,
        {
            "cashier_account": cashier_account,
            "store_id": store_id,
        },
    )
    access = access_result.mappings().first()

    if not access:
        raise HTTPException(status_code=403, detail="Кассир не имеет доступа к этой ТВТ")

    # 2. Ищем пайщика:
    #    - если q совпал с номером заказа, берем пайщика из заказа
    #    - иначе ищем по user_account или user_phone
    user_sql = text("""
        WITH found_by_order AS (
            SELECT
                o.user_account
            FROM coop.pos_orders o
            WHERE o.order_number = :q_bigint
              AND o.status <> 'deleted'
            LIMIT 1
        ),
        found_user AS (
            SELECT
                u.user_account
            FROM coop.pos_users u
            WHERE u.user_account = :q_bigint
               OR regexp_replace(COALESCE(u.user_phone, ''), '\\D', '', 'g') = :q_digits
            LIMIT 1
        ),
        final_user AS (
            SELECT user_account FROM found_by_order
            UNION ALL
            SELECT user_account FROM found_user
            LIMIT 1
        )
        SELECT
            u.user_account,
            u.user_phone,
            u.user_name,
            u.user_fam,
            u.user_otch,
            u.address,
            u.email,
            u.date_of_birth,
            u.balance::float AS balance,
            u.photo_url
        FROM final_user fu
        JOIN coop.pos_users u
            ON u.user_account = fu.user_account
        WHERE u.is_active = TRUE
        LIMIT 1
    """)

    try:
        q_bigint = int(q_digits)
    except ValueError:
        q_bigint = -1

    user_result = await db.execute(
        user_sql,
        {
            "q_bigint": q_bigint,
            "q_digits": q_digits,
        },
    )
    user = user_result.mappings().first()

    if not user:
        raise HTTPException(status_code=404, detail="Пайщик или заказ не найден")

    user_account = user["user_account"]

    # 3. Заказы пайщика по выбранной ТВТ, кроме deleted
    orders_sql = text("""
        SELECT
            o.order_number,
            o.user_account,
            o.store_id,
            o.status,
            o.order_date,
            o.delivery_date,
            o.date_updated,
            COALESCE(SUM(
                CASE
                    WHEN od.line_status = 'active'
                    THEN od.qty_final * od.price
                    ELSE 0
                END
            ), 0)::float AS order_sum
        FROM coop.pos_orders o
        LEFT JOIN coop.pos_orders_data od
            ON od.order_number = o.order_number
        WHERE o.user_account = :user_account
          AND o.store_id = :store_id
          AND o.status <> 'deleted'
        GROUP BY
            o.order_number,
            o.user_account,
            o.store_id,
            o.status,
            o.order_date,
            o.delivery_date,
            o.date_updated
        ORDER BY
            CASE
                WHEN o.status = 'in_progress' THEN 1
                WHEN o.status = 'done' THEN 2
                ELSE 3
            END,
            CASE
                WHEN o.status = 'in_progress' THEN o.delivery_date
                ELSE NULL
            END DESC NULLS LAST,
            CASE
                WHEN o.status = 'done' THEN o.date_updated
                ELSE NULL
            END DESC NULLS LAST
    """)

    orders_result = await db.execute(
        orders_sql,
        {
            "user_account": user_account,
            "store_id": store_id,
        },
    )

    orders = []
    for row in orders_result.mappings().all():
        order = dict(row)

        if order["status"] == "in_progress":
            order["status_label"] = "Передан на выполнение"
        elif order["status"] == "done":
            order["status_label"] = "Выполнен"
        elif order["status"] == "deleted":
            order["status_label"] = "Удален"
        else:
            order["status_label"] = order["status"]

        orders.append(order)

    return {
        "ok": True,
        "cashier": {
            "cashier_account": cashier_account,
            "store_id": store_id,
        },
        "store": {
            "store_id": store_id,
            "owner_account": access["owner_account"],
            "owner_balance": access["owner_balance"],
            "cash_balance": access["cash_balance"] or 0,
            "cash_limit": access["cash_limit"] or 0,
        },
        "user": dict(user),
        "orders": orders,
    }


class CreateShareholderRequest(BaseModel):
    cashier_account: int = Field(..., description="Аккаунт кассира")
    store_id: int = Field(..., description="ТВТ")
    user_phone: str = Field(..., description="Телефон пайщика")
    user_name: str | None = Field(default=None, description="Имя")
    user_fam: str | None = Field(default=None, description="Фамилия")
    user_otch: str | None = Field(default=None, description="Отчество")
    address: str | None = Field(default=None, description="Адрес")
    date_of_birth: date | None = Field(default=None, description="Дата рождения")
    email: str | None = Field(default=None, description="Email")
    session_id: str | None = Field(default=None, description="ID сессии")
    device_id: str | None = Field(default="web", description="ID устройства")


@router.post("/users/create")
async def create_shareholder(
    payload: CreateShareholderRequest,
    db: AsyncSession = Depends(get_db),
):
    device_id = payload.device_id or "web"
    phone_digits = "".join(ch for ch in payload.user_phone if ch.isdigit())

    if len(phone_digits) < 10:
        raise HTTPException(status_code=400, detail="Введите корректный телефон пайщика")

    # 1. Проверяем доступ кассира к ТВТ и получаем данные владельца
    access_result = await db.execute(
        text("""
            SELECT
                cs.cashier_account,
                cs.store_id,
                so.owner_account,
                owner.balance::float AS owner_balance,
                COALESCE(cl.cash_balance, 0)::float AS cash_balance,
                COALESCE(cl.cash_limit, 0)::float AS cash_limit
            FROM coop.pos_cashier_stores cs
            JOIN coop.pos_store_owners so
                ON so.store_id = cs.store_id
               AND so.is_active = TRUE
            JOIN coop.pos_users owner
                ON owner.user_account = so.owner_account
            LEFT JOIN coop.pos_cashier_limit cl
                ON cl.cashier_account = cs.cashier_account
               AND cl.store_owner_account = so.owner_account
               AND cl.is_active = TRUE
            WHERE cs.cashier_account = :cashier_account
              AND cs.store_id = :store_id
              AND cs.is_active = TRUE
            LIMIT 1
        """),
        {
            "cashier_account": payload.cashier_account,
            "store_id": payload.store_id,
        },
    )

    access = access_result.mappings().first()

    if not access:
        raise HTTPException(status_code=403, detail="Кассир не имеет доступа к этой ТВТ")

    # 2. Проверяем, что такого телефона еще нет
    existing_result = await db.execute(
        text("""
            SELECT
                user_account,
                user_phone
            FROM coop.pos_users
            WHERE regexp_replace(COALESCE(user_phone, ''), '\\D', '', 'g') = :phone_digits
              AND is_active = TRUE
            LIMIT 1
        """),
        {
            "phone_digits": phone_digits,
        },
    )

    existing = existing_result.mappings().first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Пайщик с таким телефоном уже есть: П/С {existing['user_account']}",
        )

    # 3. Блокируем генерацию нового user_account
    await db.execute(
        text("""
            SELECT pg_advisory_xact_lock(hashtext('coop.pos_users_user_account_create'))
        """)
    )

    next_account_result = await db.execute(
        text("""
            SELECT
                GREATEST(
                    1000000,
                    COALESCE(MAX(user_account), 1000000)
                ) + 1 AS next_user_account
            FROM coop.pos_users
            WHERE user_type = 'person'
              AND user_account < 9000000
        """)
    )

    next_user_account = next_account_result.scalar_one()

    # 4. Создаем пайщика
    user_result = await db.execute(
        text("""
            INSERT INTO coop.pos_users (
                user_account,
                user_phone,
                user_name,
                user_fam,
                user_otch,
                address,
                date_of_birth,
                email,
                balance,
                user_type,
                is_active
            )
            VALUES (
                :user_account,
                :user_phone,
                NULLIF(trim(:user_name), ''),
                NULLIF(trim(:user_fam), ''),
                NULLIF(trim(:user_otch), ''),
                NULLIF(trim(:address), ''),
                CAST(:date_of_birth AS date),
                NULLIF(trim(:email), ''),
                0,
                'person',
                TRUE
            )
            RETURNING
                user_account,
                user_phone,
                user_name,
                user_fam,
                user_otch,
                address,
                date_of_birth,
                email,
                balance::float AS balance,
                photo_url
        """),
        {
            "user_account": next_user_account,
            "user_phone": phone_digits,
            "user_name": payload.user_name or "",
            "user_fam": payload.user_fam or "",
            "user_otch": payload.user_otch or "",
            "address": payload.address or "",
            "date_of_birth": payload.date_of_birth,
            "email": payload.email or "",
        },
    )

    user = user_result.mappings().first()

    # 5. Аудит
    await db.execute(
        text("""
            INSERT INTO coop.pos_cashier_actions (
                cashier_account,
                store_id,
                action_type,
                target_type,
                target_id,
                success,
                after_data,
                device_id
            )
            VALUES (
                :cashier_account,
                :store_id,
                'create_user',
                'user',
                :target_id,
                TRUE,
                jsonb_build_object(
                    'user_account', CAST(:user_account AS bigint),
                    'user_phone', CAST(:user_phone AS text),
                    'session_id', CAST(:session_id AS text)
                ),
                :device_id
            )
        """),
        {
            "cashier_account": payload.cashier_account,
            "store_id": payload.store_id,
            "target_id": str(next_user_account),
            "user_account": next_user_account,
            "user_phone": phone_digits,
            "session_id": payload.session_id,
            "device_id": device_id,
        },
    )

    await db.commit()

    return {
        "ok": True,
        "user": dict(user),
        "store": {
            "store_id": payload.store_id,
            "owner_account": access["owner_account"],
            "owner_balance": access["owner_balance"],
            "cash_balance": access["cash_balance"],
            "cash_limit": access["cash_limit"],
        },
        "orders": [],
    }
