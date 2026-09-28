"""JIIII KIIII SEVER - Flask backend (login, session, login history)."""
import json
import os
import secrets
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"
DATA_FILE = Path(os.environ.get("DATA_FILE", BASE_DIR / "logins.json"))
MAX_RECORDS = 100

app = Flask(__name__, static_folder=None)
app.config.update(
    # Set SECRET_KEY in production so sessions survive restarts.
    SECRET_KEY=os.environ.get("SECRET_KEY") or secrets.token_hex(32),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=bool(os.environ.get("RENDER")),  # HTTPS on Render
)

# Demo account. Only a salted hash is kept in memory; the password is never
# sent to the browser and never written to the login history.
DEMO_USER = "KIKU7"
DEMO_HASH = generate_password_hash("AK47")

_lock = threading.Lock()
_failures = {}  # ip -> list of failed-attempt timestamps (simple throttle)


def _read():
    try:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return []


def _write(records):
    DATA_FILE.write_text(json.dumps(records[-MAX_RECORDS:], indent=2), encoding="utf-8")


def _throttled(ip):
    now = time.time()
    recent = [t for t in _failures.get(ip, []) if now - t < 300]
    _failures[ip] = recent
    return len(recent) >= 5


@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/<path:name>")
def assets(name):
    if name in {"style.css", "script.js"}:
        return send_from_directory(FRONTEND_DIR, name)
    return jsonify(error="Not found"), 404


@app.post("/login")
def login():
    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
    if _throttled(ip):
        return jsonify(error="Too many failed attempts. Wait 5 minutes and try again."), 429

    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))

    if not username or not password:
        return jsonify(error="Enter both a username and a password."), 400

    user_ok = secrets.compare_digest(username.encode(), DEMO_USER.encode())
    pass_ok = check_password_hash(DEMO_HASH, password)  # always checked

    if not (user_ok and pass_ok):
        _failures.setdefault(ip, []).append(time.time())
        return jsonify(error="Wrong username or password."), 401

    _failures.pop(ip, None)
    record = {
        "id": secrets.token_hex(6),
        "username": DEMO_USER,
        "login_time": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "status": "Online",
    }
    with _lock:
        records = _read()
        records.append(record)
        _write(records)

    session.clear()
    session["user"] = DEMO_USER
    session["record_id"] = record["id"]
    return jsonify(ok=True, username=DEMO_USER)


@app.get("/me")
def me():
    if "user" not in session:
        return jsonify(authenticated=False), 401
    return jsonify(authenticated=True, username=session["user"])


@app.post("/logout")
def logout():
    record_id = session.get("record_id")
    if record_id:
        with _lock:
            records = _read()
            for r in records:
                if r["id"] == record_id:
                    r["status"] = "Offline"
            _write(records)
    session.clear()
    return jsonify(ok=True)


@app.get("/users")
def users():
    if "user" not in session:
        return jsonify(error="Login required."), 401
    with _lock:
        records = _read()
    safe = [{k: r[k] for k in ("username", "login_time", "status")} for r in records]
    return jsonify(users=list(reversed(safe)))


if __name__ == "__main__":
    app.run(debug=True, port=int(os.environ.get("PORT", 5000)))
