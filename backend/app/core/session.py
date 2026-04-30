from typing import Dict, Optional
from uuid import uuid4


class SessionData:
    def __init__(self, token: str):
        self.token = token
        self.tvt_id: Optional[int] = None
        self.warehouse_id: Optional[int] = None


class SessionStore:
    def __init__(self):
        self._store: Dict[str, SessionData] = {}

    def create(self, token: str) -> str:
        session_id = str(uuid4())
        self._store[session_id] = SessionData(token)
        return session_id

    def get(self, session_id: str) -> Optional[SessionData]:
        return self._store.get(session_id)

    def set_store(self, session_id: str, tvt_id: int, warehouse_id: int):
        session = self._store.get(session_id)
        if session:
            session.tvt_id = tvt_id
            session.warehouse_id = warehouse_id


session_store = SessionStore()