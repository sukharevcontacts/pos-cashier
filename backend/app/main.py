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

@app.get("/pos/sw.js")
async def pos_service_worker():
    sw_file = FRONTEND_DIST / "sw.js"

    if not sw_file.exists():
        return Response(status_code=404)

    return FileResponse(
        sw_file,
        media_type="application/javascript",
        headers={
            "Cache-Control": "no-cache",
            "Service-Worker-Allowed": "/pos/",
        },
    )


@app.head("/pos/sw.js")
async def pos_service_worker_head():
    sw_file = FRONTEND_DIST / "sw.js"

    if not sw_file.exists():
        return Response(status_code=404)

    return Response(
        status_code=200,
        media_type="application/javascript",
        headers={
            "Cache-Control": "no-cache",
            "Service-Worker-Allowed": "/pos/",
        },
    )


@app.get("/pos/manifest.webmanifest")
async def pos_manifest():
    manifest_file = FRONTEND_DIST / "manifest.webmanifest"

    if not manifest_file.exists():
        return Response(status_code=404)

    return FileResponse(
        manifest_file,
        media_type="application/manifest+json",
        headers={
            "Cache-Control": "no-cache",
        },
    )


@app.head("/pos/manifest.webmanifest")
async def pos_manifest_head():
    manifest_file = FRONTEND_DIST / "manifest.webmanifest"

    if not manifest_file.exists():
        return Response(status_code=404)

    return Response(
        status_code=200,
        media_type="application/manifest+json",
        headers={
            "Cache-Control": "no-cache",
        },
    )


@app.get("/pos/icons.svg")
async def pos_icons_svg():
    icon_file = FRONTEND_DIST / "icons.svg"

    if not icon_file.exists():
        return Response(status_code=404)

    return FileResponse(icon_file, media_type="image/svg+xml")


@app.get("/pos/favicon.svg")
async def pos_favicon_svg():
    icon_file = FRONTEND_DIST / "favicon.svg"

    if not icon_file.exists():
        return Response(status_code=404)

    return FileResponse(icon_file, media_type="image/svg+xml")


@app.get("/pos/pwa-icon-192.png")
async def pos_pwa_icon_192():
    icon_file = FRONTEND_DIST / "pwa-icon-192.png"

    if not icon_file.exists():
        return Response(status_code=404)

    return FileResponse(icon_file, media_type="image/png")


@app.get("/pos/pwa-icon-512.png")
async def pos_pwa_icon_512():
    icon_file = FRONTEND_DIST / "pwa-icon-512.png"

    if not icon_file.exists():
        return Response(status_code=404)

    return FileResponse(icon_file, media_type="image/png")

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
