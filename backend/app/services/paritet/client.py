import json as jsonlib
import logging
from typing import Any

import httpx

from app.core.config import BASE_URL

logger = logging.getLogger(__name__)


class ParitetClient:
    async def post(self, action: str, headers: dict, json: dict) -> dict[str, Any]:
        """
        Единая точка POST-запросов в Paritet.

        Важно: Paritet иногда при ошибках может вернуть пустой ответ,
        HTML/текст или HTTP-ошибку вместо JSON. Раньше в таких случаях
        падали на resp.json() с JSONDecodeError и наружу уходила непонятная
        ошибка поиска пайщика/заказа. Здесь сначала логируем исходный ответ,
        затем возвращаем понятную ошибку для API-слоя.
        """
        request_headers = {"Action": action, **headers}

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    BASE_URL,
                    headers=request_headers,
                    json=json,
                )
        except httpx.RequestError as exc:
            logger.exception(
                "Paritet request failed: action=%s url=%s error=%s",
                action,
                BASE_URL,
                exc,
            )
            raise Exception("Paritet недоступен. Повторите запрос позже.") from exc

        response_text = resp.text or ""
        content_type = resp.headers.get("content-type", "")

        if resp.status_code >= 400:
            logger.error(
                "Paritet HTTP error: action=%s status=%s content_type=%s response=%r",
                action,
                resp.status_code,
                content_type,
                response_text[:1000],
            )
            message = response_text.strip() or f"HTTP {resp.status_code}"
            raise Exception(f"Ошибка Paritet: {message[:500]}")

        try:
            data = resp.json()
        except jsonlib.JSONDecodeError as exc:
            logger.error(
                "Paritet non-JSON response: action=%s status=%s content_type=%s response=%r",
                action,
                resp.status_code,
                content_type,
                response_text[:1000],
                exc_info=True,
            )
            raise Exception(
                "Paritet вернул некорректный ответ. Повторите запрос или переавторизуйтесь."
            ) from exc

        if not isinstance(data, dict):
            logger.error(
                "Paritet unexpected JSON type: action=%s status=%s content_type=%s data_type=%s data=%r",
                action,
                resp.status_code,
                content_type,
                type(data).__name__,
                data,
            )
            raise Exception("Paritet вернул ответ в неожиданном формате.")

        return data


paritet_client = ParitetClient()
