//! Read-only MCP server over Quickwit, mounted at `/mcp`.
//!
//! Why this lives in qwui rather than beside Quickwit: the backend is already a
//! Quickwit gateway. It holds the network path (`QUICKWIT_URL`,
//! `QUICKWIT_INDEXER_URL`), the deployment surface, and value-added endpoints
//! Quickwit does not have. `summarize_log_patterns` below is the clearest case
//! -- it reuses the same Drain implementation the UI's pattern button uses, and
//! collapsing ten thousand log lines into twenty templates is far more useful to
//! an agent than the raw lines, which would bury its context.
//!
//! Transport is Streamable HTTP. Protocol revision `2026-07-28` removed sessions
//! (SEP-2567), so `legacy_session_mode` is off and every request is served
//! statelessly: no session store, no sticky routing, any replica can answer.
//!
//! READ-ONLY: this is a property of the code, not a runtime flag. See
//! [`ReadCall`] -- the type cannot express a mutating request, so there is no
//! setting that could accidentally unlock one.

use axum::{
    body::Body,
    extract::State,
    http::{HeaderValue, Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    Router,
};
use reqwest::{Client as ReqwestClient, Method};
use rmcp::{
    handler::server::wrapper::{Json as McpJson, Parameters},
    model::{ErrorData, InitializeResult, ServerCapabilities, ServerInfo},
    tool, tool_handler, tool_router,
    transport::streamable_http_server::{
        session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
    },
    ServerHandler,
};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::{
    collections::HashMap,
    env,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::Semaphore;
use tracing::{info, warn};

use crate::{AppState, DrainTree};

/// Hard ceiling on `max_hits`, whatever a caller asks for. Log documents are
/// large; twenty of them can be tens of kilobytes of JSON, and an agent that
/// spends its context on raw hits has none left to reason with. Callers wanting
/// volume should reach for `summarize_log_patterns` instead.
const HITS_CEILING_DEFAULT: usize = 50;
const HITS_DEFAULT: usize = 10;

/// Quickwit's own cap: `start_offset` beyond this is rejected by the searcher.
const MAX_START_OFFSET: usize = 10_000;

/// Documents sampled to discover dynamically-mapped fields. Enough to catch the
/// fields a log stream actually uses without making the call slow.
const FIELD_SAMPLE_DOCS: usize = 200;

/// Debug sections larger than this are replaced by a pointer telling the caller
/// how to ask for them, rather than inlined into a response nobody can read.
const DEBUG_SECTION_INLINE_LIMIT: usize = 4_000;

/// Tool calls per token per minute. Generous for a human-paced investigation --
/// the narrowing workflow is a handful of calls -- and low enough that a looping
/// agent is stopped within a minute.
const RATE_LIMIT_DEFAULT: usize = 120;

/// Cap on the request body the audit layer will buffer. Matches the order of
/// magnitude of an MCP JSON-RPC call; anything larger is not a tool call.
const MAX_AUDITED_BODY: usize = 1024 * 1024;

// ---------------------------------------------------------------------------
// Read-only call construction
// ---------------------------------------------------------------------------

/// Which Quickwit node role a call has to reach.
///
/// Nearly everything answers on any node -- Quickwit fans search out over gRPC
/// internally, so a search sent to the metastore returns the same hits as one
/// sent to a searcher. `/api/v1/indexing` is the exception: it reports the local
/// node's pipelines and 404s anywhere the indexer service is not running.
#[derive(Clone, Copy, PartialEq, Debug)]
enum Node {
    Any,
    Indexer,
}

/// A Quickwit REST call this server is allowed to make.
///
/// Read-only by construction. The only ways to build one are [`ReadCall::get`]
/// and [`ReadCall::search`], and the latter asserts the path is one of the two
/// non-mutating POST endpoints Quickwit exposes. `DELETE`, `PUT` and mutating
/// `POST` paths are simply not expressible, which is why this module has no
/// `allow_writes` switch: there would be nothing for it to turn on.
struct ReadCall {
    method: Method,
    path: String,
    node: Node,
    body: Option<Value>,
}

impl ReadCall {
    fn get(path: impl Into<String>) -> Self {
        Self {
            method: Method::GET,
            path: path.into(),
            node: Node::Any,
            body: None,
        }
    }

    fn on(mut self, node: Node) -> Self {
        self.node = node;
        self
    }

    /// The only POST permitted. `suffix` must be `search` or `search-plan`;
    /// anything else is a bug in this module and panics in tests via
    /// `read_only_by_construction`.
    fn search(index: &str, suffix: &str, body: Value) -> Self {
        debug_assert!(
            suffix == "search" || suffix == "search-plan",
            "ReadCall::search is only for the non-mutating search endpoints"
        );
        Self {
            method: Method::POST,
            path: format!("/api/v1/{}/{}", index, suffix),
            node: Node::Any,
            body: Some(body),
        }
    }
}

// ---------------------------------------------------------------------------
// Time parsing
// ---------------------------------------------------------------------------

/// Turns an agent-friendly time expression into the Unix epoch **seconds**
/// Quickwit's `start_timestamp` / `end_timestamp` expect.
///
/// Quickwit takes only epoch seconds, which is the single worst piece of
/// ergonomics in its API for an LLM caller: asked "what failed in the last
/// fifteen minutes" a model has to know the current time and do arithmetic, and
/// it frequently gets it wrong or silently uses milliseconds. Accepting
/// `now-15m` moves that arithmetic server-side where it is always right.
///
/// Accepts `now`, `now-<n><unit>` with unit `s`/`m`/`h`/`d`/`w`, an RFC 3339
/// timestamp, or a bare integer already in epoch seconds.
fn parse_time(input: &str) -> Result<i64, String> {
    let s = input.trim();
    let now = chrono::Utc::now().timestamp();

    if s.eq_ignore_ascii_case("now") {
        return Ok(now);
    }

    if let Some(rest) = s.strip_prefix("now-").or_else(|| s.strip_prefix("now+")) {
        let sign = if s.as_bytes()[3] == b'-' { -1 } else { 1 };
        let (digits, unit) = rest.split_at(
            rest.find(|c: char| !c.is_ascii_digit())
                .ok_or_else(|| format!("'{}' is missing a unit (s, m, h, d or w)", input))?,
        );
        let n: i64 = digits
            .parse()
            .map_err(|_| format!("'{}' has no number before the unit", input))?;
        let secs = match unit {
            "s" => 1,
            "m" => 60,
            "h" => 3_600,
            "d" => 86_400,
            "w" => 604_800,
            other => {
                return Err(format!(
                    "unknown unit '{}' in '{}'; use s, m, h, d or w",
                    other, input
                ))
            }
        };
        return Ok(now + sign * n * secs);
    }

    // A bare integer is already what Quickwit wants. Reject millisecond-looking
    // values rather than searching a window 50 000 years wide and returning
    // nothing, which is the failure an agent cannot diagnose from the outside.
    if let Ok(n) = s.parse::<i64>() {
        if n.abs() > 100_000_000_000 {
            return Err(format!(
                "{} looks like epoch milliseconds; Quickwit expects seconds",
                n
            ));
        }
        return Ok(n);
    }

    chrono::DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.timestamp())
        .map_err(|_| {
            format!(
                "could not read '{}' as a time; use 'now', 'now-15m', an RFC 3339 \
                 timestamp, or epoch seconds",
                input
            )
        })
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

/// What the Quickwit cluster says it can take, read from its own config at
/// startup rather than guessed.
///
/// A searcher can report `num_cpus: 1`, in which case the twenty parallel
/// searches `summarize_log_patterns` fires land on a single core. An
/// agent looping over that tool is a load generator pointed at the logging
/// cluster people use to diagnose outages, which is the wrong thing to be
/// casual about.
#[derive(Debug, Clone)]
pub(crate) struct QuickwitLimits {
    /// Simultaneous requests MCP may have in flight against Quickwit.
    max_concurrent: usize,
    /// Quickwit's own `aggregation_bucket_limit`; asking for more is rejected.
    aggregation_bucket_limit: usize,
    /// Aligned with Quickwit's `request_timeout_secs`, so a slot is never held
    /// by a request Quickwit has already given up on.
    request_timeout: Duration,
    /// Where each number came from, for the startup log.
    source: String,
}

impl QuickwitLimits {
    /// Conservative values for when the probe fails; the endpoint must still
    /// work with a Quickwit that will not tell us about itself.
    fn fallback(reason: &str) -> Self {
        Self {
            max_concurrent: 4,
            aggregation_bucket_limit: 65_000,
            request_timeout: Duration::from_secs(30),
            source: format!("defaults ({})", reason),
        }
    }
}

/// Reads Quickwit's capacity and derives the concurrency ceiling.
///
/// `num_cpus` is the binding constraint: four in-flight requests per core keeps
/// the searcher busy without queueing work it cannot start. It is also capped by
/// Quickwit's own `max_num_concurrent_split_searches`, since one of our requests
/// can fan out into many split searches underneath.
async fn probe_capacity(client: &ReqwestClient, base: &str) -> QuickwitLimits {
    let get = |path: &str| {
        let url = format!("{}{}", base, path);
        let client = client.clone();
        async move {
            client
                .get(&url)
                .timeout(Duration::from_secs(10))
                .send()
                .await
                .ok()?
                .json::<Value>()
                .await
                .ok()
        }
    };

    let (config, version) = futures::future::join(get("/api/v1/config"), get("/api/v1/version")).await;
    let Some(config) = config else {
        return QuickwitLimits::fallback("could not read /api/v1/config");
    };

    let cpus = version
        .as_ref()
        .and_then(|v| v.pointer("/runtime/num_cpus"))
        .and_then(|v| v.as_u64())
        .unwrap_or(1)
        .max(1) as usize;

    let split_searches = config
        .pointer("/searcher_config/max_num_concurrent_split_searches")
        .and_then(|v| v.as_u64())
        .unwrap_or(100) as usize;

    let bucket_limit = config
        .pointer("/searcher_config/aggregation_bucket_limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(65_000) as usize;

    let timeout_secs = config
        .pointer("/searcher_config/request_timeout_secs")
        .and_then(|v| v.as_u64())
        .unwrap_or(30);

    let max_concurrent = (cpus * 4).clamp(2, 32).min(split_searches.max(2));

    QuickwitLimits {
        max_concurrent,
        aggregation_bucket_limit: bucket_limit,
        request_timeout: Duration::from_secs(timeout_secs),
        source: format!(
            "num_cpus={} max_num_concurrent_split_searches={}",
            cpus, split_searches
        ),
    }
}

#[derive(Clone)]
pub(crate) struct QuickwitMcp {
    client: ReqwestClient,
    searcher_url: String,
    indexer_url: String,
    hits_ceiling: usize,
    limits: QuickwitLimits,
    /// Shared across every request, so the ceiling is a property of the whole
    /// endpoint and not of one agent's call.
    permits: Arc<Semaphore>,
}

impl QuickwitMcp {
    fn base(&self, node: Node) -> &str {
        match node {
            Node::Any => &self.searcher_url,
            Node::Indexer => &self.indexer_url,
        }
    }

    /// Issues a [`ReadCall`] and returns Quickwit's parsed JSON.
    ///
    /// Every request passes the shared semaphore, so the endpoint as a whole
    /// never has more work in flight against Quickwit than the cluster said it
    /// can take. Excess calls wait rather than being rejected: an agent
    /// experiences a slower answer, not a failure it has to interpret.
    async fn call(&self, call: ReadCall) -> Result<Value, ErrorData> {
        let m = crate::metrics::metrics();
        let waited = Instant::now();
        let _permit = self.permits.acquire().await.map_err(|_| {
            ErrorData::internal_error("MCP request limiter closed", None)
        })?;
        m.permit_wait
            .with_label_values(&["call"])
            .observe(waited.elapsed().as_secs_f64());

        let url = format!("{}{}", self.base(call.node), call.path);
        let mut req = self
            .client
            .request(call.method.clone(), &url)
            .timeout(self.limits.request_timeout);
        if let Some(body) = &call.body {
            req = req.json(body);
        }

        let resp = req.send().await.map_err(|e| {
            m.quickwit_requests
                .with_label_values(&[if e.is_timeout() { "timeout" } else { "transport_error" }])
                .inc();
            if e.is_timeout() {
                return ErrorData::internal_error(
                    format!(
                        "Quickwit did not answer {} within {}s. Narrow the time window or \
                         the query -- this is Quickwit's own request timeout.",
                        call.path,
                        self.limits.request_timeout.as_secs()
                    ),
                    None,
                );
            }
            ErrorData::internal_error(format!("Quickwit request to {} failed: {}", call.path, e), None)
        })?;

        let status = resp.status();
        m.quickwit_requests
            .with_label_values(&[if status.is_success() { "ok" } else { "http_error" }])
            .inc();
        let text = resp.text().await.unwrap_or_default();

        if !status.is_success() {
            // Quickwit's own message is the useful part -- it names the bad field
            // or the query syntax error, which is what lets the agent retry
            // correctly instead of guessing.
            let detail = serde_json::from_str::<Value>(&text)
                .ok()
                .and_then(|v| v.get("message").and_then(|m| m.as_str()).map(String::from))
                .unwrap_or_else(|| text.chars().take(500).collect());

            if status == reqwest::StatusCode::NOT_FOUND && call.node == Node::Indexer {
                return Err(ErrorData::internal_error(
                    format!(
                        "{} returned 404. This endpoint only exists on a node running the \
                         indexer service; set QUICKWIT_INDEXER_URL to one. ({})",
                        call.path, detail
                    ),
                    None,
                ));
            }
            return Err(ErrorData::internal_error(
                format!("Quickwit returned {} for {}: {}", status.as_u16(), call.path, detail),
                None,
            ));
        }

        serde_json::from_str(&text).map_err(|e| {
            ErrorData::internal_error(format!("Quickwit sent unparseable JSON: {}", e), None)
        })
    }

    /// Explains an aggregation that came back empty.
    ///
    /// Quickwit does not reject a `stats` aggregation on a text field -- it
    /// returns `count: 0`, which is indistinguishable from "no documents
    /// matched". An agent reading that concludes the data is not there and stops,
    /// when the real problem is the field it chose. So an empty result is
    /// diagnosed rather than passed through: does the field exist at all, and if
    /// it does, is it the wrong kind?
    async fn diagnose_empty(&self, index: &str, field: &str) -> String {
        let fields = match self.discover_fields(index).await {
            Ok(f) => f,
            Err(_) => return format!("no values for '{}' in this window", field),
        };

        match fields.iter().find(|(name, _, _)| name == field) {
            None => {
                let mut names: Vec<&str> = fields.iter().map(|(n, _, _)| n.as_str()).collect();
                names.sort_unstable();
                format!(
                    "field '{}' was not found in this index. Available fields: {}. \
                     (Field discovery samples documents, so a field used only outside the \
                     sampled range could still exist.)",
                    field,
                    names.join(", ")
                )
            }
            Some((_, ty, fast)) => format!(
                "field '{}' exists with type '{}' (fast={}), but the aggregation returned \
                 nothing. Either no document matched the query and window, or the field is \
                 the wrong kind for this aggregation -- numeric statistics need a numeric \
                 field, and a text field can only be counted by value with \
                 list_field_values.",
                field, ty, fast
            ),
        }
    }

    /// The fields of an index as (name, type, is_fast), from the declared mapping
    /// plus, under dynamic mapping, a sample of documents.
    async fn discover_fields(&self, index: &str) -> Result<Vec<(String, String, bool)>, ErrorData> {
        let first = index.split(',').next().unwrap_or(index).trim();
        let raw = self.call(ReadCall::get("/api/v1/indexes")).await?;
        let entry = raw
            .as_array()
            .and_then(|arr| {
                arr.iter().find(|i| {
                    i.pointer("/index_config/index_id").and_then(|v| v.as_str()) == Some(first)
                })
            })
            .ok_or_else(|| {
                ErrorData::invalid_params(
                    format!("no index named '{}'; call list_indexes", first),
                    None,
                )
            })?;

        let mapping = entry.pointer("/index_config/doc_mapping");
        let mut declared = Vec::new();
        if let Some(fm) = mapping
            .and_then(|m| m.get("field_mappings"))
            .and_then(|f| f.as_array())
        {
            flatten_fields(fm, "", &mut declared);
        }
        let mut out: Vec<(String, String, bool)> = declared
            .iter()
            .map(|f| {
                (
                    f["name"].as_str().unwrap_or_default().to_string(),
                    f["type"].as_str().unwrap_or("unknown").to_string(),
                    f.get("fast").and_then(|v| v.as_bool()).unwrap_or(false),
                )
            })
            .collect();

        let dynamic = mapping
            .and_then(|m| m.get("mode"))
            .and_then(|v| v.as_str())
            == Some("dynamic");
        if dynamic {
            // Dynamic fields inherit the dynamic mapping's `fast` setting, which
            // is what decides whether they can be aggregated at all.
            let dyn_fast = mapping
                .and_then(|m| m.pointer("/dynamic_mapping/fast"))
                .map(|v| !v.is_null())
                .unwrap_or(false);
            let _permit = self.permits.acquire().await;
            let hits = crate::fetch_batch(
                &self.client,
                &self.searcher_url,
                first,
                "*",
                0,
                FIELD_SAMPLE_DOCS,
                None,
                None,
            )
            .await
            .unwrap_or_default();
            let mut observed = std::collections::BTreeMap::new();
            for hit in &hits {
                collect_observed(hit, "", &mut observed);
            }
            for (name, ty) in observed {
                if !out.iter().any(|(n, _, _)| *n == name) {
                    out.push((name, ty.to_string(), dyn_fast));
                }
            }
        }

        Ok(out)
    }

    /// Looks up an index's timestamp field, which `date_histogram` needs by name
    /// and which differs between indexes (`@timestamp` for the Kubernetes ones,
    /// `timestamp_nanos` for `otel-logs-v0_9`). Asking Quickwit beats making the
    /// agent guess and get an obscure aggregation error back.
    async fn timestamp_field(&self, index: &str) -> Result<String, ErrorData> {
        // A comma-separated multi-index target has no single answer; take the
        // first, which is the one whose timestamp field they must all share.
        let first = index.split(',').next().unwrap_or(index).trim();
        let all = self.call(ReadCall::get("/api/v1/indexes")).await?;
        all.as_array()
            .and_then(|arr| {
                arr.iter().find(|i| {
                    i.pointer("/index_config/index_id").and_then(|v| v.as_str()) == Some(first)
                })
            })
            .and_then(|i| {
                i.pointer("/index_config/doc_mapping/timestamp_field")
                    .and_then(|v| v.as_str())
                    .map(String::from)
            })
            .ok_or_else(|| {
                ErrorData::invalid_params(
                    format!(
                        "could not find the timestamp field of '{}'; call list_indexes",
                        first
                    ),
                    None,
                )
            })
    }

    /// Resolves a time window, defaulting to "the last 15 minutes" when neither
    /// bound is given -- the same default the UI opens with, and a far better
    /// default than "all time" against an index holding months of logs.
    fn window(
        start: &Option<String>,
        end: &Option<String>,
    ) -> Result<(Option<i64>, Option<i64>), ErrorData> {
        let s = match start {
            Some(v) => Some(parse_time(v).map_err(|e| ErrorData::invalid_params(e, None))?),
            None => None,
        };
        let e = match end {
            Some(v) => Some(parse_time(v).map_err(|e| ErrorData::invalid_params(e, None))?),
            None => None,
        };
        if let (Some(s), Some(e)) = (s, e) {
            if s >= e {
                return Err(ErrorData::invalid_params(
                    format!("start_time ({}) must be before end_time ({})", s, e),
                    None,
                ));
            }
        }
        Ok((s, e))
    }
}

// ---------------------------------------------------------------------------
// Tool parameters
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct SearchParams {
    /// Index to search. One index id, or several comma-separated to search them
    /// together -- multi-index only works when they share a timestamp field.
    index: String,
    /// Tantivy query. See the tool description for the syntax; it is NOT Lucene,
    /// KQL or Elasticsearch DSL. Use `*` to match everything.
    query: String,
    /// Window start: `now-15m`, `now-2h`, RFC 3339, or epoch seconds.
    /// Defaults to 15 minutes before `end_time`.
    #[serde(default)]
    start_time: Option<String>,
    /// Window end, same formats. Defaults to `now`.
    #[serde(default)]
    end_time: Option<String>,
    /// Hits to return. Small on purpose: raw log documents are large. Use
    /// `summarize_log_patterns` when you need to understand volume.
    #[serde(default)]
    max_hits: Option<usize>,
    /// Offset for paging. Quickwit rejects values above 10000.
    #[serde(default)]
    start_offset: Option<usize>,
    /// Keep only these fields in each hit. Strongly recommended: it is the
    /// difference between a readable result and one that fills the context.
    #[serde(default)]
    fields: Option<Vec<String>>,
    /// Field to sort on, prefixed with `-` for descending (e.g. `-@timestamp`).
    /// Only fast fields can be sorted; omit to get relevance order.
    #[serde(default)]
    sort_by: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct PatternParams {
    /// Index to analyse.
    index: String,
    /// Tantivy query narrowing what gets clustered. `*` for everything.
    query: String,
    /// Window start (`now-1h`, RFC 3339, epoch seconds). A window is strongly
    /// recommended: with one, sampling is spread evenly across it.
    #[serde(default)]
    start_time: Option<String>,
    /// Window end.
    #[serde(default)]
    end_time: Option<String>,
    /// Cluster on one field instead of the whole document, e.g. `message`.
    #[serde(default)]
    field: Option<String>,
    /// How many of the largest patterns to return. Defaults to 10.
    #[serde(default)]
    top_n: Option<usize>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct IndexParams {
    /// Index id.
    index: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct SplitParams {
    /// Index id.
    index: String,
    /// Maximum splits to return. Defaults to 20; a mature index has thousands.
    #[serde(default)]
    limit: Option<usize>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct TemplateParams {
    /// Template id.
    template_id: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct FieldValuesParams {
    /// Index to look in.
    index: String,
    /// Field whose distinct values you want, e.g. `pod_name`, `container_name`,
    /// `severity_text`.
    field: String,
    /// Optional Tantivy query to count within. `*` or omitted counts everything
    /// in the window.
    #[serde(default)]
    query: Option<String>,
    /// Window start (`now-1h`, RFC 3339, epoch seconds). Defaults to the whole
    /// retained range, which is usually what you want when asking "what exists".
    #[serde(default)]
    start_time: Option<String>,
    /// Window end.
    #[serde(default)]
    end_time: Option<String>,
    /// How many values to return, most frequent first. Defaults to 20.
    #[serde(default)]
    size: Option<usize>,
    /// Break each value down by a second field, e.g. `field: "pod_name"` with
    /// `breakdown_by: "severity_text"` to get the severity mix per pod. One
    /// Quickwit request, not one per pod.
    #[serde(default)]
    breakdown_by: Option<String>,
    /// How many sub-values per value. Defaults to 5.
    #[serde(default)]
    breakdown_limit: Option<usize>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct FieldStatsParams {
    /// Index to look in.
    index: String,
    /// Numeric field to summarise, e.g. a duration or a status code.
    field: String,
    /// Optional Tantivy query to restrict the population.
    #[serde(default)]
    query: Option<String>,
    /// Window start.
    #[serde(default)]
    start_time: Option<String>,
    /// Window end.
    #[serde(default)]
    end_time: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct CountOverTimeParams {
    /// Index to count in.
    index: String,
    /// Tantivy query defining what to count, e.g. `severity_text:ERROR`.
    query: String,
    /// Window start. Defaults to one hour before `end_time`.
    #[serde(default)]
    start_time: Option<String>,
    /// Window end. Defaults to now.
    #[serde(default)]
    end_time: Option<String>,
    /// Bucket width: `30s`, `1m`, `5m`, `1h`, `1d`. Omit and one is chosen to
    /// give roughly 60 buckets across the window.
    #[serde(default)]
    interval: Option<String>,
    /// Break the counts down by this field as well, e.g. `pod_name` to see which
    /// pod a spike came from.
    #[serde(default)]
    group_by: Option<String>,
    /// When grouping, how many groups to keep. Defaults to 10.
    #[serde(default)]
    group_limit: Option<usize>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct ClusterParams {
    /// Include the chitchat gossip state snapshot. Off by default: it is 13 KB
    /// of internals and rarely what you want.
    #[serde(default)]
    include_gossip_state: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct DebugParams {
    /// Node to drill into. Omit for a cluster-wide index of nodes and the
    /// sections each one offers.
    #[serde(default)]
    node: Option<String>,
    /// Section within `node` to return in full, e.g. `control_plane` or
    /// `cluster_membership_info`.
    #[serde(default)]
    section: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct NoParams {}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

#[tool_router]
impl QuickwitMcp {
    /// Search logs in a Quickwit index and return matching documents.
    ///
    /// QUERY SYNTAX -- this is Tantivy, not Lucene, KQL or Elasticsearch DSL.
    /// Sending ES JSON or KQL here produces a parse error.
    ///   `*`                        every document
    ///   `term`                     search the index's default fields
    ///   `field:value`              match a field
    ///   `field:"two words"`        phrase
    ///   `severity_text:ERROR`      exact term on a raw/keyword field
    ///   `a AND b`, `a OR b`, `NOT a`   boolean (operators must be UPPERCASE)
    ///   `(a OR b) AND c`           grouping
    ///   `field:>100`, `field:>=1`  numeric range shorthand
    ///   `field:[10 TO 50]`         inclusive range; `{` `}` for exclusive
    ///   `field:prefix*`            prefix wildcard
    ///   `NOT field:*`              field is absent
    ///   `field:IN [a b c]`         any of several terms
    /// Escape `+ - && || ! ( ) { } [ ] ^ " ~ * ? : \ /` with a backslash.
    ///
    /// Time is a window over the index's timestamp field, given in friendly form
    /// (`now-15m`) and converted to the epoch seconds Quickwit needs. Defaults to
    /// the last 15 minutes -- widen it deliberately rather than by omission.
    ///
    /// Pass `fields` to project only what you need. Log documents are large and
    /// a full hit is mostly noise for a specific question.
    #[tool(annotations(title = "Search logs", read_only_hint = true))]
    async fn search_logs(
        &self,
        Parameters(p): Parameters<SearchParams>,
    ) -> Result<McpJson<Value>, ErrorData> {
        let (start, end) = Self::window(&p.start_time, &p.end_time)?;
        // Neither bound given: last 15 minutes, matching the UI's opening range.
        let (start, end) = match (start, end) {
            (None, None) => {
                let now = chrono::Utc::now().timestamp();
                (Some(now - 900), Some(now))
            }
            (None, Some(e)) => (Some(e - 900), Some(e)),
            (Some(s), None) => (Some(s), Some(chrono::Utc::now().timestamp())),
            (s, e) => (s, e),
        };

        let max_hits = p.max_hits.unwrap_or(HITS_DEFAULT).min(self.hits_ceiling).max(1);
        let start_offset = p.start_offset.unwrap_or(0);
        if start_offset > MAX_START_OFFSET {
            return Err(ErrorData::invalid_params(
                format!(
                    "start_offset {} exceeds Quickwit's limit of {}. Narrow the time \
                     window instead of paging deeper.",
                    start_offset, MAX_START_OFFSET
                ),
                None,
            ));
        }

        let mut body = json!({
            "query": p.query,
            "max_hits": max_hits,
            "start_offset": start_offset,
            "count_all": true,
        });
        if let Some(s) = start {
            body["start_timestamp"] = json!(s);
        }
        if let Some(e) = end {
            body["end_timestamp"] = json!(e);
        }
        if let Some(sort) = &p.sort_by {
            body["sort_by"] = json!(sort);
        }

        let mut result = self
            .call(ReadCall::search(&p.index, "search", body))
            .await?;

        // Project requested fields, and drop the snippet/aggregation noise the
        // caller did not ask for.
        if let Some(fields) = &p.fields {
            if let Some(hits) = result.get_mut("hits").and_then(|h| h.as_array_mut()) {
                for hit in hits.iter_mut() {
                    if let Some(obj) = hit.as_object() {
                        let kept: Map<String, Value> = fields
                            .iter()
                            .filter_map(|f| obj.get(f).map(|v| (f.clone(), v.clone())))
                            .collect();
                        *hit = Value::Object(kept);
                    }
                }
            }
        }

        Ok(McpJson(json!({
            "num_hits": result.get("num_hits").cloned().unwrap_or(json!(0)),
            "returned": result.get("hits").and_then(|h| h.as_array()).map_or(0, |a| a.len()),
            "elapsed_time_micros": result.get("elapsed_time_micros").cloned(),
            "window": { "start_timestamp": start, "end_timestamp": end },
            "hits": result.get("hits").cloned().unwrap_or(json!([])),
            "errors": result.get("errors").cloned().unwrap_or(json!([])),
        })))
    }

    /// Cluster logs into templates using the Drain algorithm, instead of reading
    /// them one by one.
    ///
    /// Reach for this first on any "what is going on / what changed / what is
    /// noisy" question. It samples up to 10 000 events spread evenly across the
    /// time window, replaces the variable parts of each line with `<*>`, groups
    /// by similarity, and returns the largest templates with their share of the
    /// total. Ten thousand log lines come back as roughly twenty templates, so
    /// it answers questions about volume that `search_logs` cannot without
    /// burying you in documents.
    ///
    /// This is computed by qwui, not Quickwit -- it is the same analysis the
    /// UI's pattern button runs.
    #[tool(annotations(title = "Summarize log patterns", read_only_hint = true))]
    async fn summarize_log_patterns(
        &self,
        Parameters(p): Parameters<PatternParams>,
    ) -> Result<McpJson<Value>, ErrorData> {
        let (start, end) = Self::window(&p.start_time, &p.end_time)?;
        let field = p.field.clone().unwrap_or_else(|| "_all".to_string());
        let top_n = p.top_n.unwrap_or(10).clamp(1, 100);

        let hits = if let (Some(s), Some(e)) = (start, end) {
            // Sample per bucket in parallel. Quickwit refuses start_offset above
            // 10 000, so slicing the window is the only way to see more than
            // that many events.
            let buckets = crate::PATTERN_BUCKETS;
            let bucket = ((e - s) / buckets as i64).max(1);
            let mut tasks = Vec::with_capacity(buckets);
            for i in 0..buckets {
                let b_start = s + i as i64 * bucket;
                let b_end = if i == buckets - 1 { e } else { b_start + bucket };
                let client = self.client.clone();
                let url = self.searcher_url.clone();
                let index = p.index.clone();
                let query = p.query.clone();
                // All twenty buckets are still spawned, but each waits for a
                // permit before touching Quickwit. They therefore run
                // `max_concurrent` at a time instead of all at once -- the whole
                // sample still arrives, just without spiking a one-core searcher.
                let permits = self.permits.clone();
                tasks.push(tokio::spawn(async move {
                    let _permit = permits.acquire().await;
                    crate::fetch_batch(
                        &client,
                        &url,
                        &index,
                        &query,
                        0,
                        crate::PATTERN_BUCKET_SIZE,
                        Some(b_start),
                        Some(b_end),
                    )
                    .await
                }));
            }
            let mut all = Vec::new();
            for t in futures::future::join_all(tasks).await {
                match t {
                    Ok(Ok(h)) => all.extend(h),
                    Ok(Err(e)) => {
                        return Err(ErrorData::internal_error(
                            format!("sampling failed: {}", e),
                            None,
                        ))
                    }
                    Err(e) => {
                        return Err(ErrorData::internal_error(
                            format!("sampling task failed: {}", e),
                            None,
                        ))
                    }
                }
            }
            all
        } else {
            let _permit = self.permits.acquire().await;
            crate::fetch_batch(
                &self.client,
                &self.searcher_url,
                &p.index,
                &p.query,
                0,
                crate::PATTERN_BUCKETS * crate::PATTERN_BUCKET_SIZE,
                None,
                None,
            )
            .await
            .map_err(|e| ErrorData::internal_error(format!("sampling failed: {}", e), None))?
        };

        let mut tree = DrainTree::new();
        for hit in &hits {
            let text = crate::extract_field_text(hit, &field);
            if !text.is_empty() {
                tree.add(&text);
            }
        }

        let total = tree.total;
        let clusters = tree.total_clusters();
        let patterns: Vec<Value> = tree
            .top_n(top_n)
            .iter()
            .map(|c| {
                let pct = if total > 0 {
                    (c.count as f64 / total as f64 * 10_000.0).round() / 100.0
                } else {
                    0.0
                };
                json!({
                    "template": c.tokens.join(" "),
                    "count": c.count,
                    "percentage": pct,
                    "sample": c.sample,
                })
            })
            .collect();

        Ok(McpJson(json!({
            "sampled_logs": total,
            "total_clusters": clusters,
            "returned_patterns": patterns.len(),
            "field": field,
            "window": { "start_timestamp": start, "end_timestamp": end },
            "patterns": patterns,
        })))
    }

    /// List the distinct values of a field, with a document count for each.
    ///
    /// This is how you find out what is actually in an index before querying it:
    /// which pods exist, which containers, which severity levels. Run it on
    /// `pod_name` to get the pod list, then feed the interesting ones back into
    /// `search_logs` as `pod_name:IN [pod-a pod-b]`.
    ///
    /// Values come back most frequent first, so the counts themselves are a
    /// signal -- a pod producing ten times its neighbours' log volume is
    /// visible here before you read a single line.
    ///
    /// Only `fast` fields can be aggregated. `list_index_fields` marks which
    /// ones those are; under dynamic mapping they generally all are.
    #[tool(annotations(title = "List field values", read_only_hint = true))]
    async fn list_field_values(
        &self,
        Parameters(p): Parameters<FieldValuesParams>,
    ) -> Result<McpJson<Value>, ErrorData> {
        let (start, end) = Self::window(&p.start_time, &p.end_time)?;
        let size = p.size.unwrap_or(20).clamp(1, 1000);

        let mut terms = json!({ "terms": { "field": p.field, "size": size } });
        if let Some(by) = &p.breakdown_by {
            let limit = p.breakdown_limit.unwrap_or(5).clamp(1, 50);
            terms["aggs"] = json!({ "sub": { "terms": { "field": by, "size": limit } } });
        }
        let mut body = json!({
            "query": p.query.clone().unwrap_or_else(|| "*".into()),
            "max_hits": 0,
            "aggs": { "values": terms },
        });
        if let Some(s) = start {
            body["start_timestamp"] = json!(s);
        }
        if let Some(e) = end {
            body["end_timestamp"] = json!(e);
        }

        let res = self
            .call(ReadCall::search(&p.index, "search", body))
            .await
            .map_err(|e| aggregation_hint(e, &p.field))?;

        let buckets = res
            .pointer("/aggregations/values/buckets")
            .and_then(|b| b.as_array())
            .map(|arr| {
                arr.iter()
                    .map(|b| {
                        let mut entry = json!({
                            "value": b.get("key_as_string").or_else(|| b.get("key")).cloned(),
                            "count": b.get("doc_count").cloned(),
                        });
                        if p.breakdown_by.is_some() {
                            entry["breakdown"] = json!(b
                                .pointer("/sub/buckets")
                                .and_then(|s| s.as_array())
                                .map(|arr| arr
                                    .iter()
                                    .map(|x| json!({
                                        "value": x.get("key_as_string").or_else(|| x.get("key")).cloned(),
                                        "count": x.get("doc_count").cloned(),
                                    }))
                                    .collect::<Vec<_>>())
                                .unwrap_or_default());
                        }
                        entry
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        // An unknown or non-aggregatable field yields an empty bucket list, not
        // an error, so say which it was instead of implying the field is empty.
        let note = if buckets.is_empty() {
            Some(self.diagnose_empty(&p.index, &p.field).await)
        } else {
            None
        };

        Ok(McpJson(json!({
            "index": p.index,
            "field": p.field,
            "breakdown_by": p.breakdown_by,
            "total_documents": res.get("num_hits").cloned(),
            "returned_values": buckets.len(),
            "note": note,
            // Quickwit reports what a wider `size` would have caught, which tells
            // the caller whether the list is the whole story.
            "sum_other_doc_count": res
                .pointer("/aggregations/values/sum_other_doc_count")
                .cloned(),
            "window": { "start_timestamp": start, "end_timestamp": end },
            "values": buckets,
        })))
    }

    /// Summarise a numeric field: count, min, max, average and sum.
    ///
    /// Use it to pick a threshold instead of guessing one. Asked for "requests
    /// slower than X", run this first to learn what the distribution looks like,
    /// then query `duration:>X` with an X that means something for this index.
    ///
    /// Combine it with `query` to compare populations -- the average duration
    /// for one pod against another, or for 500s against 200s.
    #[tool(annotations(title = "Field statistics", read_only_hint = true))]
    async fn field_stats(
        &self,
        Parameters(p): Parameters<FieldStatsParams>,
    ) -> Result<McpJson<Value>, ErrorData> {
        let (start, end) = Self::window(&p.start_time, &p.end_time)?;

        // Percentiles alongside stats, in the same Quickwit request. On a latency
        // field the average is close to useless -- one 10s request among a
        // thousand at 5ms barely moves it, while p99 shows it immediately -- so
        // returning only min/max/avg would leave the agent with the wrong tool
        // for the commonest numeric question there is.
        let mut body = json!({
            "query": p.query.clone().unwrap_or_else(|| "*".into()),
            "max_hits": 0,
            "aggs": {
                "s": { "stats": { "field": p.field } },
                "p": { "percentiles": { "field": p.field, "percents": [50, 75, 90, 95, 99] } },
                "c": { "cardinality": { "field": p.field } },
            },
        });
        if let Some(s) = start {
            body["start_timestamp"] = json!(s);
        }
        if let Some(e) = end {
            body["end_timestamp"] = json!(e);
        }

        let res = self
            .call(ReadCall::search(&p.index, "search", body))
            .await
            .map_err(|e| aggregation_hint(e, &p.field))?;

        let s = res.pointer("/aggregations/s").cloned().unwrap_or(json!({}));

        // Quickwit answers a stats aggregation on a text field with count: 0
        // rather than an error, which reads as "no data" when it means "wrong
        // field". Diagnose it so the agent picks a different field instead of
        // concluding the logs are empty.
        let note = if s.get("count").and_then(|c| c.as_u64()).unwrap_or(0) == 0 {
            Some(self.diagnose_empty(&p.index, &p.field).await)
        } else {
            None
        };

        Ok(McpJson(json!({
            "index": p.index,
            "field": p.field,
            "query": p.query.clone().unwrap_or_else(|| "*".into()),
            "window": { "start_timestamp": start, "end_timestamp": end },
            "note": note,
            "count": s.get("count").cloned(),
            "min": s.get("min").cloned(),
            "max": s.get("max").cloned(),
            "avg": s.get("avg").cloned(),
            "sum": s.get("sum").cloned(),
            "distinct_values": res.pointer("/aggregations/c/value").cloned(),
            "percentiles": res.pointer("/aggregations/p/values").cloned(),
        })))
    }

    /// Count matching documents per time bucket, optionally broken down by a
    /// field. The tool for "when did this start" and "is it getting worse".
    ///
    /// This is the histogram above the results table, as data. Counting
    /// `severity_text:ERROR` per minute shows when a spike began; adding
    /// `group_by: "pod_name"` shows which pod caused it. Far cheaper than
    /// reading logs, because only counts come back, never documents.
    #[tool(annotations(title = "Count over time", read_only_hint = true))]
    async fn count_over_time(
        &self,
        Parameters(p): Parameters<CountOverTimeParams>,
    ) -> Result<McpJson<Value>, ErrorData> {
        let (start, end) = Self::window(&p.start_time, &p.end_time)?;
        let (start, end) = match (start, end) {
            (None, None) => {
                let now = chrono::Utc::now().timestamp();
                (now - 3_600, now)
            }
            (None, Some(e)) => (e - 3_600, e),
            (Some(s), None) => (s, chrono::Utc::now().timestamp()),
            (Some(s), Some(e)) => (s, e),
        };

        let timestamp_field = self.timestamp_field(&p.index).await?;
        let interval = match &p.interval {
            Some(i) => {
                validate_interval(i)?;
                i.clone()
            }
            None => pick_interval(end - start),
        };

        // Quickwit refuses an aggregation over more buckets than
        // `aggregation_bucket_limit`, counting the grouped series too. Checking
        // here turns an opaque Quickwit 400 into a message naming the fix.
        let interval_secs = INTERVALS
            .iter()
            .find(|(l, _)| *l == interval)
            .map(|(_, s)| *s)
            .unwrap_or(60);
        let groups = p.group_by.as_ref().map_or(1, |_| {
            p.group_limit.unwrap_or(10).clamp(1, 100)
        });
        let buckets = ((end - start) / interval_secs).max(1) as usize * groups;
        if buckets > self.limits.aggregation_bucket_limit {
            return Err(ErrorData::invalid_params(
                format!(
                    "that window at interval '{}'{} needs {} buckets, over Quickwit's limit \
                     of {}. Use a wider interval or a shorter window.",
                    interval,
                    if groups > 1 {
                        format!(" across {} groups", groups)
                    } else {
                        String::new()
                    },
                    buckets,
                    self.limits.aggregation_bucket_limit
                ),
                None,
            ));
        }

        let histogram = json!({
            "date_histogram": { "field": timestamp_field, "fixed_interval": interval }
        });
        let aggs = match &p.group_by {
            Some(field) => json!({
                "groups": {
                    "terms": { "field": field, "size": p.group_limit.unwrap_or(10).clamp(1, 100) },
                    "aggs": { "over_time": histogram }
                }
            }),
            None => json!({ "over_time": histogram }),
        };

        let body = json!({
            "query": p.query,
            "max_hits": 0,
            "start_timestamp": start,
            "end_timestamp": end,
            "aggs": aggs,
        });

        let res = self
            .call(ReadCall::search(&p.index, "search", body))
            .await
            .map_err(|e| {
                aggregation_hint(e, p.group_by.as_deref().unwrap_or(&timestamp_field))
            })?;

        let mut out = json!({
            "index": p.index,
            "query": p.query,
            "interval": interval,
            "timestamp_field": timestamp_field,
            "total_matching": res.get("num_hits").cloned(),
            "window": { "start_timestamp": start, "end_timestamp": end },
        });

        match &p.group_by {
            Some(field) => {
                let groups = res
                    .pointer("/aggregations/groups/buckets")
                    .and_then(|b| b.as_array())
                    .map(|arr| {
                        arr.iter()
                            .map(|g| {
                                json!({
                                    "value": g.get("key_as_string").or_else(|| g.get("key")).cloned(),
                                    "count": g.get("doc_count").cloned(),
                                    "series": simplify_histogram(g.pointer("/over_time/buckets")),
                                })
                            })
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                out["group_by"] = json!(field);
                out["groups"] = json!(groups);
            }
            None => {
                out["series"] = json!(simplify_histogram(
                    res.pointer("/aggregations/over_time/buckets")
                ));
            }
        }

        Ok(McpJson(out))
    }

    /// Show how Quickwit would execute a query: which splits it touches and how
    /// the query parses. Use it to check an expensive or suspicious query, or to
    /// find out why one returns nothing.
    #[tool(annotations(title = "Explain search plan", read_only_hint = true))]
    async fn explain_search_plan(
        &self,
        Parameters(p): Parameters<SearchParams>,
    ) -> Result<McpJson<Value>, ErrorData> {
        let (start, end) = Self::window(&p.start_time, &p.end_time)?;
        let mut body = json!({ "query": p.query });
        if let Some(s) = start {
            body["start_timestamp"] = json!(s);
        }
        if let Some(e) = end {
            body["end_timestamp"] = json!(e);
        }
        Ok(McpJson(
            self.call(ReadCall::search(&p.index, "search-plan", body)).await?,
        ))
    }

    /// List the searchable indexes, with their timestamp field and field count.
    ///
    /// Deliberately trimmed: the raw Quickwit response carries every index's
    /// complete doc mapping and runs to hundreds of kilobytes. Call
    /// `list_index_fields` for one index's fields, or `describe_index` for its
    /// size and split counts.
    #[tool(annotations(title = "List indexes", read_only_hint = true))]
    async fn list_indexes(
        &self,
        Parameters(_): Parameters<NoParams>,
    ) -> Result<McpJson<Value>, ErrorData> {
        let raw = self.call(ReadCall::get("/api/v1/indexes")).await?;
        let list: Vec<Value> = raw
            .as_array()
            .map(|arr| {
                arr.iter()
                    .map(|idx| {
                        let cfg = idx.get("index_config");
                        let mapping = cfg.and_then(|c| c.get("doc_mapping"));
                        json!({
                            "index_id": cfg.and_then(|c| c.get("index_id")).cloned(),
                            "timestamp_field": mapping
                                .and_then(|m| m.get("timestamp_field"))
                                .cloned(),
                            "field_count": mapping
                                .and_then(|m| m.get("field_mappings"))
                                .and_then(|f| f.as_array())
                                .map_or(0, |a| a.len()),
                            "sources": idx.get("sources").and_then(|s| s.as_array()).map(|a| {
                                a.iter()
                                    .filter_map(|s| s.get("source_id").and_then(|v| v.as_str()))
                                    .collect::<Vec<_>>()
                            }),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();

        // Several indexes can be searched in one call only when they share a
        // timestamp field -- Quickwit rejects the rest with "the timestamp field
        // must be the same for all indexes". Grouping them here saves the agent
        // discovering that by trial and error.
        let mut groups: std::collections::BTreeMap<String, Vec<String>> =
            std::collections::BTreeMap::new();
        for idx in &list {
            let ts = idx
                .get("timestamp_field")
                .and_then(|v| v.as_str())
                .unwrap_or("(none)")
                .to_string();
            if let Some(id) = idx.get("index_id").and_then(|v| v.as_str()) {
                groups.entry(ts).or_default().push(id.to_string());
            }
        }
        let searchable_together: Vec<Value> = groups
            .into_iter()
            .map(|(ts, ids)| json!({ "timestamp_field": ts, "indexes": ids }))
            .collect();

        Ok(McpJson(json!({
            "count": list.len(),
            "indexes": list,
            "searchable_together": searchable_together,
            "hint": "pass several index ids comma-separated to search them at once, but                      only within one searchable_together group",
        })))
    }

    /// List an index's queryable fields with their types, flattened so nested
    /// objects appear as their dotted paths.
    ///
    /// Call this before writing a query against an unfamiliar index -- guessing
    /// field names is the most common reason a search comes back empty. The type
    /// matters too: a `text` field is tokenised and matches words, while a raw or
    /// keyword field only matches its exact value, and only a `fast` field can be
    /// sorted or aggregated.
    ///
    /// Most log indexes use Quickwit's `dynamic` mapping, where the declared
    /// mapping holds little more than the timestamp and every other field is
    /// created from whatever was ingested. Those fields are real and queryable
    /// but appear in no mapping, so they are discovered here by sampling recent
    /// documents and reported with `"source": "observed"`. A sample only proves a
    /// field exists in the documents it saw: an absent field may still exist
    /// outside the sampled window.
    #[tool(annotations(title = "List index fields", read_only_hint = true))]
    async fn list_index_fields(
        &self,
        Parameters(p): Parameters<IndexParams>,
    ) -> Result<McpJson<Value>, ErrorData> {
        let raw = self.call(ReadCall::get("/api/v1/indexes")).await?;
        let entry = raw
            .as_array()
            .and_then(|arr| {
                arr.iter().find(|i| {
                    i.get("index_config")
                        .and_then(|c| c.get("index_id"))
                        .and_then(|v| v.as_str())
                        == Some(p.index.as_str())
                })
            })
            .ok_or_else(|| {
                ErrorData::invalid_params(
                    format!("no index named '{}'; call list_indexes", p.index),
                    None,
                )
            })?;

        let mapping = entry.get("index_config").and_then(|c| c.get("doc_mapping"));
        let mode = mapping
            .and_then(|m| m.get("mode"))
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();

        let mut fields = Vec::new();
        if let Some(fm) = mapping
            .and_then(|m| m.get("field_mappings"))
            .and_then(|f| f.as_array())
        {
            flatten_fields(fm, "", &mut fields);
        }
        for f in fields.iter_mut() {
            f["source"] = json!("mapping");
        }
        let declared: std::collections::HashSet<String> = fields
            .iter()
            .filter_map(|f| f["name"].as_str().map(String::from))
            .collect();

        // Under dynamic mapping the declared list is not the queryable list, so
        // sample documents the way the UI's field sidebar does.
        let mut sampled = 0usize;
        if mode == "dynamic" {
            let _permit = self.permits.acquire().await;
            let hits = crate::fetch_batch(
                &self.client,
                &self.searcher_url,
                &p.index,
                "*",
                0,
                FIELD_SAMPLE_DOCS,
                None,
                None,
            )
            .await
            .unwrap_or_default();

            sampled = hits.len();
            let mut observed: std::collections::BTreeMap<String, &'static str> =
                std::collections::BTreeMap::new();
            for hit in &hits {
                collect_observed(hit, "", &mut observed);
            }
            for (name, ty) in observed {
                if !declared.contains(&name) {
                    fields.push(json!({ "name": name, "type": ty, "source": "observed" }));
                }
            }
        }

        Ok(McpJson(json!({
            "index_id": p.index,
            "mapping_mode": mode,
            "timestamp_field": mapping.and_then(|m| m.get("timestamp_field")).cloned(),
            "default_search_fields": entry
                .get("index_config")
                .and_then(|c| c.get("search_settings"))
                .and_then(|s| s.get("default_search_fields"))
                .cloned(),
            "field_count": fields.len(),
            "sampled_documents": sampled,
            "fields": fields,
        })))
    }

    /// Describe one index: size on disk, document count, and split counts.
    #[tool(annotations(title = "Describe index", read_only_hint = true))]
    async fn describe_index(
        &self,
        Parameters(p): Parameters<IndexParams>,
    ) -> Result<McpJson<Value>, ErrorData> {
        Ok(McpJson(
            self.call(ReadCall::get(format!(
                "/api/v1/indexes/{}/describe",
                p.index
            )))
            .await?,
        ))
    }

    /// List an index's splits (its immutable storage units) with their state and
    /// time range. Useful for spotting retention or merge problems. Truncated,
    /// because a mature index has thousands.
    #[tool(annotations(title = "List splits", read_only_hint = true))]
    async fn list_splits(
        &self,
        Parameters(p): Parameters<SplitParams>,
    ) -> Result<McpJson<Value>, ErrorData> {
        let raw = self
            .call(ReadCall::get(format!("/api/v1/indexes/{}/splits", p.index)))
            .await?;
        let limit = p.limit.unwrap_or(20).clamp(1, 500);
        let all = raw
            .get("splits")
            .and_then(|s| s.as_array())
            .cloned()
            .unwrap_or_default();
        let total = all.len();
        Ok(McpJson(json!({
            "index_id": p.index,
            "total_splits": total,
            "returned": all.len().min(limit),
            "truncated": total > limit,
            "splits": all.into_iter().take(limit).collect::<Vec<_>>(),
        })))
    }

    /// List the index templates, which decide the mapping applied to indexes
    /// created automatically from an ingest pattern.
    #[tool(annotations(title = "List index templates", read_only_hint = true))]
    async fn list_templates(
        &self,
        Parameters(_): Parameters<NoParams>,
    ) -> Result<McpJson<Value>, ErrorData> {
        Ok(McpJson(self.call(ReadCall::get("/api/v1/templates")).await?))
    }

    /// Fetch one index template in full.
    #[tool(annotations(title = "Get index template", read_only_hint = true))]
    async fn get_template(
        &self,
        Parameters(p): Parameters<TemplateParams>,
    ) -> Result<McpJson<Value>, ErrorData> {
        Ok(McpJson(
            self.call(ReadCall::get(format!("/api/v1/templates/{}", p.template_id)))
                .await?,
        ))
    }

    /// Cluster state: id, members, and each node's roles and readiness. The
    /// first thing to check when searches behave inconsistently.
    ///
    /// The gossip state snapshot is omitted unless asked for -- it is 13 KB of
    /// chitchat internals against 1 KB of everything else, and it answers almost
    /// no question worth asking.
    #[tool(annotations(title = "Cluster info", read_only_hint = true))]
    async fn cluster_info(
        &self,
        Parameters(p): Parameters<ClusterParams>,
    ) -> Result<McpJson<Value>, ErrorData> {
        let mut out = self.call(ReadCall::get("/api/v1/cluster")).await?;
        if !p.include_gossip_state.unwrap_or(false) {
            if let Some(obj) = out.as_object_mut() {
                if obj.remove("chitchat_state_snapshot").is_some() {
                    obj.insert(
                        "chitchat_state_snapshot".into(),
                        json!("omitted; call again with include_gossip_state=true"),
                    );
                }
            }
        }
        Ok(McpJson(out))
    }

    /// The responding node's resolved configuration: storage, metastore,
    /// indexer and searcher settings.
    #[tool(annotations(title = "Node config", read_only_hint = true))]
    async fn node_config(
        &self,
        Parameters(_): Parameters<NoParams>,
    ) -> Result<McpJson<Value>, ErrorData> {
        Ok(McpJson(self.call(ReadCall::get("/api/v1/config")).await?))
    }

    /// Quickwit's version and build info. Worth checking before trusting
    /// version-specific advice about its API or query syntax.
    #[tool(annotations(title = "Node version", read_only_hint = true))]
    async fn node_version(
        &self,
        Parameters(_): Parameters<NoParams>,
    ) -> Result<McpJson<Value>, ErrorData> {
        Ok(McpJson(self.call(ReadCall::get("/api/v1/version")).await?))
    }

    /// Indexing pipeline status: how many pipelines are running, succeeding and
    /// failing. Use it when documents are missing or lagging.
    ///
    /// Only a node running the indexer service answers this, so it is routed to
    /// `QUICKWIT_INDEXER_URL`. Without that set it will 404 against a searcher.
    #[tool(annotations(title = "Indexing status", read_only_hint = true))]
    async fn indexing_status(
        &self,
        Parameters(_): Parameters<NoParams>,
    ) -> Result<McpJson<Value>, ErrorData> {
        Ok(McpJson(
            self.call(ReadCall::get("/api/v1/indexing").on(Node::Indexer))
                .await?,
        ))
    }

    /// Cluster-wide debug dump, gossiped from every node.
    ///
    /// Quickwit's raw response is around 130 KB across a five-node cluster --
    /// more than most agents can afford to read, and most of it gossip
    /// bookkeeping. So this drills down instead of dumping: called with no
    /// arguments it returns each node's identity, roles and the sections
    /// available with their sizes. Pass `node` for one node's small sections,
    /// and `node` plus `section` for a single large one.
    #[tool(annotations(title = "Debug info", read_only_hint = true))]
    async fn debug_info(
        &self,
        Parameters(p): Parameters<DebugParams>,
    ) -> Result<McpJson<Value>, ErrorData> {
        let all = self.call(ReadCall::get("/api/developer/debug")).await?;
        let nodes = all.as_object().ok_or_else(|| {
            ErrorData::internal_error("debug endpoint did not return an object", None)
        })?;

        // Whole-cluster overview: what exists and what it would cost to fetch.
        let Some(wanted) = p.node.as_deref() else {
            let summary: Vec<Value> = nodes
                .iter()
                .map(|(name, body)| {
                    let sections: Vec<Value> = body
                        .as_object()
                        .map(|o| {
                            o.iter()
                                .map(|(k, v)| json!({ "section": k, "bytes": v.to_string().len() }))
                                .collect()
                        })
                        .unwrap_or_default();
                    json!({
                        "node": name,
                        "build_info": body.get("build_info"),
                        "runtime_info": body.get("runtime_info"),
                        "sections": sections,
                    })
                })
                .collect();
            return Ok(McpJson(json!({
                "nodes": summary,
                "hint": "pass node=<name> for that node, plus section=<name> for one section",
            })));
        };

        let body = nodes.get(wanted).ok_or_else(|| {
            ErrorData::invalid_params(
                format!(
                    "no node '{}'; known nodes: {}",
                    wanted,
                    nodes.keys().cloned().collect::<Vec<_>>().join(", ")
                ),
                None,
            )
        })?;

        if let Some(section) = p.section.as_deref() {
            let value = body.get(section).ok_or_else(|| {
                ErrorData::invalid_params(
                    format!(
                        "node '{}' has no section '{}'; available: {}",
                        wanted,
                        section,
                        body.as_object()
                            .map(|o| o.keys().cloned().collect::<Vec<_>>().join(", "))
                            .unwrap_or_default()
                    ),
                    None,
                )
            })?;
            return Ok(McpJson(json!({
                "node": wanted, "section": section, "value": value,
            })));
        }

        // One node, big sections replaced by a pointer rather than inlined.
        let trimmed: Map<String, Value> = body
            .as_object()
            .map(|o| {
                o.iter()
                    .map(|(k, v)| {
                        let size = v.to_string().len();
                        if size > DEBUG_SECTION_INLINE_LIMIT {
                            (
                                k.clone(),
                                json!(format!(
                                    "{} bytes; call again with section=\"{}\"",
                                    size, k
                                )),
                            )
                        } else {
                            (k.clone(), v.clone())
                        }
                    })
                    .collect()
            })
            .unwrap_or_default();

        Ok(McpJson(json!({ "node": wanted, "sections": trimmed })))
    }
}

#[tool_handler]
impl ServerHandler for QuickwitMcp {
    fn get_info(&self) -> ServerInfo {
        // InitializeResult is #[non_exhaustive], so it has to be built through
        // its constructor and then adjusted.
        let mut info = InitializeResult::new(ServerCapabilities::builder().enable_tools().build());
        info.instructions = Some(
                "Read-only access to a Quickwit log search cluster, served by qwui.\n\n\
                 An index is normally one Kubernetes namespace, holding the logs of every \
                 pod and container in it. So the usual job is to narrow from a namespace \
                 down to the pods that matter, and only then read lines.\n\n\
                 Work in that order rather than searching immediately:\n\
                 1. `list_indexes` -- which namespaces exist.\n\
                 2. `list_index_fields` -- which fields this index has, and which are \
                 `fast` (only fast fields can be aggregated or sorted).\n\
                 3. `list_field_values` -- what is actually in a field. On `pod_name` it \
                 gives you the pod list with a document count each, so an unusually noisy \
                 pod stands out before you read anything.\n\
                 4. `count_over_time` -- when something started, and with \
                 `group_by: \"pod_name\"`, which pod caused it.\n\
                 5. `field_stats` -- min/max/avg of a numeric field, so a threshold comes \
                 from the data instead of a guess.\n\
                 6. `search_logs` or `summarize_log_patterns` -- read the narrowed set.\n\n\
                 Prefer aggregations over reading documents: counts and distinct values \
                 answer most questions at a fraction of the size. When you do read, \
                 `summarize_log_patterns` collapses up to 10 000 events into a handful of \
                 templates, and `search_logs` takes a `fields` list to keep hits small.\n\n\
                 Filter with the values you discovered, e.g. \
                 `pod_name:IN [pod-a pod-b] AND status:>=500`.\n\n\
                 Queries use Tantivy syntax, not Lucene, KQL or Elasticsearch DSL. Time \
                 windows accept `now-15m` style expressions.\n\n\
                 Every tool is read-only; nothing here can create, modify or delete an \
                 index, template or document."
                .to_string(),
        );
        info
    }
}

/// Bucket widths `date_histogram` accepts, smallest first.
const INTERVALS: &[(&str, i64)] = &[
    ("1s", 1),
    ("5s", 5),
    ("10s", 10),
    ("30s", 30),
    ("1m", 60),
    ("5m", 300),
    ("10m", 600),
    ("30m", 1_800),
    ("1h", 3_600),
    ("3h", 10_800),
    ("12h", 43_200),
    ("1d", 86_400),
    ("7d", 604_800),
];

/// Picks a bucket width giving roughly 60 buckets over `span` seconds.
///
/// Sixty is a readable series and a small response. Letting a caller ask for
/// per-second buckets over a week would produce 600 000 of them, which Quickwit
/// rejects outright -- the same "too many buckets" error the UI's interval
/// selector guards against.
fn pick_interval(span: i64) -> String {
    const TARGET_BUCKETS: i64 = 60;
    let ideal = (span / TARGET_BUCKETS).max(1);
    INTERVALS
        .iter()
        .find(|(_, secs)| *secs >= ideal)
        .map(|(label, _)| *label)
        .unwrap_or("7d")
        .to_string()
}

fn validate_interval(interval: &str) -> Result<(), ErrorData> {
    if INTERVALS.iter().any(|(label, _)| *label == interval) {
        return Ok(());
    }
    Err(ErrorData::invalid_params(
        format!(
            "unsupported interval '{}'; use one of: {}",
            interval,
            INTERVALS
                .iter()
                .map(|(l, _)| *l)
                .collect::<Vec<_>>()
                .join(", ")
        ),
        None,
    ))
}

/// Reduces `date_histogram` buckets to `{time, count}` pairs.
///
/// Quickwit returns a key, a formatted key and a doc count per bucket; three
/// fields times sixty buckets is a lot of repetition to hand an agent for what
/// is really a list of pairs.
fn simplify_histogram(buckets: Option<&Value>) -> Vec<Value> {
    buckets
        .and_then(|b| b.as_array())
        .map(|arr| {
            arr.iter()
                .map(|b| {
                    json!({
                        "time": b.get("key_as_string").or_else(|| b.get("key")).cloned(),
                        "count": b.get("doc_count").cloned(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Adds the likely cause when an aggregation is refused.
///
/// Quickwit's message for aggregating a non-fast field is accurate but says
/// nothing about the fix, so an agent retries the same call. Naming the field
/// and pointing at `list_index_fields` turns a dead end into a next step.
fn aggregation_hint(err: ErrorData, field: &str) -> ErrorData {
    let msg = err.message.to_string();
    if msg.contains("fast field") || msg.contains("not a fast") || msg.contains("Aggregation") {
        return ErrorData::invalid_params(
            format!(
                "{} -- aggregating '{}' requires it to be a fast field. Check with \
                 list_index_fields, which marks fast fields; text fields tokenised for \
                 search often are not.",
                msg, field
            ),
            None,
        );
    }
    err
}

/// Collects the dotted field paths present in a sampled document, inferring a
/// type from each JSON value. Nested objects are walked so `resource.host`
/// appears rather than an opaque `resource`.
fn collect_observed(
    obj: &Map<String, Value>,
    prefix: &str,
    out: &mut std::collections::BTreeMap<String, &'static str>,
) {
    for (key, value) in obj {
        let path = if prefix.is_empty() {
            key.clone()
        } else {
            format!("{}.{}", prefix, key)
        };
        match value {
            Value::Object(inner) => collect_observed(inner, &path, out),
            other => {
                let ty = match other {
                    Value::String(_) => "text",
                    Value::Bool(_) => "bool",
                    Value::Number(n) if n.is_f64() => "f64",
                    Value::Number(_) => "i64",
                    Value::Array(_) => "array",
                    Value::Null => "null",
                    Value::Object(_) => unreachable!(),
                };
                // First non-null observation wins; a later null must not
                // downgrade a type we already know.
                let entry = out.entry(path).or_insert(ty);
                if *entry == "null" && ty != "null" {
                    *entry = ty;
                }
            }
        }
    }
}

/// Flattens Quickwit's nested `field_mappings` into dotted paths.
fn flatten_fields(mappings: &[Value], prefix: &str, out: &mut Vec<Value>) {
    for m in mappings {
        let Some(name) = m.get("name").and_then(|v| v.as_str()) else {
            continue;
        };
        let path = if prefix.is_empty() {
            name.to_string()
        } else {
            format!("{}.{}", prefix, name)
        };
        let ty = m.get("type").and_then(|v| v.as_str()).unwrap_or("unknown");

        if ty == "object" {
            if let Some(children) = m.get("field_mappings").and_then(|f| f.as_array()) {
                flatten_fields(children, &path, out);
                continue;
            }
        }

        let mut entry = json!({ "name": path, "type": ty });
        // `fast` decides whether the field can be sorted or aggregated, which
        // the caller needs before it tries either.
        if m.get("fast").and_then(|v| v.as_bool()) == Some(true) {
            entry["fast"] = json!(true);
        }
        if let Some(tok) = m.get("tokenizer").and_then(|v| v.as_str()) {
            entry["tokenizer"] = json!(tok);
        }
        out.push(entry);
    }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

/// Per-token call budget.
///
/// The semaphore keeps Quickwit from being overwhelmed at any instant, but it
/// does not stop an agent stuck in a loop from running all day: each call simply
/// waits its turn and the cluster stays saturated. This caps calls per token per
/// minute so a runaway loop hits a wall and reports it, instead of quietly
/// consuming the searcher.
struct RateLimiter {
    /// Calls allowed per token per window.
    limit: usize,
    window: Duration,
    /// Recent call times per token. Bounded by `limit` after each prune, so it
    /// cannot grow without limit.
    seen: Mutex<HashMap<String, Vec<Instant>>>,
}

impl RateLimiter {
    fn new(limit: usize, window: Duration) -> Self {
        Self {
            limit,
            window,
            seen: Mutex::new(HashMap::new()),
        }
    }

    /// Records a call, returning how many remain, or `Err` with the seconds to
    /// wait when the budget is spent.
    fn check(&self, token: &str) -> Result<usize, u64> {
        let now = Instant::now();
        let mut seen = match self.seen.lock() {
            Ok(s) => s,
            // A poisoned lock must not become a way past the limiter.
            Err(e) => e.into_inner(),
        };
        let calls = seen.entry(token.to_string()).or_default();
        calls.retain(|t| now.duration_since(*t) < self.window);

        if calls.len() >= self.limit {
            let oldest = calls.first().copied().unwrap_or(now);
            let wait = self
                .window
                .saturating_sub(now.duration_since(oldest))
                .as_secs()
                + 1;
            return Err(wait);
        }
        calls.push(now);
        Ok(self.limit - calls.len())
    }
}

/// A credential and the name it is audited under.
///
/// `MCP_TOKENS` accepts `name:secret` as well as a bare secret. The name is what
/// appears in the audit log and the metrics labels, so "which agent ran this
/// query" has a readable answer. The secret itself is never logged: an audit
/// trail that leaks the credentials it audits is worse than none.
#[derive(Clone)]
struct McpToken {
    name: String,
    secret: String,
}

impl McpToken {
    /// Parses `name:secret`, or a bare secret named by a short fingerprint.
    ///
    /// A fingerprint rather than a slice of the secret: the first characters of
    /// a credential are still part of the credential.
    fn parse(raw: &str, index: usize) -> Option<Self> {
        let raw = raw.trim();
        if raw.is_empty() {
            return None;
        }
        // Split on the first colon only, so a secret containing colons survives.
        match raw.split_once(':') {
            Some((name, secret)) if !name.trim().is_empty() && !secret.trim().is_empty() => {
                Some(Self {
                    name: name.trim().to_string(),
                    secret: secret.trim().to_string(),
                })
            }
            _ => Some(Self {
                name: format!("token-{}", index + 1),
                secret: raw.to_string(),
            }),
        }
    }
}

struct McpGate {
    tokens: Vec<McpToken>,
    limiter: RateLimiter,
}

/// The body of a 401: what this endpoint is and how to connect to it.
///
/// `/mcp` is POST-only JSON-RPC, so a person who opens it in a browser sees only
/// whatever we put here. A bare "Unauthorized" told them nothing about what the
/// endpoint was, which header to send, or who to ask for a token -- so this
/// carries the client configuration, with the deployment's own hostname filled in
/// from the request so it can be pasted as-is.
fn connection_help(headers: &axum::http::HeaderMap) -> String {
    let host = headers
        .get(axum::http::header::HOST)
        .and_then(|h| h.to_str().ok())
        .unwrap_or("<host>");
    // Assume TLS unless this is plainly local development.
    let scheme = if host.starts_with("localhost") || host.starts_with("127.0.0.1") {
        "http"
    } else {
        "https"
    };
    let url = format!("{}://{}/mcp", scheme, host);

    // A plain template rather than a format! with `\n\` continuations: those
    // strip the leading whitespace of every continued line, which silently
    // flattened the indented JSON snippet into one unreadable column.
    const HELP: &str = r#"qwui MCP endpoint - read-only Quickwit log search for AI agents.

This is a Model Context Protocol endpoint: JSON-RPC over Streamable HTTP.
It is not a page you can browse. It answers POST, and every request needs a
bearer token:

    Authorization: Bearer <token>

Ask whoever operates this qwui for a token; they are issued per agent.

Claude Code:

    claude mcp add --transport http qwui {url} \
      --header "Authorization: Bearer <token>"

Cursor - .cursor/mcp.json in the project, or ~/.cursor/mcp.json:

    {
      "mcpServers": {
        "qwui": {
          "url": "{url}",
          "headers": { "Authorization": "Bearer ${env:QWUI_MCP_TOKEN}" }
        }
      }
    }

Any client that can set an HTTP header works the same way.
Full documentation: doc/MCP.md in the qwui repository.
"#;

    HELP.replace("{url}", &url)
}

/// What an audit line records about one MCP call, pulled from the request body.
#[derive(Default)]
struct CallFacts {
    method: Option<String>,
    tool: Option<String>,
    index: Option<String>,
    query: Option<String>,
}

/// Extracts the auditable fields from a JSON-RPC body.
///
/// Deliberately shallow: only the method, the tool name and the two arguments
/// that say what data was touched. Logging whole argument objects would put
/// unbounded caller-controlled text in the log, and the query plus the index is
/// what actually answers "what did this agent read".
fn call_facts(body: &[u8]) -> CallFacts {
    let Ok(v) = serde_json::from_slice::<Value>(body) else {
        return CallFacts::default();
    };
    let args = v.pointer("/params/arguments");
    CallFacts {
        method: v.get("method").and_then(|m| m.as_str()).map(String::from),
        tool: v
            .pointer("/params/name")
            .and_then(|n| n.as_str())
            .map(String::from),
        index: args
            .and_then(|a| a.get("index"))
            .and_then(|i| i.as_str())
            .map(String::from),
        query: args
            .and_then(|a| a.get("query"))
            .and_then(|q| q.as_str())
            // Bounded: a query is caller-controlled and a log line is not the
            // place for an unbounded one.
            .map(|q| q.chars().take(500).collect()),
    }
}

/// Bearer-token gate, rate limit, audit trail and metrics.
///
/// qwui's own auth is an OIDC session cookie, which an agent cannot obtain: the
/// flow is interactive. So `/mcp` gets its own credential. Comparison is
/// constant-time -- a byte-by-byte early exit on a secret is measurable over a
/// network.
///
/// The body is buffered here so one place can record what was asked. Doing it
/// per-tool would mean seventeen call sites and a guarantee that the next tool
/// forgets.
async fn require_token(
    State(gate): State<Arc<McpGate>>,
    req: Request<Body>,
    next: Next,
) -> Response {
    let m = crate::metrics::metrics();

    let presented = req
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("")
        .to_string();

    let identity = gate
        .tokens
        .iter()
        .find(|t| constant_time_eq(&t.secret, &presented))
        .map(|t| t.name.clone());

    let Some(agent) = identity else {
        m.rejections.with_label_values(&["unauthorized"]).inc();
        warn!("MCP request rejected: no valid bearer token");
        return (
            StatusCode::UNAUTHORIZED,
            [(
                axum::http::header::WWW_AUTHENTICATE,
                "Bearer realm=\"qwui-mcp\"",
            )],
            // Whoever reads this is either a person who opened /mcp in a browser
            // or someone whose client is misconfigured. "Unauthorized" alone left
            // both with nowhere to go, so the body is the connection
            // instructions, with the real host filled in.
            connection_help(req.headers()),
        )
            .into_response();
    };

    let remaining = match gate.limiter.check(&presented) {
        Ok(remaining) => remaining,
        Err(wait) => {
            m.rejections.with_label_values(&["rate_limited"]).inc();
            warn!(
                agent = %agent,
                wait_secs = wait,
                "MCP rate limit reached; refusing a call to protect Quickwit"
            );
            return (
                StatusCode::TOO_MANY_REQUESTS,
                [(
                    axum::http::header::RETRY_AFTER,
                    HeaderValue::from_str(&wait.to_string())
                        .unwrap_or(HeaderValue::from_static("60")),
                )],
                format!(
                    "Rate limit reached: {} calls per minute per token. Retry in {}s. \
                     If you are looping, narrow the question instead -- try \
                     summarize_log_patterns or count_over_time, which answer in one call \
                     what many search_logs calls would.",
                    gate.limiter.limit, wait
                ),
            )
                .into_response();
        }
    };

    // Buffer the body to audit it, then hand the same bytes onward.
    let (parts, body) = req.into_parts();
    let bytes = match axum::body::to_bytes(body, MAX_AUDITED_BODY).await {
        Ok(b) => b,
        Err(_) => {
            m.rejections.with_label_values(&["body_too_large"]).inc();
            return (
                StatusCode::PAYLOAD_TOO_LARGE,
                format!("MCP request body exceeds {} bytes", MAX_AUDITED_BODY),
            )
                .into_response();
        }
    };
    let facts = call_facts(&bytes);
    let req = Request::from_parts(parts, Body::from(bytes));

    let started = Instant::now();
    let mut resp = next.run(req).await;
    let elapsed = started.elapsed();

    let tool = facts.tool.unwrap_or_else(|| {
        facts.method.clone().unwrap_or_else(|| "unknown".to_string())
    });
    let outcome = if resp.status().is_success() {
        "ok"
    } else {
        "error"
    };

    m.tool_calls
        .with_label_values(&[agent.as_str(), tool.as_str(), outcome])
        .inc();
    m.tool_duration
        .with_label_values(&[tool.as_str()])
        .observe(elapsed.as_secs_f64());

    // The audit line. One per call, structured, no secret.
    info!(
        target: "mcp_audit",
        agent = %agent,
        tool = %tool,
        index = facts.index.as_deref().unwrap_or("-"),
        query = facts.query.as_deref().unwrap_or("-"),
        status = resp.status().as_u16(),
        duration_ms = elapsed.as_millis() as u64,
        "MCP call"
    );

    resp.headers_mut().insert(
        "X-RateLimit-Remaining",
        HeaderValue::from_str(&remaining.to_string()).unwrap_or(HeaderValue::from_static("0")),
    );
    resp
}

fn constant_time_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    // Length is not secret; the token bytes are.
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Reads MCP settings from the environment.
struct McpSettings {
    tokens: Vec<McpToken>,
    allowed_hosts: Vec<String>,
    allowed_origins: Vec<String>,
    hits_ceiling: usize,
    /// Tool calls allowed per token per minute.
    rate_limit: usize,
    /// Overrides the concurrency derived from Quickwit's own capacity. Set only
    /// when you know better than the cluster does.
    max_concurrent_override: Option<usize>,
}

impl McpSettings {
    fn from_env(state: &AppState) -> Self {
        let tokens: Vec<McpToken> = env::var("MCP_TOKENS")
            .unwrap_or_default()
            .split(',')
            .enumerate()
            .filter_map(|(i, raw)| McpToken::parse(raw, i))
            .collect();

        // rmcp validates the Host header against this list and defaults to
        // localhost only, which would reject every request behind an ingress.
        // Derive the deployment's own hostname from the OIDC redirect URL so the
        // common case needs no extra configuration.
        let mut allowed_hosts: Vec<String> = env::var("MCP_ALLOWED_HOSTS")
            .unwrap_or_default()
            .split(',')
            .map(|h| h.trim().to_string())
            .filter(|h| !h.is_empty())
            .collect();

        if allowed_hosts.is_empty() {
            allowed_hosts = vec!["localhost".into(), "127.0.0.1".into(), "::1".into()];
            for var in ["OIDC_REDIRECT_URL", "ORIGIN"] {
                if let Ok(raw) = env::var(var) {
                    for candidate in raw.split(',') {
                        if let Ok(url) = url::Url::parse(candidate.trim()) {
                            if let Some(host) = url.host_str() {
                                let entry = match url.port() {
                                    Some(p) => format!("{}:{}", host, p),
                                    None => host.to_string(),
                                };
                                if !allowed_hosts.contains(&entry) {
                                    allowed_hosts.push(entry);
                                }
                                if !allowed_hosts.contains(&host.to_string()) {
                                    allowed_hosts.push(host.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }

        let allowed_origins = env::var("MCP_ALLOWED_ORIGINS")
            .unwrap_or_default()
            .split(',')
            .map(|o| o.trim().to_string())
            .filter(|o| !o.is_empty())
            .collect();

        let hits_ceiling = env::var("MCP_MAX_HITS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(HITS_CEILING_DEFAULT)
            .max(1);

        let rate_limit = env::var("MCP_RATE_LIMIT_PER_MIN")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(RATE_LIMIT_DEFAULT)
            .max(1);

        let max_concurrent_override = env::var("MCP_MAX_CONCURRENT_REQUESTS")
            .ok()
            .and_then(|v| v.parse::<usize>().ok())
            .filter(|v| *v > 0);

        let _ = state;
        Self {
            tokens,
            allowed_hosts,
            allowed_origins,
            hits_ceiling,
            rate_limit,
            max_concurrent_override,
        }
    }
}

/// Returns whether MCP is switched on.
/// Whether `/mcp` is actually being served.
///
/// Set by [`router`], not read from the environment. `MCP_ENABLED=true` with no
/// `MCP_TOKENS` leaves the endpoint unmounted, and reporting the env var would
/// have advertised a feature that answers 405: `/api/auth/status` saying
/// `features.mcp: true` while the startup log says the endpoint is not served.
static SERVING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub(crate) fn enabled() -> bool {
    SERVING.load(std::sync::atomic::Ordering::Relaxed)
}

fn requested() -> bool {
    env::var("MCP_ENABLED").unwrap_or_else(|_| "false".into()) == "true"
}

/// Builds the `/mcp` router, or `None` when MCP is off or misconfigured.
///
/// Fails closed. `MCP_ENABLED=true` with no `MCP_TOKENS` leaves the endpoint
/// unmounted rather than open: an unauthenticated tool that can read every log
/// line in the cluster is worse than a missing feature.
pub(crate) async fn router(state: &AppState) -> Option<Router> {
    if !requested() {
        info!("MCP endpoint disabled (set MCP_ENABLED=true to serve /mcp)");
        return None;
    }

    let settings = McpSettings::from_env(state);

    if settings.tokens.is_empty() {
        warn!(
            "MCP_ENABLED=true but MCP_TOKENS is empty: /mcp will NOT be served. \
             Set MCP_TOKENS to one or more comma-separated secrets."
        );
        return None;
    }

    // Ask Quickwit what it can take rather than picking a number. Probing at
    // startup keeps it off the request path, and the fallback means a Quickwit
    // that will not answer still gets a conservative ceiling.
    let mut limits = probe_capacity(&state.client, &state.config.quickwit_url).await;
    if let Some(override_value) = settings.max_concurrent_override {
        limits.max_concurrent = override_value;
        limits.source = format!("MCP_MAX_CONCURRENT_REQUESTS={}", override_value);
    }

    let handler = QuickwitMcp {
        client: state.client.clone(),
        searcher_url: state.config.quickwit_url.clone(),
        // Indexing status is the only endpoint that needs a specific node role;
        // without a dedicated URL, try the general one and let the 404 explain.
        indexer_url: state
            .config
            .quickwit_indexer_url
            .clone()
            .unwrap_or_else(|| state.config.quickwit_url.clone()),
        hits_ceiling: settings.hits_ceiling,
        permits: Arc::new(Semaphore::new(limits.max_concurrent)),
        limits: limits.clone(),
    };

    let mut config = StreamableHttpServerConfig::default()
        // Revision 2026-07-28 dropped sessions; serving legacy clients
        // statelessly too keeps every replica interchangeable.
        .with_legacy_session_mode(false)
        .with_json_response(true)
        .with_allowed_hosts(settings.allowed_hosts.clone());

    if !settings.allowed_origins.is_empty() {
        config = config.with_allowed_origins(settings.allowed_origins.clone());
    }

    let service = StreamableHttpService::new(
        move || Ok(handler.clone()),
        Arc::new(LocalSessionManager::default()),
        config,
    );

    info!(
        agents = ?settings.tokens.iter().map(|t| t.name.clone()).collect::<Vec<_>>(),
        allowed_hosts = ?settings.allowed_hosts,
        hits_ceiling = settings.hits_ceiling,
        indexer_url_set = state.config.quickwit_indexer_url.is_some(),
        max_concurrent = limits.max_concurrent,
        limits_from = %limits.source,
        aggregation_bucket_limit = limits.aggregation_bucket_limit,
        request_timeout_secs = limits.request_timeout.as_secs(),
        rate_limit_per_min = settings.rate_limit,
        "MCP endpoint enabled at /mcp (read-only)"
    );

    let gate = Arc::new(McpGate {
        tokens: settings.tokens,
        limiter: RateLimiter::new(settings.rate_limit, Duration::from_secs(60)),
    });

    // Only now is the endpoint really being served, so this is the only place
    // that may claim it is.
    SERVING.store(true, std::sync::atomic::Ordering::Relaxed);

    // `route_service("/")` rather than `fallback_service`: once nested at /mcp a
    // fallback-only router matches nothing and axum answers 405 before the
    // service is ever reached. Nesting maps both /mcp and /mcp/ onto "/" here.
    Some(
        Router::new()
            .route_service("/", service)
            .layer(middleware::from_fn_with_state(gate, require_token)),
    )
}

// ---------------------------------------------------------------------------
// Upstream API surface
// ---------------------------------------------------------------------------

/// The Quickwit operations the tools above call, as (tool, method, spec path).
///
/// This is the contract with upstream. The tests below check every entry against
/// `quickwit-api-surface.json`, which `ci/refresh-quickwit-api-surface.py`
/// regenerates from a live Quickwit's `/openapi.json`. A version bump that moves
/// or drops an endpoint therefore breaks `cargo test`, rather than breaking a
/// tool call in a live deployment with a 404 nobody sees.
#[cfg(test)]
const WRAPPED: &[(&str, &str, &str)] = &[
    ("search_logs", "POST", "/api/v1/{index_id}/search"),
    ("summarize_log_patterns", "POST", "/api/v1/{index_id}/search"),
    ("list_field_values", "POST", "/api/v1/{index_id}/search"),
    ("field_stats", "POST", "/api/v1/{index_id}/search"),
    ("count_over_time", "POST", "/api/v1/{index_id}/search"),
    ("explain_search_plan", "POST", "/api/v1/{index_id}/search-plan"),
    ("list_indexes", "GET", "/api/v1/indexes"),
    ("list_index_fields", "GET", "/api/v1/indexes"),
    ("describe_index", "GET", "/api/v1/indexes/{index_id}/describe"),
    ("list_splits", "GET", "/api/v1/indexes/{index_id}/splits"),
    ("list_templates", "GET", "/api/v1/templates"),
    ("get_template", "GET", "/api/v1/templates/{template_id}"),
    ("cluster_info", "GET", "/api/v1/cluster"),
    ("node_config", "GET", "/api/v1/config"),
    ("node_version", "GET", "/api/v1/version"),
    ("indexing_status", "GET", "/api/v1/indexing"),
    ("debug_info", "GET", "/api/developer/debug"),
];

/// Read-only operations in the tagged groups this server covers that are
/// deliberately left out, each with the reason.
///
/// Not busywork: the test below fails when upstream adds a readable endpoint in
/// one of these groups that is neither wrapped nor listed here, which is exactly
/// the moment to decide whether an agent should have it.
#[cfg(test)]
const INTENTIONALLY_UNWRAPPED: &[(&str, &str, &str)] = &[
    (
        "GET",
        "/api/v1/{index_id}/search",
        "the POST form takes the same arguments in a body and is what search_logs uses",
    ),
    (
        "GET",
        "/api/v1/{index_id}/search-plan",
        "same, superseded by the POST form",
    ),
    (
        "GET",
        "/api/v1/_elastic",
        "Elasticsearch-compatibility cluster stub; get_cluster carries strictly more",
    ),
    (
        "GET",
        "/api/developer/log-level",
        "reports the running log level, which tells an agent nothing about the logs \
         themselves; its PUT sibling mutates and must stay out",
    ),
];

/// Tag groups this server sets out to cover.
#[cfg(test)]
const COVERED_TAGS: &[&str] = &[
    "Search",
    "Indexes",
    "Cluster Info",
    "Node Info",
    "Indexing",
    "Debug",
    "Templates",
];

#[cfg(test)]
mod tests {
    use super::*;

    /// The vendored surface, as (method, path, operation_id, tags).
    fn surface() -> (String, Vec<(String, String, String, Vec<String>)>) {
        let raw = include_str!("../quickwit-api-surface.json");
        let v: Value = serde_json::from_str(raw).expect("vendored surface is valid JSON");
        let version = v["quickwit_version"].as_str().unwrap_or("unknown").to_string();
        let ops = v["operations"]
            .as_array()
            .expect("operations array")
            .iter()
            .map(|o| {
                (
                    o["method"].as_str().unwrap_or_default().to_string(),
                    o["path"].as_str().unwrap_or_default().to_string(),
                    o["operation_id"].as_str().unwrap_or_default().to_string(),
                    o["tags"]
                        .as_array()
                        .map(|t| {
                            t.iter()
                                .filter_map(|x| x.as_str().map(String::from))
                                .collect()
                        })
                        .unwrap_or_default(),
                )
            })
            .collect();
        (version, ops)
    }

    #[test]
    fn every_wrapped_operation_exists_upstream() {
        let (version, ops) = surface();
        let known: std::collections::HashSet<(&str, &str)> = ops
            .iter()
            .map(|(m, p, _, _)| (m.as_str(), p.as_str()))
            .collect();

        let mut missing = Vec::new();
        for (tool, method, path) in WRAPPED {
            if !known.contains(&(method, path)) {
                missing.push(format!("  {} -> {} {}", tool, method, path));
            }
        }
        assert!(
            missing.is_empty(),
            "these tools call endpoints absent from Quickwit {}:\n{}\n\
             Re-run ci/refresh-quickwit-api-surface.py and fix mcp.rs.",
            version,
            missing.join("\n")
        );
    }

    #[test]
    fn no_wrapped_operation_is_mutating() {
        for (tool, method, path) in WRAPPED {
            match *method {
                "GET" => {}
                "POST" => assert!(
                    path.ends_with("/search") || path.ends_with("/search-plan"),
                    "{} POSTs to {}, which is not one of the read-only search endpoints",
                    tool,
                    path
                ),
                other => panic!("{} uses {}, which mutates state", tool, other),
            }
        }
    }

    #[test]
    fn readable_upstream_operations_are_wrapped_or_explained() {
        let (version, ops) = surface();
        let wrapped: std::collections::HashSet<(&str, &str)> =
            WRAPPED.iter().map(|(_, m, p)| (*m, *p)).collect();
        let excused: std::collections::HashSet<(&str, &str)> = INTENTIONALLY_UNWRAPPED
            .iter()
            .map(|(m, p, _)| (*m, *p))
            .collect();

        let mut unaccounted = Vec::new();
        for (method, path, op_id, tags) in &ops {
            // Only GET is read-only in general; the two search POSTs are handled
            // by the wrapped set already.
            if method != "GET" {
                continue;
            }
            if !tags.iter().any(|t| COVERED_TAGS.contains(&t.as_str())) {
                continue;
            }
            let key = (method.as_str(), path.as_str());
            if !wrapped.contains(&key) && !excused.contains(&key) {
                unaccounted.push(format!("  {} {}  ({})", method, path, op_id));
            }
        }

        assert!(
            unaccounted.is_empty(),
            "Quickwit {} exposes readable endpoints in covered tags that this server \
             neither wraps nor excuses:\n{}\n\
             Add a tool in mcp.rs, or an entry in INTENTIONALLY_UNWRAPPED saying why not.",
            version,
            unaccounted.join("\n")
        );
    }

    #[test]
    fn excuses_refer_to_real_operations() {
        // Keeps the excuse list from rotting into a set of stale claims about
        // endpoints upstream no longer has.
        let (version, ops) = surface();
        let known: std::collections::HashSet<(&str, &str)> = ops
            .iter()
            .map(|(m, p, _, _)| (m.as_str(), p.as_str()))
            .collect();
        for (method, path, reason) in INTENTIONALLY_UNWRAPPED {
            assert!(
                known.contains(&(method, path)),
                "INTENTIONALLY_UNWRAPPED lists {} {} ({}), which Quickwit {} does not have",
                method,
                path,
                reason,
                version
            );
        }
    }

    #[test]
    fn read_only_by_construction() {
        // Every call this module can build is a GET, or a POST to one of the two
        // search endpoints. If a future edit adds a mutating call, this fails.
        let calls = vec![
            ReadCall::get("/api/v1/indexes"),
            ReadCall::get("/api/v1/cluster"),
            ReadCall::get("/api/v1/indexing").on(Node::Indexer),
            ReadCall::search("demo", "search", json!({"query": "*"})),
            ReadCall::search("demo", "search-plan", json!({"query": "*"})),
        ];
        for c in calls {
            match c.method {
                Method::GET => {}
                Method::POST => assert!(
                    c.path.ends_with("/search") || c.path.ends_with("/search-plan"),
                    "POST to a non-search path: {}",
                    c.path
                ),
                other => panic!("mutating method {} is not allowed", other),
            }
        }
    }

    #[test]
    fn parses_relative_times() {
        let now = chrono::Utc::now().timestamp();
        assert!((parse_time("now").unwrap() - now).abs() <= 1);
        assert!((parse_time("now-15m").unwrap() - (now - 900)).abs() <= 1);
        assert!((parse_time("now-2h").unwrap() - (now - 7200)).abs() <= 1);
        assert!((parse_time("now-7d").unwrap() - (now - 604_800)).abs() <= 1);
        assert_eq!(parse_time("1755616000").unwrap(), 1_755_616_000);
        assert_eq!(
            parse_time("2026-08-19T16:44:16Z").unwrap(),
            1_787_157_856
        );
    }

    #[test]
    fn rejects_millisecond_timestamps() {
        // The failure this prevents is silent: a millisecond value is a valid
        // i64, so Quickwit would happily search a window in the year 57000 and
        // return zero hits with no error.
        let err = parse_time("1755616000000").unwrap_err();
        assert!(err.contains("milliseconds"), "{}", err);
    }

    #[test]
    fn rejects_unknown_units_and_garbage() {
        assert!(parse_time("now-15x").is_err());
        assert!(parse_time("last tuesday").is_err());
        assert!(parse_time("now-").is_err());
    }

    #[test]
    fn discovers_dynamic_fields_from_sampled_documents() {
        // Most log indexes are `mode: dynamic`, where the declared mapping holds
        // only the timestamp. Reading the mapping alone reported one field for an
        // index the UI shows eight for, so field discovery has to come from the
        // documents.
        let docs = vec![
            json!({ "@timestamp": "2026-08-19T16:44:16Z", "container_name": "argo-server",
                    "severity_text": "INFO", "resource": { "pod": "argo-1" } }),
            json!({ "@timestamp": "2026-08-19T16:44:17Z", "message": "hello",
                    "status": 200, "ratio": 1.5, "ok": true, "missing": null }),
        ];
        let mut observed = std::collections::BTreeMap::new();
        for d in &docs {
            collect_observed(d.as_object().unwrap(), "", &mut observed);
        }
        let got: Vec<(&str, &str)> = observed.iter().map(|(k, v)| (k.as_str(), *v)).collect();
        assert_eq!(
            got,
            vec![
                ("@timestamp", "text"),
                ("container_name", "text"),
                ("message", "text"),
                ("missing", "null"),
                ("ok", "bool"),
                ("ratio", "f64"),
                ("resource.pod", "text"),
                ("severity_text", "text"),
                ("status", "i64"),
            ]
        );
    }

    #[test]
    fn a_later_null_does_not_erase_a_known_type() {
        let docs = vec![
            json!({ "status": 200 }),
            json!({ "status": null }),
        ];
        let mut observed = std::collections::BTreeMap::new();
        for d in &docs {
            collect_observed(d.as_object().unwrap(), "", &mut observed);
        }
        assert_eq!(observed.get("status"), Some(&"i64"));
    }

    #[test]
    fn interval_scales_to_the_window() {
        // Roughly 60 buckets whatever the span, so the series stays readable and
        // Quickwit is never asked for the hundreds of thousands of buckets it
        // would refuse.
        assert_eq!(pick_interval(60), "1s");            // 1 minute
        assert_eq!(pick_interval(900), "30s");          // 15 minutes
        assert_eq!(pick_interval(3_600), "1m");         // 1 hour
        assert_eq!(pick_interval(86_400), "30m");       // 1 day
        assert_eq!(pick_interval(604_800), "3h");       // 1 week
        assert_eq!(pick_interval(2_592_000), "12h");    // 30 days
        for span in [1, 5, 60, 3_600, 86_400, 604_800, 31_536_000] {
            let label = pick_interval(span);
            let secs = INTERVALS.iter().find(|(l, _)| *l == label).unwrap().1;
            assert!(
                span / secs <= 100,
                "span {} with interval {} gives {} buckets",
                span,
                label,
                span / secs
            );
        }
    }

    #[test]
    fn rejects_intervals_quickwit_would_not_take() {
        assert!(validate_interval("1m").is_ok());
        assert!(validate_interval("1d").is_ok());
        let err = validate_interval("2 fortnights").unwrap_err();
        assert!(err.message.contains("unsupported interval"), "{}", err.message);
        // A plausible-looking but unsupported width must fail here rather than
        // reaching Quickwit as an opaque 400.
        assert!(validate_interval("15m").is_err());
    }

    #[test]
    fn histogram_buckets_reduce_to_time_and_count() {
        let buckets = json!([
            { "key": 1787171080000.0, "key_as_string": "2026-08-19T20:24:40Z", "doc_count": 12 },
            { "key": 1787171140000.0, "key_as_string": "2026-08-19T20:25:40Z", "doc_count": 0 }
        ]);
        let out = simplify_histogram(Some(&buckets));
        assert_eq!(out.len(), 2);
        assert_eq!(out[0]["time"], json!("2026-08-19T20:24:40Z"));
        assert_eq!(out[0]["count"], json!(12));
        assert_eq!(out[1]["count"], json!(0));
        assert!(simplify_histogram(None).is_empty());
    }

    #[test]
    fn token_names_come_from_config_not_from_the_secret() {
        let named = McpToken::parse("ci-bot:s3cr3t", 0).unwrap();
        assert_eq!(named.name, "ci-bot");
        assert_eq!(named.secret, "s3cr3t");

        // A bare secret gets a positional name. Critically it is NOT a prefix of
        // the secret: the first characters of a credential are still part of it,
        // and this name goes into logs and metric labels.
        let bare = McpToken::parse("abcdef0123456789", 2).unwrap();
        assert_eq!(bare.name, "token-3");
        assert_eq!(bare.secret, "abcdef0123456789");
        assert!(!bare.secret.contains(&bare.name));
        assert!(!"abcdef0123456789".starts_with(&bare.name));

        // Only the first colon splits, so a secret containing colons survives.
        let colons = McpToken::parse("agent:a:b:c", 0).unwrap();
        assert_eq!(colons.name, "agent");
        assert_eq!(colons.secret, "a:b:c");

        assert!(McpToken::parse("   ", 0).is_none());
        // A trailing colon is not a name/secret pair; treat the whole thing as
        // the secret rather than accepting an empty credential.
        assert_eq!(McpToken::parse("name:", 0).unwrap().secret, "name:");
    }

    #[test]
    fn unauthorized_body_tells_you_how_to_connect() {
        let mut h = axum::http::HeaderMap::new();
        h.insert(axum::http::header::HOST, "qwui.example.com".parse().unwrap());
        let help = connection_help(&h);

        // The deployment's own URL, so it can be pasted rather than reconstructed.
        assert!(help.contains("https://qwui.example.com/mcp"), "{}", help);
        // The header, both clients, and where to get a token.
        assert!(help.contains("Authorization: Bearer"));
        assert!(help.contains("claude mcp add"));
        assert!(help.contains("mcpServers"));
        assert!(help.contains("Ask whoever operates this qwui for a token"));
        // Never a token, not even an example that might be mistaken for one.
        assert!(!help.contains("Bearer LJ"));

        // Local development is not https.
        let mut local = axum::http::HeaderMap::new();
        local.insert(axum::http::header::HOST, "localhost:8080".parse().unwrap());
        assert!(connection_help(&local).contains("http://localhost:8080/mcp"));

        // A missing Host must not produce a broken URL.
        assert!(connection_help(&axum::http::HeaderMap::new()).contains("https://<host>/mcp"));
    }

    #[test]
    fn cursor_snippet_in_the_help_is_valid_json() {
        // The snippet is hand-built with escaped braces inside a format!, which is
        // exactly the kind of thing that silently loses a brace.
        let mut h = axum::http::HeaderMap::new();
        h.insert(axum::http::header::HOST, "qwui.example.com".parse().unwrap());
        let help = connection_help(&h);

        let start = help.find('{').expect("snippet present");
        let end = help.rfind('}').expect("snippet closed") + 1;
        let snippet = &help[start..end];
        let parsed: Value = serde_json::from_str(snippet)
            .unwrap_or_else(|e| panic!("Cursor snippet is not valid JSON: {e}\n{snippet}"));
        assert_eq!(
            parsed["mcpServers"]["qwui"]["url"],
            json!("https://qwui.example.com/mcp")
        );
        assert!(parsed["mcpServers"]["qwui"]["headers"]["Authorization"]
            .as_str()
            .unwrap()
            .starts_with("Bearer "));
    }

    #[test]
    fn audit_extracts_what_was_asked() {
        let body = br#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
            "name":"search_logs",
            "arguments":{"index":"infra-kafka","query":"severity_text:ERROR","max_hits":5}}}"#;
        let f = call_facts(body);
        assert_eq!(f.method.as_deref(), Some("tools/call"));
        assert_eq!(f.tool.as_deref(), Some("search_logs"));
        assert_eq!(f.index.as_deref(), Some("infra-kafka"));
        assert_eq!(f.query.as_deref(), Some("severity_text:ERROR"));
    }

    #[test]
    fn audit_bounds_a_caller_controlled_query() {
        // The query goes into a log line, so its length must not be the caller's
        // choice.
        let long = "x".repeat(5_000);
        let body = format!(
            r#"{{"method":"tools/call","params":{{"name":"search_logs","arguments":{{"query":"{}"}}}}}}"#,
            long
        );
        let f = call_facts(body.as_bytes());
        assert_eq!(f.query.unwrap().chars().count(), 500);
    }

    #[test]
    fn audit_survives_bodies_it_cannot_read() {
        // A malformed or unexpected body must not break the request; the audit
        // line just carries less.
        let f = call_facts(b"not json at all");
        assert!(f.tool.is_none() && f.index.is_none() && f.query.is_none());
        let f = call_facts(br#"{"method":"tools/list"}"#);
        assert_eq!(f.method.as_deref(), Some("tools/list"));
        assert!(f.tool.is_none());
    }

    #[test]
    fn rate_limiter_spends_then_refuses() {
        let rl = RateLimiter::new(3, Duration::from_secs(60));
        assert_eq!(rl.check("tok").unwrap(), 2);
        assert_eq!(rl.check("tok").unwrap(), 1);
        assert_eq!(rl.check("tok").unwrap(), 0);
        let wait = rl.check("tok").unwrap_err();
        assert!(wait > 0 && wait <= 61, "wait was {}", wait);
    }

    #[test]
    fn rate_limiter_budgets_each_token_separately() {
        // One agent exhausting its budget must not lock out another.
        let rl = RateLimiter::new(1, Duration::from_secs(60));
        assert!(rl.check("agent-a").is_ok());
        assert!(rl.check("agent-a").is_err());
        assert!(rl.check("agent-b").is_ok());
    }

    #[test]
    fn rate_limiter_forgets_calls_outside_the_window() {
        let rl = RateLimiter::new(2, Duration::from_millis(50));
        assert!(rl.check("t").is_ok());
        assert!(rl.check("t").is_ok());
        assert!(rl.check("t").is_err());
        std::thread::sleep(Duration::from_millis(70));
        assert!(rl.check("t").is_ok(), "window should have rolled over");
        // The pruning also bounds memory: the vector never exceeds the limit.
        let seen = rl.seen.lock().unwrap();
        assert!(seen["t"].len() <= 2);
    }

    #[test]
    fn fallback_limits_are_conservative() {
        // A Quickwit that will not describe itself must not get a generous
        // default; the point of the guardrail is to protect the cluster we know
        // least about.
        let f = QuickwitLimits::fallback("test");
        assert!(f.max_concurrent <= 4);
        assert_eq!(f.request_timeout, Duration::from_secs(30));
        assert!(f.source.contains("test"));
    }

    #[test]
    fn constant_time_eq_matches_semantics() {
        assert!(constant_time_eq("secret", "secret"));
        assert!(!constant_time_eq("secret", "secrat"));
        assert!(!constant_time_eq("secret", "secre"));
        assert!(!constant_time_eq("", "x"));
        assert!(constant_time_eq("", ""));
    }

    #[test]
    fn flattens_nested_field_mappings() {
        let mappings = json!([
            { "name": "@timestamp", "type": "datetime", "fast": true },
            { "name": "message", "type": "text", "tokenizer": "default" },
            { "name": "resource", "type": "object", "field_mappings": [
                { "name": "host", "type": "text" },
                { "name": "k8s", "type": "object", "field_mappings": [
                    { "name": "pod", "type": "text" }
                ]}
            ]}
        ]);
        let mut out = Vec::new();
        flatten_fields(mappings.as_array().unwrap(), "", &mut out);
        let names: Vec<&str> = out
            .iter()
            .map(|f| f["name"].as_str().unwrap())
            .collect();
        assert_eq!(
            names,
            vec![
                "@timestamp",
                "message",
                "resource.host",
                "resource.k8s.pod"
            ]
        );
        assert_eq!(out[0]["fast"], json!(true));
        assert_eq!(out[1]["tokenizer"], json!("default"));
    }
}
