import { useState, useEffect, useRef, useCallback } from 'react'
import ServiceGraph from './ServiceGraph'
import './TraceView.css'

const SERVICE_PALETTE = [
  '#5794F2', '#73BF69', '#F2CC0C', '#FF9830', '#F43A3A',
  '#B877D9', '#37872D', '#1F78C1', '#E0B400', '#8AB8FF',
  '#C4162A', '#96D98D', '#FADE2A', '#F2A72B', '#6ED0E0',
]

function getServiceColor(name, map) {
  if (!map.has(name)) map.set(name, SERVICE_PALETTE[map.size % SERVICE_PALETTE.length])
  return map.get(name)
}

function formatDuration(ms) {
  if (ms === null || ms === undefined || isNaN(ms)) return '—'
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000) return `${ms.toFixed(2)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatTimestamp(ns) {
  if (!ns && ns !== 0) return '—'
  const d = new Date(ns / 1_000_000)
  return d.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })
}

function truncateId(id, len = 8) {
  if (!id) return '—'
  return id.length > len ? id.slice(0, len) + '…' : id
}

function buildWaterfallRows(spans) {
  if (!spans || spans.length === 0) return []

  const byId = new Map()
  spans.forEach(s => byId.set(s.span_id, { ...s, children: [] }))

  const roots = []
  spans.forEach(s => {
    const node = byId.get(s.span_id)
    if (s.parent_span_id && s.parent_span_id !== '' && byId.has(s.parent_span_id)) {
      byId.get(s.parent_span_id).children.push(node)
    } else {
      roots.push(node)
    }
  })

  const sortByStart = node => {
    node.children.sort((a, b) => (a.span_start_timestamp_nanos || 0) - (b.span_start_timestamp_nanos || 0))
    node.children.forEach(sortByStart)
  }
  roots.forEach(sortByStart)
  roots.sort((a, b) => (a.span_start_timestamp_nanos || 0) - (b.span_start_timestamp_nanos || 0))

  const rows = []
  const dfs = (node, depth) => {
    rows.push({ ...node, depth })
    node.children.forEach(c => dfs(c, depth + 1))
  }
  roots.forEach(r => dfs(r, 0))
  return rows
}

const SPAN_KIND_LABELS = { 0: 'UNSPECIFIED', 1: 'INTERNAL', 2: 'SERVER', 3: 'CLIENT', 4: 'PRODUCER', 5: 'CONSUMER' }

function SpanKindBadge({ kind }) {
  const label = SPAN_KIND_LABELS[kind] || 'UNSPECIFIED'
  return <span className={`span-kind-badge kind-${label.toLowerCase()}`}>{label}</span>
}

function StatusDot({ status }) {
  const code = status?.code || 'STATUS_CODE_UNSET'
  const isError = code === 'STATUS_CODE_ERROR' || code === 2
  const isOk = code === 'STATUS_CODE_OK' || code === 1
  return <span className={`status-dot ${isError ? 'error' : isOk ? 'ok' : 'unset'}`} title={code} />
}

function AttributeTable({ attrs }) {
  if (!attrs || typeof attrs !== 'object') return null
  const entries = Object.entries(attrs)
  if (entries.length === 0) return <span className="no-attrs">—</span>
  return (
    <table className="attr-table">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k}>
            <td className="attr-key">{k}</td>
            <td className="attr-val">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function TraceView({
  selectedIndex,
  apiUrl = '',
  startTime,
  endTime,
  filters = [],
  query = '*',
  searchTrigger = 0,
}) {
  const [traceList, setTraceList] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [selectedTraceId, setSelectedTraceId] = useState(null)
  const [traceSpans, setTraceSpans] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [expandedSpans, setExpandedSpans] = useState(new Set())

  // Local filters (independent of main app filters)
  const [serviceFilter, setServiceFilter] = useState('')
  const [operationFilter, setOperationFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [minDuration, setMinDuration] = useState('')
  const [maxDuration, setMaxDuration] = useState('')

  const [activeTab, setActiveTab] = useState('traces') // 'traces' | 'graph'

  const abortRef = useRef(null)
  const serviceColorMap = useRef(new Map())

  function buildQuery() {
    const parts = []
    if (query && query !== '*' && query !== '') parts.push(query)
    if (serviceFilter.trim()) parts.push(`service_name:"${serviceFilter.trim()}"`)
    if (operationFilter.trim()) parts.push(`span_name:"${operationFilter.trim()}"`)
    if (tagFilter.trim()) parts.push(tagFilter.trim())
    filters.filter(f => f.enabled !== false && !f.disabled).forEach(f => {
      if (f.operator === 'is' || !f.operator) parts.push(`${f.field}:"${f.value}"`)
      else if (f.operator === 'is not') parts.push(`NOT ${f.field}:"${f.value}"`)
      else if (f.operator === 'exists') parts.push(`_exists_:${f.field}`)
      else if (f.operator === 'does not exist') parts.push(`NOT _exists_:${f.field}`)
    })
    return parts.length > 0 ? parts.join(' AND ') : '*'
  }

  const fetchTraces = useCallback(async () => {
    if (!selectedIndex) return

    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    setLoading(true)
    setError(null)

    const indexes = Array.isArray(selectedIndex) ? selectedIndex.join(',') : selectedIndex
    const body = {
      query: buildQuery(),
      max_hits: 500,
    }

    if (startTime) body.start_timestamp = Math.floor(startTime / 1000)
    if (endTime) body.end_timestamp = Math.floor(endTime / 1000)

    try {
      const resp = await fetch(`${apiUrl}/quickwit/api/v1/${indexes}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      })

      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()
      const spans = data.hits || []

      // Group by trace_id client-side
      const traceMap = new Map()
      spans.forEach(span => {
        const tid = span.trace_id
        if (!tid) return
        if (!traceMap.has(tid)) {
          traceMap.set(tid, {
            trace_id: tid,
            root_service: null,
            root_operation: null,
            start_ns: null,
            end_ns: null,
            span_count: 0,
            has_error: false,
            services: new Set(),
          })
        }
        const t = traceMap.get(tid)
        t.span_count++
        if (span.service_name) t.services.add(span.service_name)
        const isError = span.span_status?.code === 'STATUS_CODE_ERROR'
        if (isError) t.has_error = true

        const s = span.span_start_timestamp_nanos
        const e = span.span_end_timestamp_nanos
        if (s != null && (t.start_ns === null || s < t.start_ns)) t.start_ns = s
        if (e != null && (t.end_ns === null || e > t.end_ns)) t.end_ns = e

        const isRoot = span.is_root || !span.parent_span_id || span.parent_span_id === ''
        if (isRoot || t.root_operation === null) {
          t.root_service = span.service_name || t.root_service
          t.root_operation = span.span_name || t.root_operation
        }
      })

      let traces = Array.from(traceMap.values()).map(t => ({
        ...t,
        services: Array.from(t.services),
        duration_ms: t.start_ns != null && t.end_ns != null
          ? (t.end_ns - t.start_ns) / 1_000_000 : null,
      }))

      // Duration filters
      const minMs = parseFloat(minDuration)
      const maxMs = parseFloat(maxDuration)
      if (!isNaN(minMs)) traces = traces.filter(t => t.duration_ms == null || t.duration_ms >= minMs)
      if (!isNaN(maxMs)) traces = traces.filter(t => t.duration_ms == null || t.duration_ms <= maxMs)

      traces.sort((a, b) => (b.start_ns || 0) - (a.start_ns || 0))
      setTraceList(traces)
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, apiUrl, startTime, endTime, query, filters, serviceFilter, operationFilter, tagFilter, minDuration, maxDuration])

  const fetchTraceDetail = useCallback(async (traceId) => {
    if (!selectedIndex || !traceId) return
    setDetailLoading(true)
    setTraceSpans([])
    setExpandedSpans(new Set())
    serviceColorMap.current = new Map()

    const indexes = Array.isArray(selectedIndex) ? selectedIndex.join(',') : selectedIndex
    try {
      const resp = await fetch(`${apiUrl}/quickwit/api/v1/${indexes}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `trace_id:"${traceId}"`,
          max_hits: 1000,
        }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()
      setTraceSpans(data.hits || [])
    } catch (e) {
      console.error('Failed to fetch trace detail:', e)
    } finally {
      setDetailLoading(false)
    }
  }, [selectedIndex, apiUrl])

  useEffect(() => {
    if (selectedIndex) fetchTraces()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTrigger, selectedIndex])

  function handleSelectTrace(traceId) {
    setSelectedTraceId(traceId)
    fetchTraceDetail(traceId)
  }

  function handleSearch(e) {
    e.preventDefault()
    fetchTraces()
  }

  function toggleSpan(spanId) {
    setExpandedSpans(prev => {
      const next = new Set(prev)
      if (next.has(spanId)) next.delete(spanId)
      else next.add(spanId)
      return next
    })
  }

  // ── Waterfall ──────────────────────────────────────────────────────────────
  const waterfallRows = buildWaterfallRows(traceSpans)
  const traceStartNs = waterfallRows.length > 0
    ? Math.min(...waterfallRows.map(r => r.span_start_timestamp_nanos).filter(v => v != null))
    : 0
  const traceEndNs = waterfallRows.length > 0
    ? Math.max(...waterfallRows.map(r => r.span_end_timestamp_nanos).filter(v => v != null))
    : 0
  const traceRangeNs = Math.max(traceEndNs - traceStartNs, 1_000_000) // min 1ms

  function pct(val) { return `${Math.max(0, Math.min(100, val))}%` }

  // Time ruler ticks
  const TICK_COUNT = 5
  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, i) => ({
    pct: (i / TICK_COUNT) * 100,
    ms: (traceRangeNs / 1_000_000 * i) / TICK_COUNT,
  }))

  const selectedTrace = traceList.find(t => t.trace_id === selectedTraceId)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="trace-view">

      {/* ── Search panel ─────────────────────────────────────────────────── */}
      <form className="trace-search-panel" onSubmit={handleSearch}>
        <div className="trace-filter-row">
          <div className="trace-filter-group">
            <label>Service</label>
            <input
              type="text"
              placeholder="e.g. frontend"
              value={serviceFilter}
              onChange={e => setServiceFilter(e.target.value)}
            />
          </div>
          <div className="trace-filter-group">
            <label>Operation</label>
            <input
              type="text"
              placeholder="e.g. HTTP GET /api"
              value={operationFilter}
              onChange={e => setOperationFilter(e.target.value)}
            />
          </div>
          <div className="trace-filter-group narrow">
            <label>Min duration (ms)</label>
            <input
              type="number"
              placeholder="0"
              min="0"
              value={minDuration}
              onChange={e => setMinDuration(e.target.value)}
            />
          </div>
          <div className="trace-filter-group narrow">
            <label>Max duration (ms)</label>
            <input
              type="number"
              placeholder="∞"
              min="0"
              value={maxDuration}
              onChange={e => setMaxDuration(e.target.value)}
            />
          </div>
          <div className="trace-filter-group flex1">
            <label>Tags</label>
            <input
              type="text"
              placeholder='http.status_code:500'
              value={tagFilter}
              onChange={e => setTagFilter(e.target.value)}
            />
          </div>
          <button type="submit" className="trace-search-btn" disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </form>

      {error && <div className="trace-error">{error}</div>}

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div className="trace-tab-bar">
        <button
          className={`trace-tab ${activeTab === 'traces' ? 'active' : ''}`}
          onClick={() => setActiveTab('traces')}
        >
          Traces
        </button>
        <button
          className={`trace-tab ${activeTab === 'graph' ? 'active' : ''}`}
          onClick={() => setActiveTab('graph')}
        >
          Service Graph
        </button>
      </div>

      {/* ── Service Graph ─────────────────────────────────────────────────── */}
      {activeTab === 'graph' && (
        <ServiceGraph
          selectedIndex={selectedIndex}
          apiUrl={apiUrl}
          startTime={startTime}
          endTime={endTime}
          filters={filters}
          query={query}
          searchTrigger={searchTrigger}
          onNodeClick={(svcName) => {
            setServiceFilter(svcName)
            setActiveTab('traces')
          }}
        />
      )}

      <div className="trace-main" style={{ display: activeTab === 'traces' ? 'flex' : 'none' }}>

        {/* ── Trace list ────────────────────────────────────────────────── */}
        <div className={`trace-list-panel ${selectedTraceId ? 'has-detail' : ''}`}>
          <div className="trace-list-header">
            <span>Timestamp</span>
            <span>Trace ID</span>
            <span>Root Service</span>
            <span>Root Operation</span>
            <span>Duration</span>
            <span>Spans</span>
          </div>

          {loading && traceList.length === 0 && (
            <div className="trace-placeholder">Searching for traces…</div>
          )}

          {!loading && traceList.length === 0 && !error && (
            <div className="trace-placeholder">
              No traces found. Select a traces index (e.g. <code>otel-traces-v0_7</code>) and click Search.
            </div>
          )}

          {traceList.map(trace => (
            <div
              key={trace.trace_id}
              className={`trace-row ${trace.has_error ? 'has-error' : ''} ${selectedTraceId === trace.trace_id ? 'selected' : ''}`}
              onClick={() => handleSelectTrace(trace.trace_id)}
            >
              <span className="trace-ts">{formatTimestamp(trace.start_ns)}</span>
              <span className="trace-id" title={trace.trace_id}>
                <span className={`trace-status-dot ${trace.has_error ? 'error' : 'ok'}`} />
                {truncateId(trace.trace_id, 16)}
              </span>
              <span className="trace-service">
                {trace.root_service && (
                  <span
                    className="service-pill"
                    style={{ background: getServiceColor(trace.root_service, serviceColorMap.current) + '33', borderColor: getServiceColor(trace.root_service, serviceColorMap.current) }}
                  >
                    {trace.root_service}
                  </span>
                )}
              </span>
              <span className="trace-op">{trace.root_operation || '—'}</span>
              <span className="trace-dur">{formatDuration(trace.duration_ms)}</span>
              <span className="trace-count">{trace.span_count}</span>
            </div>
          ))}
        </div>

        {/* ── Trace detail / waterfall ───────────────────────────────────── */}
        {selectedTraceId && (
          <div className="trace-detail-panel">
            <div className="trace-detail-header">
              <div className="trace-detail-title">
                <button className="trace-close-btn" onClick={() => setSelectedTraceId(null)}>✕</button>
                <span className="trace-detail-id" title={selectedTraceId}>
                  Trace {truncateId(selectedTraceId, 20)}
                </span>
                {selectedTrace && (
                  <span className="trace-detail-meta">
                    {formatDuration(selectedTrace.duration_ms)}
                    {' · '}
                    {selectedTrace.span_count} span{selectedTrace.span_count !== 1 ? 's' : ''}
                    {' · '}
                    {selectedTrace.services?.join(', ')}
                  </span>
                )}
              </div>
            </div>

            {detailLoading && <div className="trace-placeholder">Loading spans…</div>}

            {!detailLoading && waterfallRows.length > 0 && (
              <div className="waterfall-container">

                {/* Time ruler */}
                <div className="waterfall-ruler-row">
                  <div className="waterfall-label-col" />
                  <div className="waterfall-timeline-col">
                    <div className="waterfall-ruler">
                      {ticks.map((t, i) => (
                        <div key={i} className="ruler-tick" style={{ left: pct(t.pct) }}>
                          <span className="ruler-label">{formatDuration(t.ms)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="waterfall-dur-col" />
                </div>

                {/* Span rows */}
                {waterfallRows.map(span => {
                  const startNs = span.span_start_timestamp_nanos || traceStartNs
                  const endNs   = span.span_end_timestamp_nanos || startNs
                  const startOff = (startNs - traceStartNs) / traceRangeNs
                  const durNs  = endNs - startNs
                  const width = Math.max(durNs / traceRangeNs, 0.002)
                  const durMs = span.span_duration_millis != null ? span.span_duration_millis : durNs / 1_000_000
                  const color = getServiceColor(span.service_name || 'unknown', serviceColorMap.current)
                  const isError = span.span_status?.code === 'STATUS_CODE_ERROR'
                  const isExpanded = expandedSpans.has(span.span_id)

                  return (
                    <div key={span.span_id} className={`waterfall-span-group ${isError ? 'is-error' : ''}`}>
                      <div
                        className={`waterfall-row ${isExpanded ? 'expanded' : ''}`}
                        onClick={() => toggleSpan(span.span_id)}
                      >
                        {/* Label column */}
                        <div className="waterfall-label-col" style={{ paddingLeft: `${span.depth * 16 + 8}px` }}>
                          <span
                            className="span-expand-icon"
                            style={{ visibility: (span.children?.length > 0 || isExpanded) ? 'visible' : 'hidden' }}
                          >
                            {isExpanded ? '▾' : '▸'}
                          </span>
                          <span className="span-service-dot" style={{ background: color }} />
                          <span className="span-name" title={span.span_name}>{span.span_name || '—'}</span>
                          <span className="span-service-label" style={{ color }}>{span.service_name}</span>
                        </div>

                        {/* Timeline column */}
                        <div className="waterfall-timeline-col">
                          <div className="span-bar-track">
                            <div
                              className={`span-bar ${isError ? 'error' : ''}`}
                              style={{
                                left: pct(startOff * 100),
                                width: pct(width * 100),
                                background: isError ? '#F43A3A' : color,
                              }}
                              title={`${formatDuration(durMs)} · ${formatTimestamp(startNs)}`}
                            />
                          </div>
                        </div>

                        {/* Duration column */}
                        <div className="waterfall-dur-col">
                          {formatDuration(durMs)}
                        </div>
                      </div>

                      {/* Expanded span details */}
                      {isExpanded && (
                        <div className="span-details">
                          <div className="span-details-grid">
                            <div className="span-detail-section">
                              <h4>Span Info</h4>
                              <table className="attr-table">
                                <tbody>
                                  <tr><td>Trace ID</td><td><code>{span.trace_id}</code></td></tr>
                                  <tr><td>Span ID</td><td><code>{span.span_id}</code></td></tr>
                                  {span.parent_span_id && <tr><td>Parent ID</td><td><code>{span.parent_span_id}</code></td></tr>}
                                  <tr><td>Service</td><td>{span.service_name || '—'}</td></tr>
                                  <tr><td>Kind</td><td><SpanKindBadge kind={span.span_kind} /></td></tr>
                                  <tr><td>Status</td><td><StatusDot status={span.span_status} /> {span.span_status?.code || 'UNSET'}{span.span_status?.message ? `: ${span.span_status.message}` : ''}</td></tr>
                                  <tr><td>Start</td><td>{formatTimestamp(startNs)}</td></tr>
                                  <tr><td>Duration</td><td>{formatDuration(durMs)}</td></tr>
                                </tbody>
                              </table>
                            </div>
                            {span.span_attributes && Object.keys(span.span_attributes).length > 0 && (
                              <div className="span-detail-section">
                                <h4>Span Attributes</h4>
                                <AttributeTable attrs={span.span_attributes} />
                              </div>
                            )}
                            {span.resource_attributes && Object.keys(span.resource_attributes).length > 0 && (
                              <div className="span-detail-section">
                                <h4>Resource Attributes</h4>
                                <AttributeTable attrs={span.resource_attributes} />
                              </div>
                            )}
                            {span.events && span.events.length > 0 && (
                              <div className="span-detail-section">
                                <h4>Events ({span.events.length})</h4>
                                {span.events.map((ev, i) => (
                                  <div key={i} className="span-event">
                                    <span className="span-event-name">{ev.event_name || ev.name}</span>
                                    <AttributeTable attrs={ev.attributes} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {!detailLoading && traceSpans.length === 0 && (
              <div className="trace-placeholder">No spans found for this trace.</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
