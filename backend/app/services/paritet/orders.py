import logging
from typing import Any, Dict, List

from app.services.paritet.client import paritet_client

logger = logging.getLogger(__name__)

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


async def get_order_details(
    token: str,
    tvt_id: int,
    order_number: int,
) -> Dict[str, Any]:
    """
    Получение деталей заказа из Paritet
    + нормализация под внутренний формат (lines, order)
    """

    data = await paritet_client.post(
        action="order",
        headers={
            "Access-Token": token,
            "TVT-ID": str(tvt_id),
        },
        json={
            "order": int(order_number)
        },
    )

    if data.get("code") != 200:
        raise Exception(data.get("error") or "order failed")

    payload = data.get("payload") or {}

    items: List[Dict[str, Any]] = payload.get("items") or []

    lines = []

    for item in items:
        product = item.get("product") or {}

        count = float(product.get("count") or 0)
        available = float(product.get("availablecount") or 0)

        reserve = max(count - available, 0)

        qty = float(item.get("count") or 0)
        price = float(item.get("price") or 0)

        lines.append({
            "order_line_id": int(item.get("id")),
            "order_number": int(payload.get("number")),
            "item": product.get("id"),

            "item_name": product.get("name"),
            "photo_url": product.get("preview"),

            "qty": qty,
            "price": price,
            "qty_final": qty,
            "line_status": "active",

            "line_sum": qty * price,

            "item_stock": count,
            "reserve": reserve,
            "available_qty": available,

            # важно для фронта
            "max_qty_final": qty + available,
        })

    order = {
        "order_number": int(payload.get("number")),
        "user_account": payload.get("customer"),
        "store_id": tvt_id,
        "status": payload.get("state"),
        "order_date": payload.get("datecreate"),
        "delivery_date": None,
        "date_updated": payload.get("datecreate"),
        "status_label": payload.get("state"),
        "order_sum": float(payload.get("price") or 0),
    }

    readonly = not payload.get("canedit", False)

    return {
        "order": order,
        "lines": lines,
        "readonly": readonly,
    }


async def create_order(
    token: str,
    tvt_id: int,
    user_id: int,
    order_number: int,
    items: list[dict],
):
    payload = {
        "user": user_id,
        "order": int(order_number or 0),
        "items": items,
    }

    data = await paritet_client.post(
        action="create_order",
        headers={
            "Access-Token": token,
            "TVT-ID": str(tvt_id),
        },
        json=payload,
    )

    if data.get("code") != 200:
        raise Exception(data.get("error") or "create_order failed")

    return data.get("payload")


async def cancel_order(
    token: str,
    tvt_id: int,
    order_number: int,
):
    data = await paritet_client.post(
        action="cancel_order",
        headers={
            "Access-Token": token,
            "TVT-ID": str(tvt_id),
        },
        json={
            "order": int(order_number),
            "preview_width": 240,
            "preview_height": 320,
        },
    )

    if data.get("code") != 200:
        raise Exception(data.get("error") or "cancel_order failed")

    return data.get("payload") or {}

async def replenish_balance_qr(
    token: str,
    tvt_id: int,
    user_id: int,
    order_number: int,
    amount: float,
):
    data = await paritet_client.post(
        action="replenish_balance_qr",
        headers={
            "Access-Token": token,
            "TVT-ID": str(tvt_id),
        },
        json={
            "abonid": int(user_id),
            "amount": float(amount),
            "addcomission": 1,
            "includedebt": 1,
            "includebalance": 1,
            "width": 300,
            "height": 300,
            "ttl": 15,
            "sourcename": "POS",
            "paymentpurpose": f"#order {order_number}#",
            "redirecturl": "https://portmonet.ru",
        },
    )

    if data.get("code") != 200:
        raise Exception(data.get("error") or "replenish_balance_qr failed")

    return data.get("payload") or {}
