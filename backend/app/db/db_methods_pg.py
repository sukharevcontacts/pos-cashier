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

async def test_func():
    result = await manage_order_message_header(order_number=526,method='update',tg_chat_id=1002441644214,message_id=13)
    print(f"Результат: {result}")
    return result

# Запуск теста
if __name__ == "__main__":
    result = asyncio.run(test_func())
    print("Тест завершен")
