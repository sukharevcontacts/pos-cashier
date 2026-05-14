from pathlib import Path

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.config import APP_NAME
from app.db.db_pool_pg import get_db_pool
from app.core.logger import setup_logger

setup_logger()

app = FastAPI(title=APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

FRONTEND_DIST = Path("/var/www/pos-cashier/frontend/dist")
FRONTEND_ASSETS = FRONTEND_DIST / "assets"


@app.get("/health")
async def health():
    return {
        "ok": True,
        "service": APP_NAME,
    }


@app.head("/health")
async def health_head():
    return Response(status_code=200)


@app.get("/db-check")
async def db_check():
    pool = await get_db_pool()

    async with pool.connection() as conn:
        async with conn.cursor() as cursor:
            await cursor.execute("SELECT now() AS db_time")
            row = await cursor.fetchone()

    return {
        "ok": True,
        "db_time": str(row[0]) if row else None,
    }


@app.head("/db-check")
async def db_check_head():
    return Response(status_code=200)


if FRONTEND_ASSETS.exists():
    app.mount(
        "/pos/assets",
        StaticFiles(directory=str(FRONTEND_ASSETS)),
        name="pos-assets",
    )


@app.get("/pos")
async def pos_redirect():
    return RedirectResponse(url="/pos/")


@app.head("/pos")
async def pos_redirect_head():
    return Response(status_code=301, headers={"Location": "/pos/"})


@app.get("/pos/")
async def pos_index():
    index_file = FRONTEND_DIST / "index.html"

    if not index_file.exists():
        return {
            "ok": False,
            "error": "Frontend is not built. Run: cd /var/www/pos-cashier/frontend && npm run build",
        }

    return FileResponse(index_file)


@app.head("/pos/")
async def pos_index_head():
    index_file = FRONTEND_DIST / "index.html"

    if not index_file.exists():
        return Response(status_code=404)

    return Response(status_code=200)


@app.get("/pos/{full_path:path}")
async def pos_spa_fallback(full_path: str):
    index_file = FRONTEND_DIST / "index.html"

    if not index_file.exists():
        return {
            "ok": False,
            "error": "Frontend is not built. Run: cd /var/www/pos-cashier/frontend && npm run build",
        }

    return FileResponse(index_file)


@app.head("/pos/{full_path:path}")
async def pos_spa_fallback_head(full_path: str):
    index_file = FRONTEND_DIST / "index.html"

    if not index_file.exists():
        return Response(status_code=404)

    return Response(status_code=200)
