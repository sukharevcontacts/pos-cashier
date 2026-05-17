from app.db.db_pool_pg import get_db_pool
import asyncio
from typing import Optional, List, Dict, Any, Set
import pandas as pd
from datetime import date, datetime
import json
import uuid

import logging

logger = logging.getLogger(__name__)


async def get_order_store():
    pool = await get_db_pool()
    try:
        async with pool.connection() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute("""
                                     select 
                                        store_id, 
                                        store_description,
                                        store_short_desc,
                                        default_store,
                                        master_store,
                                        registeredid,
                                        wh_id,
                                        time_zone,
                                        virtual
                                    from coop.get_order_store()
                                    """)
                rows = await cursor.fetchall()
                columns = [column[0] for column in cursor.description]
                return [dict(zip(columns, row)) for row in rows]

    except Exception as e:
        logger.error(f"Ошибка при выполнении процедуры: {e}")
        return False

async def get_pos_cashier_settings(cashier_account: str):
    """
    Получить настройки кассира по cashier_account.

    cashier_account может быть как числовым в виде строки ('1000728'),
    так и текстовым ('vs_2024').
    """
    pool = await get_db_pool()
    try:
        async with pool.connection() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute(
                    """
                    select
                        cashier_account,
                        screen_profile,
                        appearance_theme,
                        settings_json,
                        created_at,
                        updated_at
                    from coop.get_pos_cashier_settings(%s)
                    """,
                    (str(cashier_account),)
                )

                rows = await cursor.fetchall()
                columns = [column[0] for column in cursor.description]

                result = [dict(zip(columns, row)) for row in rows]
                return result[0] if result else None

    except Exception as e:
        logger.error(f"Ошибка при получении настроек кассира: {e}")
        return False


async def save_pos_cashier_settings(
    cashier_account: str,
    screen_profile: str = "auto",
    appearance_theme: str = "default",
    settings_json: Optional[Dict[str, Any]] = None
):
    """
    Сохранить настройки кассира.

    Запись/обновление делается внутри функции БД через MERGE.
    """
    pool = await get_db_pool()
    try:
        settings_json = settings_json or {}

        async with pool.connection() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute(
                    """
                    select
                        cashier_account,
                        screen_profile,
                        appearance_theme,
                        settings_json,
                        created_at,
                        updated_at
                    from coop.save_pos_cashier_settings(%s, %s, %s, %s::jsonb)
                    """,
                    (
                        str(cashier_account),
                        screen_profile or "auto",
                        appearance_theme or "default",
                        json.dumps(settings_json, ensure_ascii=False),
                    )
                )

                rows = await cursor.fetchall()
                columns = [column[0] for column in cursor.description]

                result = [dict(zip(columns, row)) for row in rows]
                return result[0] if result else None

    except Exception as e:
        logger.error(f"Ошибка при сохранении настроек кассира: {e}")
        return False


async def save_pos_order_done_event(
    user_account: str,
    order_id: int,
    store_id: int,
):
    """
    Сохранить факт успешного выкупа/проведения заказа.

    Используется после успешного done_order в Paritet.
    Запись/обновление делается внутри функции БД через MERGE.
    """
    pool = await get_db_pool()
    try:
        async with pool.connection() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute(
                    """
                    select
                        user_account,
                        order_id,
                        store_id
                    from coop.save_pos_order_done_event(%s, %s, %s)
                    """,
                    (
                        str(user_account),
                        int(order_id),
                        int(store_id),
                    ),
                )

                rows = await cursor.fetchall()
                columns = [column[0] for column in cursor.description]

                result = [dict(zip(columns, row)) for row in rows]
                return result[0] if result else None

    except Exception as e:
        logger.error(f"Ошибка при сохранении факта выкупа заказа: {e}")
        return False


# --- POS cashier tablet items helpers ---

_POS_CASHIER_TABLET_COLUMNS = """
    id,
    store_id,
    product_id,
    sort_order,
    is_active,
    product_name,
    product_code,
    product_unit,
    product_isfractional,
    product_photo_url,
    last_synced_at,
    last_available_at,
    last_unavailable_at,
    created_by_cashier_account,
    updated_by_cashier_account,
    created_at,
    updated_at
"""


def _rows_to_dicts(cursor, rows):
    columns = [column[0] for column in cursor.description]
    return [dict(zip(columns, row)) for row in rows]


async def get_pos_cashier_tablet_items(store_id: int):
    """
    Получить активные карточки планшета быстрых товаров для точки выдачи.
    """
    pool = await get_db_pool()
    try:
        async with pool.connection() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute(
                    f"""
                    select
                        {_POS_CASHIER_TABLET_COLUMNS}
                    from coop.get_pos_cashier_tablet_items(%s)
                    """,
                    (int(store_id),),
                )

                rows = await cursor.fetchall()
                return _rows_to_dicts(cursor, rows)

    except Exception as e:
        logger.error(f"Ошибка при получении планшета быстрых товаров: {e}")
        return False


async def add_pos_cashier_tablet_item(
    store_id: int,
    product_id: int,
    product_name: str = "",
    product_code: Optional[str] = None,
    product_unit: Optional[str] = None,
    product_isfractional: Optional[bool] = None,
    product_photo_url: Optional[str] = None,
    cashier_account: Optional[str] = None,
):
    """
    Добавить товар в планшет точки выдачи или активировать его повторно.
    Возвращает обновлённый список активных карточек планшета.
    """
    pool = await get_db_pool()
    try:
        async with pool.connection() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute(
                    f"""
                    select
                        {_POS_CASHIER_TABLET_COLUMNS}
                    from coop.add_pos_cashier_tablet_item(%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        int(store_id),
                        int(product_id),
                        product_name or "",
                        product_code,
                        product_unit,
                        product_isfractional,
                        product_photo_url,
                        str(cashier_account) if cashier_account else None,
                    ),
                )

                rows = await cursor.fetchall()
                return _rows_to_dicts(cursor, rows)

    except Exception as e:
        logger.error(f"Ошибка при добавлении товара в планшет быстрых товаров: {e}")
        return False


async def delete_pos_cashier_tablet_item(
    store_id: int,
    product_id: int,
    cashier_account: Optional[str] = None,
):
    """
    Мягко удалить товар из планшета точки выдачи.
    Возвращает обновлённый список активных карточек планшета.
    """
    pool = await get_db_pool()
    try:
        async with pool.connection() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute(
                    f"""
                    select
                        {_POS_CASHIER_TABLET_COLUMNS}
                    from coop.delete_pos_cashier_tablet_item(%s, %s, %s)
                    """,
                    (
                        int(store_id),
                        int(product_id),
                        str(cashier_account) if cashier_account else None,
                    ),
                )

                rows = await cursor.fetchall()
                return _rows_to_dicts(cursor, rows)

    except Exception as e:
        logger.error(f"Ошибка при удалении товара из планшета быстрых товаров: {e}")
        return False


async def reorder_pos_cashier_tablet_items(
    store_id: int,
    product_ids: List[int],
    cashier_account: Optional[str] = None,
):
    """
    Сохранить новый порядок карточек планшета точки выдачи.
    product_ids — список product_id в нужном порядке.
    Возвращает обновлённый список активных карточек планшета.
    """
    pool = await get_db_pool()
    try:
        normalized_product_ids = [int(product_id) for product_id in (product_ids or []) if int(product_id) > 0]

        async with pool.connection() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute(
                    f"""
                    select
                        {_POS_CASHIER_TABLET_COLUMNS}
                    from coop.reorder_pos_cashier_tablet_items(%s, %s::integer[], %s)
                    """,
                    (
                        int(store_id),
                        normalized_product_ids,
                        str(cashier_account) if cashier_account else None,
                    ),
                )

                rows = await cursor.fetchall()
                return _rows_to_dicts(cursor, rows)

    except Exception as e:
        logger.error(f"Ошибка при сохранении порядка планшета быстрых товаров: {e}")
        return False


async def update_pos_cashier_tablet_item_state(
    store_id: int,
    product_id: int,
    is_available: bool,
    product_name: Optional[str] = None,
    product_code: Optional[str] = None,
    product_unit: Optional[str] = None,
    product_isfractional: Optional[bool] = None,
    product_photo_url: Optional[str] = None,
    cashier_account: Optional[str] = None,
):
    """
    Обновить резервные данные и отметки доступности карточки после сверки с Паритетом.
    Возвращает обновлённый список активных карточек планшета.
    """
    pool = await get_db_pool()
    try:
        async with pool.connection() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute(
                    f"""
                    select
                        {_POS_CASHIER_TABLET_COLUMNS}
                    from coop.update_pos_cashier_tablet_item_state(%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        int(store_id),
                        int(product_id),
                        bool(is_available),
                        product_name,
                        product_code,
                        product_unit,
                        product_isfractional,
                        product_photo_url,
                        str(cashier_account) if cashier_account else None,
                    ),
                )

                rows = await cursor.fetchall()
                return _rows_to_dicts(cursor, rows)

    except Exception as e:
        logger.error(f"Ошибка при обновлении состояния товара планшета быстрых товаров: {e}")
        return False

# --- END POS cashier tablet items helpers ---

async def test_func():
    result = await manage_order_message_header(order_number=526,method='update',tg_chat_id=1002441644214,message_id=13)
    print(f"Результат: {result}")
    return result

# Запуск теста
if __name__ == "__main__":
    result = asyncio.run(test_func())
    print("Тест завершен")
