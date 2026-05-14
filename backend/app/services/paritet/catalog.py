from app.services.paritet.client import paritet_client


async def get_catalog(token: str, tvt_id: int, body: dict):
    data = await paritet_client.post(
        action="catalog",
        headers={
            "Access-Token": token,
            "TVT-ID": str(tvt_id),
        },
        json=body
    )

    if data.get("code") != 200:
        raise Exception(data.get("error") or "Catalog failed")

    return data["payload"]