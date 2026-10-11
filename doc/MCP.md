# MCP endpoint

qwui serves a [Model Context Protocol](https://modelcontextprotocol.io) endpoint
at **`/mcp`**, giving AI agents read-only access to the same Quickwit logs the UI
shows.

- [Why it lives in qwui](#why-it-lives-in-qwui)
- [Enabling it](#enabling-it)
- [Connecting an agent](#connecting-an-agent)
- [Authentication](#authentication)
- [The tools](#the-tools)
- [Query syntax](#query-syntax)
- [Time expressions](#time-expressions)
- [Read-only by construction](#read-only-by-construction)
- [Load guardrail](#load-guardrail)
- [Audit trail and metrics](#audit-trail-and-metrics)
- [Verifying a deployment](#verifying-a-deployment)
- [Keeping up with Quickwit upgrades](#keeping-up-with-quickwit-upgrades)
- [Limitations](#limitations)
- [Troubleshooting](#troubleshooting)

## Why it lives in qwui

The backend is already a Quickwit gateway: it holds the network path
(`QUICKWIT_URL`, `QUICKWIT_INDEXER_URL`), the deployment surface, and endpoints
Quickwit does not have.

`summarize_log_patterns` is the clearest case. It reuses the same Drain
implementation as the UI's **∿** button, and handing an agent twenty templates
instead of ten thousand log lines is the difference between a useful answer and
an exhausted context window. A standalone MCP server beside Quickwit could not
offer it without reimplementing qwui.

Every other tool is a single call to Quickwit's own REST API. The agent does no
computation locally — it searches and aggregates through Quickwit.

## Enabling it

Off by default. Two variables switch it on:

```bash
MCP_ENABLED=true
MCP_TOKENS=claude-code:$(openssl rand -hex 32)
```

**It fails closed.** `MCP_ENABLED=true` with no `MCP_TOKENS` logs a warning and
leaves `/mcp` unmounted. An unauthenticated tool that can read every log line in
the cluster is worse than a missing feature.

On startup the backend logs what it resolved:

```
MCP endpoint enabled at /mcp (read-only) agents=["claude-code"]
allowed_hosts=["localhost", "127.0.0.1", "::1", "qwui.example.com"] hits_ceiling=50
max_concurrent=4 limits_from=num_cpus=1 max_num_concurrent_split_searches=100
aggregation_bucket_limit=65000 request_timeout_secs=30 rate_limit_per_min=120
```

### In Kubernetes

`MCP_TOKENS` is a credential, so it belongs in a Secret — never in `--set`, where
it lands in the Helm release history and your shell history.

```yaml
extraEnv:
  - name: MCP_ENABLED
    value: "true"
  # quickwit.url normally points at a searcher, but /api/v1/indexing only exists
  # on a node running the indexer service. Name it separately or
  # `indexing_status` will 404.
  - name: QUICKWIT_INDEXER_URL
    value: http://quickwit-indexer.quickwit.svc.cluster.local:7280
extraEnvFrom:
  - secretRef:
      name: qwui-secrets   # holds MCP_TOKENS
```

## Connecting an agent

Transport is **Streamable HTTP** on a single path. Protocol revision
`2026-07-28` removed sessions (SEP-2567), so every request is served statelessly:
no session store, no sticky routing, any replica can answer.

**Claude Code:**

```bash
claude mcp add --transport http qwui https://qwui.example.com/mcp \
  --header "Authorization: Bearer <token>"
```

**Cursor** — `.cursor/mcp.json` in the project, or `~/.cursor/mcp.json` to have it
everywhere. Cursor expands `${env:NAME}`, so the token can stay out of the file
and out of git:

```json
{
  "mcpServers": {
    "qwui": {
      "url": "https://qwui.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${env:QWUI_MCP_TOKEN}"
      }
    }
  }
}
```

Any client that can set an HTTP header works the same way — there is nothing
qwui-specific in the handshake.

Opening `/mcp` in a browser returns `401` with these same instructions and the
deployment's own hostname filled in, so nobody has to be told where to look.

Locally, the Vite dev server proxies `/mcp` to the backend, so
`http://localhost:5173/mcp` works too.

Older clients are supported: rmcp serves revisions back to `2025-11-25`, without
sessions in either case.

## Authentication

The UI authenticates with an OIDC session cookie. An agent cannot obtain one —
the flow requires a human in a browser — so `/mcp` carries its own credential: a
bearer token, compared in constant time.

```
Authorization: Bearer <token>
```

**Name your tokens.** `MCP_TOKENS` accepts `name:secret` as well as a bare
secret, comma-separated:

```bash
MCP_TOKENS=claude-code:9f3a…,ci-bot:7b21…
```

The name is what appears in the audit log and the metric labels, so "which agent
ran this query" has a readable answer, and one agent can be revoked without
disturbing the others. The secret is never logged. A bare secret still works and
is audited as `token-1`, `token-2`, … — deliberately not a prefix of itself,
because the first characters of a credential are still part of it.

Wrong or missing token → `401`. Over the rate limit → `429` with `Retry-After`.

For claude.ai remote connectors (web and desktop), MCP's OAuth resource-server
flow against the OIDC provider would be needed instead. That is **not implemented**;
bearer tokens cover Claude Code and any agent that can set a header.

## The tools

An index is normally one Kubernetes namespace, holding every pod and container in
it. So the tools are built for narrowing from a namespace down to the pods that
matter, before reading any lines.

```
list_indexes          → which namespaces exist
list_index_fields     → which fields, and which are aggregatable
list_field_values     → which pods, with a document count each
count_over_time       → when it started, and which pod (group_by)
field_stats           → pick a threshold from the data (p95, p99)
search_logs / summarize_log_patterns  → read the narrowed set
```

Prefer aggregations over reading documents: counts and distinct values answer
most questions at a fraction of the response size.

| Tool | Quickwit call | Purpose |
|---|---|---|
| `search_logs` | `POST /{index}/search` | Matching documents. `fields` projects to keep hits small |
| `list_field_values` | `POST /{index}/search` (`terms`) | Distinct values + counts. `breakdown_by` crosses two fields in one call |
| `field_stats` | `POST /{index}/search` (`stats`, `percentiles`, `cardinality`) | count/min/max/avg/sum, p50–p99, distinct count |
| `count_over_time` | `POST /{index}/search` (`date_histogram`) | Counts per bucket, optional `group_by` |
| `summarize_log_patterns` | _qwui (Drain)_ | Clusters up to 10 000 events into templates |
| `explain_search_plan` | `POST /{index}/search-plan` | Why a query is slow or empty |
| `list_indexes` | `GET /indexes` | Indexes, timestamp field, and `searchable_together` groups |
| `list_index_fields` | `GET /indexes` + sample | Fields with type and `fast` flag |
| `describe_index` | `GET /indexes/{id}/describe` | Size, doc counts, time range |
| `list_splits` | `GET /indexes/{id}/splits` | Storage units. Truncated, `limit` defaults to 20 |
| `list_templates` | `GET /templates` | Index templates |
| `get_template` | `GET /templates/{id}` | One template in full |
| `cluster_info` | `GET /cluster` | Members, roles, readiness |
| `node_config` | `GET /config` | Resolved node configuration |
| `node_version` | `GET /version` | Version and build info |
| `indexing_status` | `GET /indexing` | Pipeline health. Needs `QUICKWIT_INDEXER_URL` |
| `debug_info` | `GET /api/developer/debug` | Drills down rather than dumping 130 KB |

### Multi-index search

Pass several index ids comma-separated. Quickwit accepts this only when they
share a timestamp field, and rejects the rest with *"the timestamp field must be
the same for all indexes"*. `list_indexes` therefore returns
`searchable_together`, grouping indexes by timestamp field so the agent does not
discover the constraint by trial and error.

Verified: searching two namespaces together returns the sum of their hits
(14 205 + 17 918 = 32 123).

### Response sizes are managed

Log documents are large, and an agent that spends its context on raw JSON has
none left to reason with.

- `search_logs` defaults to 10 hits, capped by `MCP_MAX_HITS` (50).
- `list_indexes` is trimmed; the raw Quickwit response is hundreds of KB.
- `cluster_info` drops the 13 KB chitchat gossip snapshot unless
  `include_gossip_state: true` — 14.5 KB → 1 KB.
- `debug_info` returns an index of nodes and sections with their sizes, then
  `node` and `section` drill in — 132 KB → 4.5 KB.
- `list_splits` truncates and says so.

## Query syntax

Queries are **Tantivy**, not Lucene, KQL or Elasticsearch DSL. A model left to
guess reaches for Lucene, so `search_logs` carries this cheatsheet in its
description:

| Pattern | Meaning |
|---|---|
| `*` | every document |
| `term` | search the index's default fields |
| `field:value` | match a field |
| `field:"two words"` | phrase |
| `a AND b`, `a OR b`, `NOT a` | boolean — operators must be UPPERCASE |
| `(a OR b) AND c` | grouping |
| `field:>100`, `field:>=1` | numeric range shorthand |
| `field:[10 TO 50]` | inclusive range; `{` `}` for exclusive |
| `field:prefix*` | prefix wildcard |
| `NOT field:*` | field is absent |
| `field:IN [a b c]` | any of several terms |

Escape `+ - && || ! ( ) { } [ ] ^ " ~ * ? : \ /` with a backslash.

## Time expressions

Quickwit accepts only Unix epoch **seconds**, which is the worst piece of
ergonomics in its API for an LLM caller: asked "what failed in the last fifteen
minutes" a model has to know the current time and do arithmetic, and it
frequently uses milliseconds instead.

So the tools accept:

| Form | Example |
|---|---|
| `now` | `now` |
| `now-<n><unit>`, units `s` `m` `h` `d` `w` | `now-15m`, `now-2h`, `now-7d` |
| RFC 3339 | `2026-08-19T16:44:16Z` |
| epoch seconds | `1787157856` |

Millisecond values are rejected rather than accepted: they are valid `i64`s, so
Quickwit would happily search a window in the year 57000 and return nothing —
a failure the agent cannot diagnose from the outside.

`search_logs` defaults to the last 15 minutes, the same range the UI opens with.

## Read-only by construction

Not a runtime flag — which is why there is no `MCP_ALLOW_WRITES`.

Every Quickwit call goes through a `ReadCall` type whose only constructors are
`get` and `search`, and `search` accepts only the two non-mutating POST paths
(`/search`, `/search-plan`). `DELETE`, `PUT` and mutating `POST` paths cannot be
expressed, so there is no setting that could unlock one. `cargo test` asserts it.

Nothing here can create, modify or delete an index, template or document. Every
tool is also annotated `readOnlyHint: true`, which clients can surface to users.

## Load guardrail

Agents do not pace themselves, and `summarize_log_patterns` fans out into 20
parallel searches. A searcher can report `num_cpus: 1`, and unthrottled that is
a load generator aimed at the cluster people use to diagnose outages.

Limits are sized from what Quickwit says about itself, read from
`/api/v1/config` and `/api/v1/version` at startup — not guessed:

- **Concurrency** — a semaphore over every Quickwit request MCP makes, at four
  per core and never above Quickwit's `max_num_concurrent_split_searches`.
  Excess calls queue rather than fail: the pattern sample still collects all
  twenty buckets, four at a time. Measured cost on a one-hour sample: 1.6s → 1.9s.
- **Rate limit** — `MCP_RATE_LIMIT_PER_MIN` calls per token per minute (default
  120), answered with `429`, `Retry-After`, and a hint to use an aggregation tool
  instead of looping. Successful responses carry `X-RateLimit-Remaining`.
- **Timeout** — inherited from Quickwit's own `request_timeout_secs`, so a
  concurrency slot is never held by a request Quickwit has already abandoned.
- **Bucket ceiling** — `count_over_time` checks the bucket count against
  `aggregation_bucket_limit` before sending. Asking for 30 days at one-second
  buckets across 100 groups is refused locally with *"needs 259200000 buckets,
  over Quickwit's limit of 65000"*, rather than as an opaque Quickwit 400.

If Quickwit cannot be probed, conservative defaults apply (4 concurrent, 30s) and
the log says so. `MCP_MAX_CONCURRENT_REQUESTS` overrides the derived value.

## Audit trail and metrics

The guardrail stops an agent overwhelming Quickwit. It says nothing about what
the agent read — so both are recorded.

One audit line per call: agent, tool, index, query, status, duration.

```
MCP call agent=ci-bot   tool=search_logs  index="demo" query="severity_text:ERROR" status=200 duration_ms=8
MCP call agent=analyste tool=list_indexes index="-"    query="-"                   status=200 duration_ms=4
MCP request rejected: no valid bearer token
MCP rate limit reached; refusing a call to protect Quickwit agent=ci-bot wait_secs=60
```

The secret never appears, in the log or in a label. The logged query is truncated
to 500 characters, so caller-controlled text cannot set the size of a log line.

`/metrics` serves Prometheus counters when `METRICS_ENABLED=true`:

| Metric | Labels | Answers |
|---|---|---|
| `qwui_mcp_tool_calls_total` | agent, tool, outcome | who calls what, and whether it works |
| `qwui_mcp_tool_duration_seconds` | tool | which tools are quietly expensive |
| `qwui_mcp_rejections_total` | reason | an agent misbehaving (`unauthorized`, `rate_limited`) |
| `qwui_mcp_quickwit_requests_total` | outcome | fan-out — one tool call can be 20 searches |
| `qwui_mcp_permit_wait_seconds` | kind | whether the concurrency guardrail is now the bottleneck |

Labels are low-cardinality by design. `agent` is a token *name*, never a
free-form string from a request, so a caller cannot inflate the series count.

`/metrics` is unauthenticated by design, so an in-cluster Prometheus can scrape
it without a credential. That makes it a footgun behind a catch-all ingress —
one that routes `/` as a `Prefix` puts `/metrics` on the public internet.
Hence off by default. It carries
no query text and no credentials, but it does name the configured agents, so
block the path when `/` is publicly routed:

```yaml
# nginx ingress
nginx.ingress.kubernetes.io/server-snippet: |
  location /metrics { deny all; return 404; }
```

## Verifying a deployment

`/mcp` is a POST-only JSON-RPC endpoint — opening it in a browser returns `405`,
and that is true whether or not it is working. Three checks that mean something:

**1. Is it actually being served?** `features.mcp` in `/api/auth/status` reports
whether the endpoint is mounted, not merely whether `MCP_ENABLED` is set:

```bash
curl -s https://qwui.example.com/api/auth/status | jq .features
# {"mcp": true, "vrl": true}
```

`false` while `MCP_ENABLED=true` means it failed closed — almost always a missing
`MCP_TOKENS`. The startup log says so explicitly:

```
MCP_ENABLED=true but MCP_TOKENS is empty: /mcp will NOT be served.
```

**2. Does it answer?** Without a token it must be `401`. A `405` means the route
is not mounted at all.

```bash
curl -s -o /dev/null -w '%{http_code}
' -X POST https://qwui.example.com/mcp   -H 'Content-Type: application/json' -d '{}'
# 401 -> mounted and guarded
# 405 -> not mounted, see check 1
```

**3. Does it list its tools?**

```bash
curl -s -X POST https://qwui.example.com/mcp   -H "Authorization: Bearer $MCP_TOKEN"   -H 'Content-Type: application/json'   -H 'Accept: application/json, text/event-stream'   -H 'MCP-Protocol-Version: 2026-07-28'   -H 'Mcp-Method: tools/list'   -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{
        "io.modelcontextprotocol/protocolVersion":"2026-07-28",
        "io.modelcontextprotocol/clientCapabilities":{}}}}' | jq '.result.tools | length'
# 17
```

Then point a real client at it and read the audit log to see which tools it chose.

## Keeping up with Quickwit upgrades

The tools wrap a hand-picked subset of Quickwit's API. Nothing is generated at
build time or at startup: the 14 handlers are ordinary Rust code.

That subset is checked against
[rust-backend/quickwit-api-surface.json](../rust-backend/quickwit-api-surface.json),
a vendored digest of Quickwit's own `/openapi.json`. It is used only by tests —
delete it and the backend still compiles and runs.

After upgrading Quickwit:

```bash
make dev                        # local Quickwit, pinned to the deployed version
make quickwit-api-surface       # re-vendor, then run the tests
```

Or against a real cluster:

```bash
kubectl -n quickwit port-forward svc/quickwit-searcher 7280:7280
python ci/refresh-quickwit-api-surface.py
```

The script prints what changed:

```
+ GET /api/v1/indexing-status
- GET /api/v1/indexing   <-- REMOVED upstream
```

and four tests then hold the contract:

| Test | Fails when |
|---|---|
| `every_wrapped_operation_exists_upstream` | a tool calls an endpoint Quickwit no longer has |
| `no_wrapped_operation_is_mutating` | a tool gains a write |
| `readable_upstream_operations_are_wrapped_or_explained` | Quickwit adds a readable endpoint in a covered tag that is neither wrapped nor listed in `INTENTIONALLY_UNWRAPPED` with a reason |
| `excuses_refer_to_real_operations` | the excuse list names an endpoint that no longer exists |

Generating tools from the spec at startup was the alternative, and was rejected
deliberately: it would let a Quickwit upgrade hand an agent `delete_index` with
nobody reviewing it. Detecting drift loudly beats absorbing it silently.

## Limitations

**Parsed fields.** `list_field_values`, `field_stats` and `count_over_time` need
a real field. Logs shipped as raw text do not have one: where a response time
lives inside the message string (`duration=55.409µs`), `duration:>500` matches
nothing, because `duration` is not a field.

Making it queryable means turning the value into a field, either with a Vector
transform at ingest — the only way to *filter* or *aggregate* on it — or with
qwui's VRL box for ad-hoc reading. VRL runs after the search, so it cannot narrow
results. Until then an agent reaches such values only through
`summarize_log_patterns` or by reading the message text.

**Dynamic field discovery is a sample.** Most log indexes use `mode: dynamic`,
where the declared mapping holds little more than the timestamp and every real
field comes from what was ingested. Quickwit has no API to enumerate them — the
only sources are the mapping and the documents themselves. `list_index_fields`
therefore samples 200 recent documents and marks what it finds
`"source": "observed"`. A field used only outside the sampled range can still
exist, and searching it works even when the listing missed it: the list is a
discovery aid, not a constraint.

**Empty aggregations are diagnosed, not silent.** Quickwit answers a `stats`
aggregation on a text field with `count: 0` rather than an error —
indistinguishable from "no documents matched", so an agent concludes the data is
missing and stops. An empty result therefore comes back with a `note` saying
whether the field exists, its type, and whether it is aggregatable.

**`indexing_status` needs the indexer.** `/api/v1/indexing` reports the local
node's pipelines and 404s anywhere the indexer service is not running. Set
`QUICKWIT_INDEXER_URL`. Every other endpoint answers on any node — Quickwit fans
search out over gRPC internally.

**`tools/list` advertises `ttlMs: 0`**, so clients do not cache the tool list.
Harmless; it costs a small amount of prompt-cache efficiency.

**No OAuth**, so claude.ai remote connectors are not supported yet. See
[Authentication](#authentication).

## Troubleshooting

| Symptom | Cause |
|---|---|
| `404` on `/mcp` | `MCP_ENABLED` is not `true`, or `MCP_TOKENS` is empty — check the startup log |
| `401` | wrong or missing `Authorization: Bearer` header |
| `429` | rate limit; the body names the limit and `Retry-After` the wait |
| `400 Invalid Request` mentioning `Host` | the hostname is not in `MCP_ALLOWED_HOSTS`. It defaults to localhost plus the hostnames in `OIDC_REDIRECT_URL` and `ORIGIN` |
| `400` missing `Mcp-Name` | `tools/call` must name the tool in an `Mcp-Name` header (SEP-2243). Any compliant client does this |
| `indexing_status` returns 404 | `QUICKWIT_INDEXER_URL` is unset or points at a searcher |
| a search returns nothing | check field names with `list_index_fields`, and remember the query language is Tantivy |
| `field_stats` returns `count: 0` | read the `note` — usually the field is text, not numeric |

Environment variables are listed in the [main README](../README.md#environment-variables).
