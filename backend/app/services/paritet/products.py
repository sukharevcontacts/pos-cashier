from app.services.paritet.client import paritet_client


async def find_products(token: str, tvt_id: int, ids: list[int]):
    data = await paritet_client.post(
        action="find_products",
        headers={
            "Access-Token": token,
            "TVT-ID": str(tvt_id),
        },
        json={
            "ids": ids,
            "preview_width": 240,
            "preview_height": 320
        }
    )

    if data.get("code") != 200:
        raise Exception(data.get("error") or "find_products failed")

    return data["payload"]["goods"]


async def find_product_by_barcode(token: str, tvt_id: int, code: str):
    data = await paritet_client.post(
        action="find_product",
        headers={
            "Access-Token": token,
            "TVT-ID": str(tvt_id),
        },
        json={
            "code": code,
            "preview_width": 240,
            "preview_height": 320
        }
    )

    if data.get("code") != 200:
        raise Exception(data.get("error") or "find_product failed")

    return data["payload"]