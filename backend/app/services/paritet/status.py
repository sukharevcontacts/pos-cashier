from app.services.paritet.client import paritet_client


async def get_status(token: str, tvt_id: int):
    data = await paritet_client.post(
        action="get_current_status",
        headers={
            "Access-Token": token,
            "TVT-ID": str(tvt_id),
        },
        json={}
    )

    if data.get("code") != 200:
        raise Exception(data.get("error") or "Status failed")

    return data["payload"]