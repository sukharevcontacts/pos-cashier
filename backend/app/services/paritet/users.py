from app.services.paritet.client import paritet_client


async def find_user(token: str, tvt_id: int, account: str):
    data = await paritet_client.post(
        action="find_user",
        headers={
            "Access-Token": token,
            "TVT-ID": str(tvt_id),
        },
        json={
            "account": str(account)
        }
    )

    if data.get("code") != 200:
        raise Exception(data.get("error") or "find_user failed")

    return data.get("payload")

async def register_user(
    token: str,
    tvt_id: int,
    name: str,
    birthdate: str,
    phone: str,
    email: str,
    address: str,
):
    data = await paritet_client.post(
        action="register",
        headers={
            "Access-Token": token,
            "TVT-ID": str(tvt_id),
        },
        json={
            "name": name,
            "birthdate": birthdate,
            "phone": phone,
            "email": email,
            "address": address,
            "checkboxprivatedata": 1,
            "checkboxreadcharter": 1,
        },
    )

    if data.get("code") != 200:
        raise Exception(data.get("error") or "register failed")

    return data.get("payload") or {}

async def fill_out_profile(
    token: str,
    tvt_id: int,
    user_id: int,
    name: str,
    birthdate: str,
    phone: str,
    email: str,
    address: str,
):
    data = await paritet_client.post(
        action="fill_out_profile",
        headers={
            "Access-Token": token,
            "TVT-ID": str(tvt_id),
        },
        json={
            "userid": str(user_id),
            "name": name,
            "birthdate": birthdate,
            "phone": phone,
            "email": email,
            "address": address,
            "checkboxprivatedata": 1,
            "checkboxreadcharter": 1,
        },
    )

    if data.get("code") != 200:
        raise Exception(data.get("error") or "fill_out_profile failed")

    return data.get("payload") or {}

