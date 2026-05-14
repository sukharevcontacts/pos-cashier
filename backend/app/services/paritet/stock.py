# backend/app/services/paritet/stock.py

from app.services.paritet.client import paritet_client


async def post_goods(
    token: str,
    tvt_id: int,
    warehouse_id: int,
    product_id: int,
    count: float,
):
    data = await paritet_client.post(
        action="post_goods",
        headers={
            "Access-Token": token,
            "TVT-ID": str(tvt_id),
        },
        json={
            "product": int(product_id),
            "warehousefrom": -1,
            "warehouseto": int(warehouse_id),
            "count": float(count),
        },
    )

    if data.get("code") != 200:
        raise Exception(data.get("error") or "post_goods failed")

    return data.get("payload") or {}


async def writeoff_goods(
    token: str,
    tvt_id: int,
    warehouse_id: int,
    product_id: int,
    count: float,
):
    data = await paritet_client.post(
        action="writeoff_goods",
        headers={
            "Access-Token": token,
            "TVT-ID": str(tvt_id),
        },
        json={
            "product": int(product_id),
            "warehousefrom": int(warehouse_id),
            "warehouseto": -1,
            "count": float(count),
        },
    )

    if data.get("code") != 200:
        raise Exception(data.get("error") or "writeoff_goods failed")

    return data.get("payload") or {}