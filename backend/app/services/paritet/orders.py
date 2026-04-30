from app.services.paritet.client import paritet_client


async def find_orders(
    token: str,
    tvt_id: int,
    user_id: int,
    showreleased: bool = False,
    number: int = -1,
    datecreate: str | None = None,
):
    payload = {
        "user": user_id,
        "showreleased": showreleased,
        "number": number,
        "datecreate": datecreate,
    }

    data = await paritet_client.post(
        action="find_orders",
        headers={
            "Access-Token": token,
            "TVT-ID": str(tvt_id),
        },
        json=payload,
    )

    if data.get("code") != 200:
        raise Exception(data.get("error") or "find_orders failed")

    return data["payload"].get("orderlist", [])