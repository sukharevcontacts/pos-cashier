from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.db.db_methods_pg import (
    get_pos_cashier_settings,
    save_pos_cashier_settings,
)


router = APIRouter(prefix="/cashier/settings", tags=["cashier-settings"])

ScreenProfile = Literal["auto", "tablet_10", "tablet_7"]


class CashierSettingsRequest(BaseModel):
    screen_profile: ScreenProfile = Field(default="auto")
    appearance_theme: str = Field(default="default")
    settings_json: dict[str, Any] = Field(default_factory=dict)


def default_settings(cashier_account: str) -> dict[str, Any]:
    return {
        "cashier_account": str(cashier_account),
        "screen_profile": "auto",
        "appearance_theme": "default",
        "settings_json": {},
    }


@router.get("/{cashier_account}")
async def get_cashier_settings(
    cashier_account: str,
):
    result = await get_pos_cashier_settings(str(cashier_account))

    if result is False:
        raise HTTPException(
            status_code=500,
            detail="Ошибка получения настроек кассира",
        )

    if not result:
        return default_settings(str(cashier_account))

    return {
        "cashier_account": str(result.get("cashier_account") or cashier_account),
        "screen_profile": result.get("screen_profile") or "auto",
        "appearance_theme": result.get("appearance_theme") or "default",
        "settings_json": result.get("settings_json") or {},
    }


@router.post("/{cashier_account}")
async def save_cashier_settings(
    cashier_account: str,
    payload: CashierSettingsRequest,
):
    result = await save_pos_cashier_settings(
        cashier_account=str(cashier_account),
        screen_profile=payload.screen_profile or "auto",
        appearance_theme=payload.appearance_theme or "default",
        settings_json=payload.settings_json or {},
    )

    if result is False:
        raise HTTPException(
            status_code=500,
            detail="Ошибка сохранения настроек кассира",
        )

    if not result:
        raise HTTPException(
            status_code=500,
            detail="Настройки кассира не были сохранены",
        )

    return {
        "ok": True,
        "cashier_account": str(result.get("cashier_account") or cashier_account),
        "screen_profile": result.get("screen_profile") or "auto",
        "appearance_theme": result.get("appearance_theme") or "default",
        "settings_json": result.get("settings_json") or {},
    }