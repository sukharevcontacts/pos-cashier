import httpx
from app.core.config import BASE_URL


class ParitetClient:
    async def post(self, action: str, headers: dict, json: dict):
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                BASE_URL,
                headers={"Action": action, **headers},
                json=json,
            )
            return resp.json()


paritet_client = ParitetClient()