# backend/app/services/paritet/cash.py

from app.services.paritet.client import paritet_client


# =========================
# 💰 ПОПОЛНЕНИЕ НАЛИЧНЫМИ
# =========================
async def transfer_cash(
    token: str,
    tvt_id: int,
    user_id: int,
    amount: float,
):
    data = await paritet_client.post(
        action="transfer",
        headers={
            "Access-Token": token,
            "TVT-ID": str(tvt_id),
        },
        json={
            "user": int(user_id),
            "amount": float(amount),
        },
    )

    if data.get("code") != 200:
        raise Exception(data.get("error") or "transfer failed")

    return data.get("payload") or {}


# =========================
# 💸 ПРОВЕРКА ВЫДАЧИ
# =========================
async def cashout_check(
    token: str,
    tvt_id: int,
    user_id: int,
    amount: float,
):
    data = await paritet_client.post(
        action="cashout",
        headers={
            "Access-Token": token,
            "TVT-ID": str(tvt_id),
        },
        json={
            "user": int(user_id),
            "amount": float(amount),
            "pin": None,
            "checkamount": True,
        },
    )

    if data.get("code") != 200:
        raise Exception(data.get("error") or "cashout check failed")

    return data.get("payload") or {}


# =========================
# 💸 ВЫДАЧА НАЛИЧНЫХ
# =========================
async def cashout_execute(
    token: str,
    tvt_id: int,
    user_id: int,
    amount: float,
    pin: str,
):
    data = await paritet_client.post(
        action="cashout",
        headers={
            "Access-Token": token,
            "TVT-ID": str(tvt_id),
        },
        json={
            "user": int(user_id),
            "amount": float(amount),
            "pin": pin,
            "checkamount": False,
        },
    )

    if data.get("code") != 200:
        raise Exception(data.get("error") or "cashout failed")

    return data.get("payload") or {}


# =========================
# 📱 СБП QR
# =========================
async def replenish_balance_qr(
    token: str,
    tvt_id: int,
    amount: float,
    login: str,
):
    data = await paritet_client.post(
        action="replenish_balance_qr",
        headers={
            "Access-Token": token,
            "TVT-ID": str(tvt_id),
        },
        json={
            "amount": int(amount),
            "addcomission": 0,
            "includedebt": 0,
            "includebalance": 0,
            "width": 300,
            "height": 300,
            "ttl": 15,
            "sourcename": "POS API",
            "paymentpurpose": f"#login {login}#",
            "redirecturl": "https://portmonet.ru",
        },
    )

    if data.get("code") != 200:
        raise Exception(data.get("error") or "replenish_balance_qr failed")

    return data.get("payload") or {}