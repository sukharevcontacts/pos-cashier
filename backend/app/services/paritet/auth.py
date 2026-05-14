from app.services.paritet.client import paritet_client


async def paritet_auth(login: str, password: str):
    payload = {
        "login": str(login),
        "password": str(password)
    }

    data = await paritet_client.post(
        action="auth",
        headers={},  # без токена
        json=payload,
    )

    if data.get("code") != 200:
        raise Exception(data.get("error") or "Auth failed")

    return data["payload"]