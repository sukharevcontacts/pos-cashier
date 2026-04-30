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