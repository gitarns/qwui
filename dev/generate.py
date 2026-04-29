#!/usr/bin/env python3
"""
Generate sample log data into a Quickwit index.

Phase 1 — backfill: ingest 7 days of historical data in fast batches.
Phase 2 — real-time: emit ~20 events/second continuously, forever.
"""

import json
import random
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

QUICKWIT_URL    = "http://quickwit:7280"
INDEX_ID        = "demo"
BACKFILL_EVENTS = 50_000
BACKFILL_BATCH  = 2_000

INDEX_CONFIG = {
    "version": "0.8",
    "index_id": INDEX_ID,
    "doc_mapping": {
        "timestamp_field": "timestamp",
        "field_mappings": [
            {"name": "timestamp", "type": "datetime", "fast": True,
             "input_formats": ["rfc3339"], "output_format": "rfc3339"},
            {"name": "level",    "type": "text", "tokenizer": "raw", "fast": True},
            {"name": "service",  "type": "text", "tokenizer": "raw", "fast": True},
            {"name": "host",     "type": "text", "tokenizer": "raw", "fast": True},
            {"name": "message",  "type": "text"},
            {"name": "method",   "type": "text", "tokenizer": "raw", "fast": True},
            {"name": "path",     "type": "text", "tokenizer": "raw"},
            {"name": "status_code",      "type": "u64", "fast": True},
            {"name": "response_time_ms", "type": "f64", "fast": True},
            {"name": "bytes_sent",       "type": "u64", "fast": True},
            {"name": "trace_id", "type": "text", "tokenizer": "raw"},
            {"name": "duration_ms", "type": "f64", "fast": True},
            {"name": "user_id",  "type": "u64", "fast": True},
            {"name": "order_id", "type": "u64", "fast": True},
            {"name": "file",     "type": "text"},
            {"name": "error_line", "type": "u64", "fast": True},
        ],
    },
    "search_settings": {
        "default_search_fields": ["message", "level", "service"],
    },
}

# ── Nginx ─────────────────────────────────────────────────────────────────────

NGINX_ROUTES = [
    ("GET",  "/api/users/{id}",          200, 0.55),
    ("POST", "/api/login",               200, 0.10),
    ("GET",  "/api/items/{id}",          200, 0.08),
    ("PUT",  "/api/users/{id}/profile",  200, 0.05),
    ("GET",  "/static/app.{hash}.js",    304, 0.07),
    ("GET",  "/api/users/{id}",          404, 0.06),
    ("POST", "/api/data",                500, 0.02),
    ("GET",  "/healthz",                 200, 0.07),
]
NGINX_HOSTS = ["web-01", "web-02", "web-03"]

def nginx_event(ts):
    method, pattern, status, _ = random.choices(NGINX_ROUTES, weights=[r[3] for r in NGINX_ROUTES])[0]
    path = (pattern
        .replace("{id}",   str(random.randint(1, 9999)))
        .replace("{hash}", "%08x" % random.randint(0, 0xFFFFFFFF)))
    rt = round(random.lognormvariate(2.5, 0.8), 2)
    level = "ERROR" if status >= 500 else ("WARN" if status >= 400 else "INFO")
    return {
        "timestamp": ts, "service": "nginx", "host": random.choice(NGINX_HOSTS),
        "level": level, "method": method, "path": path,
        "status_code": status, "response_time_ms": rt,
        "bytes_sent": random.randint(200, 50000),
        "message": f"{method} {path} {status} {rt}ms",
    }

# ── Application ───────────────────────────────────────────────────────────────

APP_HOSTS = ["app-01", "app-02"]
APP_TEMPLATES = [
    ("INFO",  0.30, lambda: (
        f"User login successful for user_id={random.randint(1,9999)}",
        {"user_id": random.randint(1, 9999), "duration_ms": round(random.uniform(10, 80), 2)})),
    ("INFO",  0.25, lambda: (
        f"Processing order #{random.randint(10000,99999)} for customer {random.randint(1,9999)}",
        {"order_id": random.randint(10000, 99999), "user_id": random.randint(1, 9999),
         "duration_ms": round(random.uniform(50, 300), 2)})),
    ("DEBUG", 0.15, lambda: (
        f"Cache miss for key session_{random.randbytes(8).hex()}",
        {"duration_ms": round(random.uniform(1, 5), 2)})),
    ("INFO",  0.15, lambda: (
        f"Database query took {round(random.uniform(1, 200), 1)}ms",
        {"duration_ms": round(random.uniform(1, 200), 1)})),
    ("WARN",  0.10, lambda: (
        f"Slow query detected: SELECT * FROM orders WHERE user_id={random.randint(1,9999)} "
        f"took {random.randint(500,3000)}ms",
        {"duration_ms": random.randint(500, 3000), "user_id": random.randint(1, 9999)})),
    ("ERROR", 0.05, lambda: (
        f"Failed to send email to user_{random.randint(1,9999)}@example.com: connection refused",
        {"user_id": random.randint(1, 9999)})),
]

def app_event(ts):
    level, _, fn = random.choices(APP_TEMPLATES, weights=[x[1] for x in APP_TEMPLATES])[0]
    msg, extra = fn()
    return {"timestamp": ts, "service": "app", "host": random.choice(APP_HOSTS),
            "level": level, "message": msg,
            "trace_id": "%016x" % random.randint(0, 2**64 - 1), **extra}

# ── PHP ───────────────────────────────────────────────────────────────────────

PHP_FILES   = ["index", "auth", "api", "model", "controller", "helper", "router"]
PHP_VARS    = ["result", "data", "user", "response", "config", "db", "cache"]
PHP_CLASSES = ["UserModel", "OrderController", "DbConnection", "CacheManager", "AuthService"]
PHP_METHODS = ["find", "save", "delete", "update", "connect", "authenticate"]
PHP_HOSTS   = ["app-01", "app-02"]
PHP_TEMPLATES = [
    ("ERROR", 0.35, lambda: (
        f"PHP Fatal error: Call to undefined method "
        f"{random.choice(PHP_CLASSES)}::{random.choice(PHP_METHODS)}() "
        f"in /var/www/html/{random.choice(PHP_FILES)}.php on line {random.randint(10,300)}",
        {"file": f"/var/www/html/{random.choice(PHP_FILES)}.php", "error_line": random.randint(10,300)})),
    ("WARN",  0.40, lambda: (
        f"PHP Warning: Undefined variable ${random.choice(PHP_VARS)} "
        f"in /var/www/html/{random.choice(PHP_FILES)}.php on line {random.randint(10,300)}",
        {"file": f"/var/www/html/{random.choice(PHP_FILES)}.php", "error_line": random.randint(10,300)})),
    ("WARN",  0.15, lambda: (
        f"PHP Notice: Array to string conversion "
        f"in /var/www/html/{random.choice(PHP_FILES)}.php on line {random.randint(10,300)}",
        {"file": f"/var/www/html/{random.choice(PHP_FILES)}.php", "error_line": random.randint(10,300)})),
    ("ERROR", 0.10, lambda: (
        f"PHP Fatal error: Uncaught TypeError: Argument 1 passed to "
        f"{random.choice(PHP_CLASSES)}::{random.choice(PHP_METHODS)}() must be of type string, "
        f"null given in /var/www/html/{random.choice(PHP_FILES)}.php on line {random.randint(10,300)}",
        {"file": f"/var/www/html/{random.choice(PHP_FILES)}.php", "error_line": random.randint(10,300)})),
]

def php_event(ts):
    level, _, fn = random.choices(PHP_TEMPLATES, weights=[x[1] for x in PHP_TEMPLATES])[0]
    msg, extra = fn()
    return {"timestamp": ts, "service": "php", "host": random.choice(PHP_HOSTS),
            "level": level, "message": msg, **extra}

SERVICE_FNS = [(nginx_event, 0.60), (app_event, 0.30), (php_event, 0.10)]

def make_event(ts):
    fn = random.choices(SERVICE_FNS, weights=[x[1] for x in SERVICE_FNS])[0][0]
    return fn(ts)

def now_ts():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

# ── Quickwit helpers ──────────────────────────────────────────────────────────

def qw_request(method, path, body=None):
    url = f"{QUICKWIT_URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                  headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def ingest(docs, commit=False):
    ndjson = "\n".join(json.dumps(d) for d in docs).encode()
    suffix = "?commit=force" if commit else ""
    req = urllib.request.Request(
        f"{QUICKWIT_URL}/api/v1/{INDEX_ID}/ingest{suffix}",
        data=ndjson, method="POST",
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status

def wait_for_quickwit():
    print("Waiting for Quickwit...", flush=True)
    for _ in range(60):
        try:
            if qw_request("GET", "/health/livez")[0] == 200:
                print("Quickwit is ready.", flush=True)
                return
        except Exception:
            pass
        time.sleep(2)
    raise RuntimeError("Quickwit did not become ready in time")

QWUI_INDEX_CONFIG = {
    "version": "0.8",
    "index_id": "qwui",
    "doc_mapping": {
        "timestamp_field": "timestamp",
        "field_mappings": [
            {"name": "id",         "type": "text", "tokenizer": "raw", "stored": True},
            {"name": "type",       "type": "text", "tokenizer": "raw", "stored": True},
            {"name": "status",     "type": "bool", "stored": True},
            {"name": "name",       "type": "text", "stored": True},
            {"name": "timestamp",  "type": "datetime", "fast": True, "stored": True,
             "input_formats": ["rfc3339"], "output_format": "rfc3339"},
            {"name": "created_at", "type": "i64", "stored": True},
            {"name": "modified_at","type": "i64", "stored": True},
        ],
    },
    "search_settings": {
        "default_search_fields": ["name", "type"],
    },
    "indexing_settings": {
        "commit_timeout_secs": 5,
        "split_num_docs_target": 10,
    },
}

def reset_index():
    status, _ = qw_request("GET", f"/api/v1/indexes/{INDEX_ID}")
    if status == 200:
        print(f"Dropping existing index '{INDEX_ID}'...", flush=True)
        status, body = qw_request("DELETE", f"/api/v1/indexes/{INDEX_ID}")
        if status not in (200, 204):
            raise RuntimeError(f"Failed to delete index: {status} {body}")
    print(f"Creating index '{INDEX_ID}'...", flush=True)
    status, body = qw_request("POST", "/api/v1/indexes", INDEX_CONFIG)
    if status not in (200, 201):
        raise RuntimeError(f"Failed to create index: {status} {body}")
    print("Index ready.", flush=True)

def ensure_qwui_index():
    status, _ = qw_request("GET", "/api/v1/indexes/qwui")
    if status == 200:
        print("qwui index already exists.", flush=True)
        return
    print("Creating qwui index...", flush=True)
    status, body = qw_request("POST", "/api/v1/indexes", QWUI_INDEX_CONFIG)
    if status not in (200, 201):
        raise RuntimeError(f"Failed to create qwui index: {status} {body}")
    print("qwui index ready.", flush=True)

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    wait_for_quickwit()
    reset_index()
    ensure_qwui_index()

    # Phase 1: backfill historical data
    now   = datetime.now(timezone.utc)
    start = now - timedelta(days=7)
    span  = int((now - start).total_seconds())
    print(f"Backfilling {BACKFILL_EVENTS:,} events over 7 days...", flush=True)
    batch, total = [], 0
    for _ in range(BACKFILL_EVENTS):
        ts = (start + timedelta(seconds=random.randint(0, span))).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        batch.append(make_event(ts))
        if len(batch) >= BACKFILL_BATCH:
            ingest(batch, commit=True)
            total += len(batch)
            print(f"  {total:,} / {BACKFILL_EVENTS:,}", flush=True)
            batch = []
    if batch:
        ingest(batch, commit=True)
        total += len(batch)
    print(f"Backfill done ({total:,} events). Starting real-time stream...", flush=True)

    # Phase 2: stream real-time events forever
    total_rt = 0
    while True:
        n = int(random.lognormvariate(3.0, 0.8))  # median ~20, occasional spikes
        n = max(1, min(n, 500))
        batch = [make_event(now_ts()) for _ in range(n)]
        ingest(batch, commit=True)
        total_rt += n
        print(f"  +{n} events (total real-time: {total_rt:,})", flush=True)
        time.sleep(random.uniform(0.5, 3.0))

if __name__ == "__main__":
    main()
