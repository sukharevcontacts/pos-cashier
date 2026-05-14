from psycopg_pool import AsyncConnectionPool
import asyncio
from asyncio import Lock

pool = None
lock = Lock()

# asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


async def get_db_pool():
    global pool
    if pool is None:
        async with lock:
            if pool is None:
                pool = AsyncConnectionPool(
                    conninfo="dbname=coop user=coop_owner password=Qho85jE94 host=10.0.44.12 port=5432",
                    min_size=5,
                    max_size=20,
                    timeout=60,
                    max_waiting=10
                )
                await pool.open()
    return pool
