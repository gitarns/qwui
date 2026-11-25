//! Prometheus metrics, exposed at `/metrics`.
//!
//! The backend had none: the counters that existed lived in the Go backend,
//! which is gone. That was tolerable while the only client was a browser driven
//! by a person, and stops being tolerable once agents can query the
//! logging cluster on their own -- the rate limiter keeps them from overwhelming
//! Quickwit, but says nothing about what they actually did.
//!
//! Labels are deliberately low-cardinality. `agent` is a token *name*, never the
//! secret and never a free-form string from a request, so a caller cannot inflate
//! the series count by inventing values.

use prometheus::{
    Encoder, HistogramOpts, HistogramVec, IntCounterVec, Opts, Registry, TextEncoder,
};
use std::sync::OnceLock;

pub(crate) struct Metrics {
    registry: Registry,
    /// One per MCP tool call: which agent, which tool, how it ended.
    pub(crate) tool_calls: IntCounterVec,
    /// Wall-clock time per tool, to spot the ones that are quietly expensive.
    pub(crate) tool_duration: HistogramVec,
    /// Requests refused before doing any work, by reason (`unauthorized`,
    /// `rate_limited`). The signal that an agent is misbehaving.
    pub(crate) rejections: IntCounterVec,
    /// Requests issued to Quickwit, by outcome. Reveals fan-out: one tool call
    /// can be twenty Quickwit searches.
    pub(crate) quickwit_requests: IntCounterVec,
    /// Time spent waiting for a concurrency permit. Rising values mean the
    /// guardrail is the bottleneck, which is the number to raise the limit on.
    pub(crate) permit_wait: HistogramVec,
}

static METRICS: OnceLock<Metrics> = OnceLock::new();

pub(crate) fn metrics() -> &'static Metrics {
    METRICS.get_or_init(|| {
        let registry = Registry::new();

        let tool_calls = IntCounterVec::new(
            Opts::new("qwui_mcp_tool_calls_total", "MCP tool calls, by outcome"),
            &["agent", "tool", "outcome"],
        )
        .expect("valid metric");

        let tool_duration = HistogramVec::new(
            HistogramOpts::new(
                "qwui_mcp_tool_duration_seconds",
                "Wall-clock duration of an MCP tool call",
            )
            // Spread for a log query: sub-second to the 30s Quickwit timeout.
            .buckets(vec![0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0]),
            &["tool"],
        )
        .expect("valid metric");

        let rejections = IntCounterVec::new(
            Opts::new(
                "qwui_mcp_rejections_total",
                "MCP requests refused before any work was done",
            ),
            &["reason"],
        )
        .expect("valid metric");

        let quickwit_requests = IntCounterVec::new(
            Opts::new(
                "qwui_mcp_quickwit_requests_total",
                "Requests MCP issued to Quickwit, by outcome",
            ),
            &["outcome"],
        )
        .expect("valid metric");

        let permit_wait = HistogramVec::new(
            HistogramOpts::new(
                "qwui_mcp_permit_wait_seconds",
                "Time an MCP request waited for a Quickwit concurrency permit",
            )
            .buckets(vec![0.001, 0.01, 0.05, 0.1, 0.5, 1.0, 5.0]),
            &["kind"],
        )
        .expect("valid metric");

        for c in [&tool_calls, &rejections, &quickwit_requests] {
            registry.register(Box::new((*c).clone())).expect("register");
        }
        for h in [&tool_duration, &permit_wait] {
            registry.register(Box::new((*h).clone())).expect("register");
        }

        Metrics {
            registry,
            tool_calls,
            tool_duration,
            rejections,
            quickwit_requests,
            permit_wait,
        }
    })
}

/// Renders the registry in Prometheus text format.
pub(crate) fn render() -> String {
    let m = metrics();
    let mut buf = Vec::new();
    if TextEncoder::new()
        .encode(&m.registry.gather(), &mut buf)
        .is_err()
    {
        return String::new();
    }
    String::from_utf8(buf).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_registered_metrics() {
        let m = metrics();
        m.tool_calls
            .with_label_values(&["ci-bot", "search_logs", "ok"])
            .inc();
        m.rejections.with_label_values(&["rate_limited"]).inc();
        m.quickwit_requests.with_label_values(&["ok"]).inc();
        m.tool_duration
            .with_label_values(&["search_logs"])
            .observe(0.4);

        let out = render();
        assert!(out.contains("qwui_mcp_tool_calls_total"), "{}", out);
        assert!(out.contains("agent=\"ci-bot\""), "{}", out);
        assert!(out.contains("qwui_mcp_rejections_total"), "{}", out);
        assert!(out.contains("qwui_mcp_tool_duration_seconds"), "{}", out);
    }

    #[test]
    fn no_secret_ever_becomes_a_label() {
        // The label set is fixed here on purpose. If a future edit adds a label
        // fed from request data, this test is the place that should stop it.
        let m = metrics();
        m.tool_calls
            .with_label_values(&["token-1", "list_indexes", "ok"])
            .inc();
        let out = render();
        assert!(!out.contains("Bearer"), "{}", out);
        // A token name is fine; the secret it stands for must never appear.
        assert!(out.contains("agent=\"token-1\""), "{}", out);
    }
}
