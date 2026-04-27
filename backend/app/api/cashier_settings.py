import json
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db


router = APIRouter(prefix="/cashier/settings", tags=["cashier-settings"])

ScreenProfile = Literal["auto", "tablet_10"]


class CashierSettingsRequest(BaseModel):
    screen_profile: ScreenProfile = Field(default="auto")
    appearance_theme: str = Field(default="default")
    settings_json: dict[str, Any] = Field(default_factory=dict)


def default_settings(cashier_account: int) -> dict[str, Any]:
    return {
        "cashier_account": cashier_account,
        "screen_profile": "auto",
        "appearance_theme": "default",
        "settings_json": {},
    }


@router.get("/{cashier_account}")
async def get_cashier_settings(
    cashier_account: int,
    db: AsyncSession = Depends(get_db),
):
    cashier_result = await db.execute(
        text("""
            SELECT cashier_account
            FROM coop.pos_cashiers
            WHERE cashier_account = :cashier_account
              AND is_active = TRUE
            LIMIT 1
        """),
        {"cashier_account": cashier_account},
    )

    if not cashier_result.mappings().first():
        raise HTTPException(status_code=404, detail="Кассир не найден")

    result = await db.execute(
        text("""
            SELECT
                cashier_account,
                screen_profile,
                appearance_theme,
                settings_json
            FROM coop.pos_cashier_settings
            WHERE cashier_account = :cashier_account
            LIMIT 1
        """),
        {"cashier_account": cashier_account},
    )

    row = result.mappings().first()

    if not row:
        return default_settings(cashier_account)

    return {
        "cashier_account": row["cashier_account"],
        "screen_profile": row["screen_profile"] or "auto",
        "appearance_theme": row["appearance_theme"] or "default",
        "settings_json": row["settings_json"] or {},
    }


@router.post("/{cashier_account}")
async def save_cashier_settings(
    cashier_account: int,
    payload: CashierSettingsRequest,
    db: AsyncSession = Depends(get_db),
):
    cashier_result = await db.execute(
        text("""
            SELECT cashier_account
            FROM coop.pos_cashiers
            WHERE cashier_account = :cashier_account
              AND is_active = TRUE
            LIMIT 1
        """),
        {"cashier_account": cashier_account},
    )

    if not cashier_result.mappings().first():
        raise HTTPException(status_code=404, detail="Кассир не найден")

    result = await db.execute(
        text("""
            INSERT INTO coop.pos_cashier_settings (
                cashier_account,
                screen_profile,
                appearance_theme,
                settings_json,
                updated_at
            )
            VALUES (
                :cashier_account,
                :screen_profile,
                :appearance_theme,
                CAST(:settings_json AS jsonb),
                now()
            )
            ON CONFLICT (cashier_account) DO UPDATE SET
                screen_profile = EXCLUDED.screen_profile,
                appearance_theme = EXCLUDED.appearance_theme,
                settings_json = EXCLUDED.settings_json,
                updated_at = now()
            RETURNING
                cashier_account,
                screen_profile,
                appearance_theme,
                settings_json
        """),
        {
            "cashier_account": cashier_account,
            "screen_profile": payload.screen_profile,
            "appearance_theme": payload.appearance_theme,
            "settings_json": json.dumps(payload.settings_json, ensure_ascii=False),
        },
    )

    await db.commit()

    row = result.mappings().one()

    return {
        "ok": True,
        "cashier_account": row["cashier_account"],
        "screen_profile": row["screen_profile"],
        "appearance_theme": row["appearance_theme"],
        "settings_json": row["settings_json"] or {},
    }
