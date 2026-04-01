#!/usr/bin/env python3
"""
Generate sample OTLP traces using the OpenTelemetry Python SDK.
Sends Protobuf over OTLP HTTP to Quickwit's OTLP endpoint.
"""

import os
import random
import time

OTLP_ENDPOINT = os.getenv("OTLP_ENDPOINT", "http://quickwit:7280")
RATE_PER_SEC  = float(os.getenv("TRACE_RATE", "3"))

ROUTES = [
    ("GET",  "/api/users/{id}",          200, 0.35),
    ("GET",  "/api/orders",              200, 0.20),
    ("POST", "/api/orders",              201, 0.15),
    ("POST", "/api/payments",            200, 0.10),
    ("GET",  "/api/products",            200, 0.10),
    ("GET",  "/api/users/{id}/profile",  200, 0.05),
    ("GET",  "/api/users/{id}",          404, 0.03),
    ("POST", "/api/orders",              500, 0.02),
]

DB_OPS = [
    ("SELECT", "users",    0.40),
    ("SELECT", "orders",   0.25),
    ("INSERT", "orders",   0.15),
    ("UPDATE", "users",    0.10),
    ("SELECT", "products", 0.10),
]


def setup_tracers():
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.resources import Resource

    otlp_url = f"{OTLP_ENDPOINT}/api/v1/otel-traces-v0_7/otlp/v1/traces"
    tracers = {}
    for svc in ["frontend", "api-gateway", "user-service", "order-service",
                "payment-service", "db-proxy"]:
        resource = Resource(attributes={"service.name": svc})
        provider = TracerProvider(resource=resource)
        provider.add_span_processor(
            BatchSpanProcessor(OTLPSpanExporter(endpoint=otlp_url))
        )
        tracers[svc] = provider.get_tracer(svc)
    return tracers


def build_trace(tracers):
    from opentelemetry import trace
    from opentelemetry.trace import SpanKind, StatusCode

    method, path, http_status, _ = random.choices(ROUTES, weights=[r[3] for r in ROUTES])[0]
    path = path.replace("{id}", str(random.randint(1, 9999)))
    is_error = http_status >= 500

    if "/users" in path:
        downstream = "user-service"
    elif "/orders" in path:
        downstream = "order-service"
    elif "/payments" in path:
        downstream = "payment-service"
    else:
        downstream = "user-service"

    db_op, db_table, _ = random.choices(DB_OPS, weights=[d[2] for d in DB_OPS])[0]

    total_ms  = random.uniform(50, 500)
    gw_delay  = random.uniform(2, 10) / 1000
    svc_delay = gw_delay + random.uniform(2, 10) / 1000
    db_delay  = svc_delay + random.uniform(5, total_ms * 0.3) / 1000
    db_dur    = random.uniform(5, total_ms * 0.25) / 1000

    with tracers["frontend"].start_as_current_span(
        f"HTTP {method} {path}",
        kind=SpanKind.SERVER,
        attributes={
            "http.method": method,
            "http.url": path,
            "http.status_code": http_status,
        },
    ) as fe_span:
        if is_error:
            fe_span.set_status(StatusCode.ERROR)

        time.sleep(gw_delay)

        with tracers["api-gateway"].start_as_current_span(
            f"route {path}",
            kind=SpanKind.SERVER,
            attributes={
                "http.method": method,
                "http.route": path,
                "http.status_code": http_status,
            },
        ) as gw_span:
            if is_error:
                gw_span.set_status(StatusCode.ERROR)

            time.sleep(svc_delay - gw_delay)

            with tracers[downstream].start_as_current_span(
                f"process {method.lower()} {path.split('/')[2]}",
                kind=SpanKind.INTERNAL,
                attributes={
                    "http.method": method,
                    "service.operation": path,
                },
            ) as svc_span:
                if is_error:
                    svc_span.set_status(StatusCode.ERROR)

                time.sleep(db_delay - svc_delay)

                with tracers["db-proxy"].start_as_current_span(
                    f"db.{db_op.lower()} {db_table}",
                    kind=SpanKind.CLIENT,
                    attributes={
                        "db.system": "postgresql",
                        "db.name": "app",
                        "db.statement": f"{db_op} * FROM {db_table} WHERE id=?",
                    },
                ):
                    time.sleep(db_dur)


def wait_for_quickwit():
    import urllib.request
    url = f"{OTLP_ENDPOINT}/health/livez"
    print(f"Waiting for Quickwit at {url}…", flush=True)
    for _ in range(60):
        try:
            with urllib.request.urlopen(url, timeout=3) as r:
                if r.status == 200:
                    print("Quickwit ready.", flush=True)
                    return
        except Exception:
            pass
        time.sleep(2)
    raise RuntimeError("Quickwit did not become ready in time")


def main():
    import subprocess, sys
    subprocess.check_call([
        sys.executable, "-m", "pip", "install", "--quiet",
        "opentelemetry-sdk",
        "opentelemetry-exporter-otlp-proto-http",
    ])

    wait_for_quickwit()
    tracers = setup_tracers()

    print(f"Generating traces → {OTLP_ENDPOINT}  ({RATE_PER_SEC}/s)", flush=True)
    interval = 1.0 / RATE_PER_SEC
    sent = 0
    while True:
        try:
            build_trace(tracers)
            sent += 1
            if sent % 100 == 0:
                print(f"  {sent} traces sent", flush=True)
        except Exception as e:
            print(f"  error: {e}", flush=True)
        time.sleep(max(0, interval - 0.05))  # subtract avg span time overhead


if __name__ == "__main__":
    main()
