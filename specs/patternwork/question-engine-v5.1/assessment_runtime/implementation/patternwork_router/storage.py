"""Transactional storage/reference service; never a production identity provider.

Snapshots are HMAC-authenticated, not encrypted. SQLite files contain sensitive
assessment data. Production must supply encryption/retention/authentication and
an equivalent transaction/CAS boundary. This reference includes no network API.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from threading import RLock
from typing import Any, Protocol
import re
import sqlite3

from .engine import AssessmentEngine
from .model import Config, ConflictError, ContractError
from .source import Source


@dataclass(frozen=True)
class StoredSession:
    session_id: str
    owner_id: str
    version: int
    snapshot: str


class SessionRepository(Protocol):
    def create(self, record: StoredSession) -> None: ...
    def get(self, session_id: str) -> StoredSession: ...
    def compare_and_swap(self, record: StoredSession, expected_version: int) -> None: ...
    def delete(self, session_id: str, expected_version: int) -> None: ...


class InMemoryRepository:
    def __init__(self) -> None:
        self._records: dict[str, StoredSession] = {}
        self._lock = RLock()

    def create(self, record: StoredSession) -> None:
        with self._lock:
            if record.session_id in self._records:
                raise ConflictError("Session already exists.")
            self._records[record.session_id] = record

    def get(self, session_id: str) -> StoredSession:
        with self._lock:
            if session_id not in self._records:
                raise ContractError("Session unavailable.")
            return self._records[session_id]

    def compare_and_swap(self, record: StoredSession, expected_version: int) -> None:
        with self._lock:
            old = self.get(record.session_id)
            if old.version != expected_version or record.version != expected_version + 1 or record.owner_id != old.owner_id:
                raise ConflictError("Concurrent session update.")
            self._records[record.session_id] = record

    def delete(self, session_id: str, expected_version: int) -> None:
        with self._lock:
            if self.get(session_id).version != expected_version:
                raise ConflictError("Concurrent session update.")
            del self._records[session_id]


class SQLiteRepository:
    """Local reference for process restart and transactional update semantics."""
    def __init__(self, path: str | Path):
        self.path = str(path)
        if self.path == ":memory:":
            raise ContractError("Use InMemoryRepository for memory storage; SQLite requires a file for connection-safe persistence.")
        with self._connect() as db:
            db.execute("CREATE TABLE IF NOT EXISTS router_sessions (session_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, version INTEGER NOT NULL, snapshot TEXT NOT NULL)")

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path, timeout=10, isolation_level="IMMEDIATE")

    def create(self, record: StoredSession) -> None:
        try:
            with self._connect() as db:
                db.execute("INSERT INTO router_sessions VALUES (?, ?, ?, ?)", (record.session_id, record.owner_id, record.version, record.snapshot))
        except sqlite3.IntegrityError as exc:
            raise ConflictError("Session already exists.") from exc

    def get(self, session_id: str) -> StoredSession:
        with self._connect() as db:
            row = db.execute("SELECT session_id, owner_id, version, snapshot FROM router_sessions WHERE session_id=?", (session_id,)).fetchone()
        if row is None:
            raise ContractError("Session unavailable.")
        return StoredSession(*row)

    def compare_and_swap(self, record: StoredSession, expected_version: int) -> None:
        if record.version != expected_version + 1:
            raise ConflictError("Invalid storage revision.")
        with self._connect() as db:
            cursor = db.execute("UPDATE router_sessions SET version=?, snapshot=? WHERE session_id=? AND owner_id=? AND version=?",
                                (record.version, record.snapshot, record.session_id, record.owner_id, expected_version))
            if cursor.rowcount != 1:
                raise ConflictError("Concurrent session update.")

    def delete(self, session_id: str, expected_version: int) -> None:
        with self._connect() as db:
            cursor = db.execute("DELETE FROM router_sessions WHERE session_id=? AND version=?", (session_id, expected_version))
            if cursor.rowcount != 1:
                raise ConflictError("Concurrent session update.")


class AssessmentService:
    """Adapter boundary: actor_id MUST come from trusted server authentication.

    Do not populate actor_id from a request body or accept signed snapshots from
    the browser. Storage handles session revision CAS; the core also checks the
    presented assessment revision and idempotency token.
    """
    def __init__(self, repository: SessionRepository, signing_key: bytes, source: Source | None = None):
        if not isinstance(signing_key, bytes) or len(signing_key) < 32:
            raise ContractError("Use an external signing key of at least 32 bytes.")
        self.repository, self.key, self.source = repository, signing_key, source or Source()

    def create(self, session_id: str, actor_id: str, config: Config | None = None) -> dict[str, Any]:
        for value in (session_id, actor_id):
            if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,120}", value):
                raise ContractError("Storage IDs must be bounded opaque identifiers.")
        engine = AssessmentEngine(config, self.source)
        self.repository.create(StoredSession(session_id, actor_id, 0, engine.dumps(self.key)))
        return {"revision": engine.revision, "storage_version": 0}

    def _load(self, session_id: str, actor_id: str) -> tuple[StoredSession, AssessmentEngine]:
        record = self.repository.get(session_id)
        if record.owner_id != actor_id:
            raise ContractError("Session unavailable.")
        return record, AssessmentEngine.loads(record.snapshot, self.source, signing_key=self.key)

    def command(self, session_id: str, actor_id: str, method: str, **kwargs: Any) -> dict[str, Any]:
        if method not in {"next", "answer", "correct", "control", "bind"}:
            raise ContractError("Unknown assessment command.")
        record, engine = self._load(session_id, actor_id)
        result = getattr(engine, method)(**kwargs)
        snapshot = engine.dumps(self.key)
        if snapshot != record.snapshot:
            self.repository.compare_and_swap(StoredSession(session_id, record.owner_id, record.version + 1, snapshot), record.version)
        return result

    def packet(self, session_id: str, actor_id: str) -> dict[str, Any]:
        _, engine = self._load(session_id, actor_id)
        return engine.packet()

    def delete(self, session_id: str, actor_id: str) -> None:
        record, _ = self._load(session_id, actor_id)
        self.repository.delete(session_id, record.version)
