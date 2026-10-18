"""Shared build console for the AI-enabled IoT hardware project."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
STATIC = ROOT / "static"
DB_PATH = DATA / "state.db"
CATALOG_PATH = DATA / "catalog.json"
CODE_PATH = DATA / "access-code.txt"
SECRET_PATH = DATA / "session-secret.txt"
COOKIE = "iot_build_session"

app = FastAPI(title="AI IoT Build Console")
app.mount("/static", StaticFiles(directory=STATIC), name="static")


def public_access() -> bool:
    """When true, skip the access-code gate (open console). Re-enable by unsetting or setting 0/false."""
    raw = os.environ.get("DASHBOARD_PUBLIC", "").strip().lower()
    return raw in {"1", "true", "yes", "on"}


def authed(request: Request) -> bool:
    return public_access() or cookie_ok(request)


def _read_secret(path: Path) -> str:
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    value = secrets.token_urlsafe(24)
    path.write_text(value + "\n", encoding="utf-8")
    os.chmod(path, 0o600)
    return value


def access_code() -> str:
    env = os.environ.get("DASHBOARD_ACCESS_CODE", "").strip()
    if env:
        return env
    return _read_secret(CODE_PATH)


def session_secret() -> str:
    return _read_secret(SECRET_PATH)


def sign(token: str) -> str:
    digest = hmac.new(session_secret().encode(), token.encode(), hashlib.sha256).hexdigest()
    return f"{token}.{digest}"


def cookie_ok(request: Request) -> bool:
    raw = request.cookies.get(COOKIE, "")
    token, _, digest = raw.partition(".")
    if not token or not digest:
        return False
    expected = hmac.new(session_secret().encode(), token.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, expected)


def connect() -> sqlite3.Connection:
    DATA.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.execute("CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK (id = 1), doc TEXT NOT NULL)")
    return con


def default_state(catalog: dict) -> dict:
    return {
        "order": [section["id"] for section in catalog["sections"]],
        "hidden": [],
        "checks": {},
        "dayStatus": {},
        "testResult": {},
        "bom": {},
        "notes": {},
        "custom": [],
        "log": [],
    }


def load_catalog() -> dict:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def load_state() -> dict:
    catalog = load_catalog()
    con = connect()
    try:
        row = con.execute("SELECT doc FROM workspace WHERE id = 1").fetchone()
        if row is None:
            state = default_state(catalog)
            con.execute("INSERT INTO workspace (id, doc) VALUES (1, ?)", (json.dumps(state),))
            con.commit()
            return state
        state = json.loads(row[0])
    finally:
        con.close()
    catalog_order = [section["id"] for section in catalog["sections"]]
    known = set(catalog_order)
    custom_ids = {item["id"] for item in state.get("custom", [])}
    order = [item for item in state.get("order", []) if item in known or item in custom_ids]
    for index, section_id in enumerate(catalog_order):
        if section_id in order:
            continue
        insert_at = len(order)
        for previous in reversed(catalog_order[:index]):
            if previous in order:
                insert_at = order.index(previous) + 1
                break
        else:
            insert_at = 0
        order.insert(insert_at, section_id)
    state["order"] = order
    state.setdefault("hidden", [])
    state.setdefault("checks", {})
    state.setdefault("dayStatus", {})
    state.setdefault("testResult", {})
    state.setdefault("bom", {})
    state.setdefault("notes", {})
    state.setdefault("custom", [])
    state.setdefault("log", [])
    return state


def save_state(state: dict) -> None:
    con = connect()
    try:
        con.execute(
            "INSERT INTO workspace (id, doc) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET doc = excluded.doc",
            (json.dumps(state),),
        )
        con.commit()
    finally:
        con.close()


def clean_state(payload: dict, catalog: dict) -> dict:
    known = {section["id"] for section in catalog["sections"]}
    custom = []
    for item in payload.get("custom", [])[:24]:
        title = str(item.get("title", "")).strip()[:80]
        body = str(item.get("body", "")).strip()[:4000]
        item_id = str(item.get("id", "")).strip()[:40]
        if title and item_id.startswith("custom-"):
            custom.append({"id": item_id, "title": title, "body": body})
    custom_ids = {item["id"] for item in custom}
    allowed = known | custom_ids
    order = []
    for item in payload.get("order", []):
        if item in allowed and item not in order:
            order.append(item)
    for section_id in list(known) + [item["id"] for item in custom]:
        if section_id not in order:
            order.append(section_id)
    day_ids = {row["id"] for row in catalog["schedule"]}
    test_ids = {row["id"] for row in catalog["tests"]}
    bom_ids = {row["id"] for row in catalog["bom"]}
    check_ids = set()
    for project in catalog["projects"]:
        check_ids.update(row["id"] for row in project["criteria"])
        check_ids.update(f"{project['id']}-step-{index}" for index, _step in enumerate(project["steps"]))
    check_ids.update(f"phase2-{index}" for index, _item in enumerate(catalog["phase2"]))
    statuses = {"not_started", "in_progress", "blocked", "done"}
    results = {"", "pass", "fail"}

    def flag_map(source: dict, allowed_ids: set[str]) -> dict:
        cleaned = {}
        for key, value in source.items():
            if key in allowed_ids and isinstance(value, bool):
                cleaned[key] = value
        return cleaned

    day_status = {}
    for key, value in payload.get("dayStatus", {}).items():
        if key in day_ids and value in statuses:
            day_status[key] = value
    test_result = {}
    for key, value in payload.get("testResult", {}).items():
        if key in test_ids and value in results and value:
            test_result[key] = value
    bom = {}
    for key, value in payload.get("bom", {}).items():
        if key in bom_ids and isinstance(value, dict):
            bom[key] = {
                "ordered": bool(value.get("ordered")),
                "received": bool(value.get("received")),
            }
    notes = {}
    for key, value in payload.get("notes", {}).items():
        if isinstance(key, str) and isinstance(value, str) and key:
            notes[key[:40]] = value[:2000]
    log = []
    for entry in payload.get("log", [])[:40]:
        if isinstance(entry, dict):
            log.append(
                {
                    "at": str(entry.get("at", ""))[:40],
                    "text": str(entry.get("text", ""))[:240],
                }
            )
    return {
        "order": order,
        "hidden": [item for item in payload.get("hidden", []) if item in allowed],
        "checks": flag_map(payload.get("checks", {}), check_ids),
        "dayStatus": day_status,
        "testResult": test_result,
        "bom": bom,
        "notes": notes,
        "custom": custom,
        "log": log,
    }


@app.get("/")
@app.get("/flow")
def index() -> FileResponse:
    return FileResponse(STATIC / "index.html")


@app.get("/api/bootstrap")
def bootstrap(request: Request) -> JSONResponse:
    if not authed(request):
        return JSONResponse({"authenticated": False, "public": False}, status_code=401)
    return JSONResponse(
        {
            "authenticated": True,
            "public": public_access(),
            "catalog": load_catalog(),
            "state": load_state(),
        }
    )


@app.post("/api/login")
async def login(request: Request) -> JSONResponse:
    if public_access():
        return JSONResponse({"ok": True, "public": True})
    body = await request.json()
    code = str(body.get("code", ""))
    if not hmac.compare_digest(code, access_code()):
        return JSONResponse({"ok": False, "error": "That access code does not match."}, status_code=401)
    token = secrets.token_urlsafe(24)
    response = JSONResponse({"ok": True})
    response.set_cookie(
        COOKIE,
        sign(token),
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=60 * 60 * 24 * 30,
        path="/",
    )
    return response


@app.post("/api/logout")
def logout() -> Response:
    response = JSONResponse({"ok": True, "public": public_access()})
    response.delete_cookie(COOKIE, path="/")
    return response


@app.put("/api/state")
async def put_state(request: Request) -> JSONResponse:
    if not authed(request):
        return JSONResponse({"authenticated": False}, status_code=401)
    payload = await request.json()
    state = clean_state(payload, load_catalog())
    save_state(state)
    return JSONResponse(state)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
