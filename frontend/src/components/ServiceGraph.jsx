import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './ServiceGraph.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

const SERVICE_PALETTE = [
  '#5794F2', '#73BF69', '#F2CC0C', '#FF9830', '#F43A3A',
  '#B877D9', '#37872D', '#1F78C1', '#E0B400', '#8AB8FF',
  '#C4162A', '#96D98D', '#FADE2A', '#F2A72B', '#6ED0E0',
]

const colorCache = new Map()
function serviceColor(name) {
  if (!colorCache.has(name)) colorCache.set(name, SERVICE_PALETTE[colorCache.size % SERVICE_PALETTE.length])
  return colorCache.get(name)
}

function fmtDur(ms) {
  if (ms == null || isNaN(ms)) return '—'
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`
  if (ms < 1000) return `${ms.toFixed(1)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function fmtRate(n) {
  if (n == null || isNaN(n)) return '—'
  return n < 10 ? n.toFixed(2) : n.toFixed(1)
}

// ── Graph data builder ────────────────────────────────────────────────────────

function buildGraphData(spans) {
  if (!spans || spans.length === 0) return { nodes: [], edges: [] }

  // Index spans by span_id for parent lookups
  const bySpanId = new Map()
  spans.forEach(s => bySpanId.set(s.span_id, s))

  // Per-service metrics
  const svcMetrics = new Map()
  // Per-directed-edge metrics: "src->dst" → { count, errors, total_ms }
  const edgeMetrics = new Map()

  // Time window from min/max timestamps
  let minNs = Infinity, maxNs = -Infinity
  spans.forEach(s => {
    const ns = s.span_start_timestamp_nanos
    if (ns != null) { if (ns < minNs) minNs = ns; if (ns > maxNs) maxNs = ns }
  })
  const windowSecs = Math.max((maxNs - minNs) / 1e9, 1)

  spans.forEach(span => {
    const svc = span.service_name || 'unknown'
    if (!svcMetrics.has(svc)) {
      svcMetrics.set(svc, { count: 0, errors: 0, total_ms: 0 })
    }
    const m = svcMetrics.get(svc)
    m.count++
    if (span.span_status?.code === 'STATUS_CODE_ERROR') m.errors++
    m.total_ms += span.span_duration_millis ?? 0

    // Build edge from parent service → this service
    if (span.parent_span_id && span.parent_span_id !== '') {
      const parent = bySpanId.get(span.parent_span_id)
      const parentSvc = parent?.service_name
      if (parentSvc && parentSvc !== svc) {
        const key = `${parentSvc}→${svc}`
        if (!edgeMetrics.has(key)) edgeMetrics.set(key, { src: parentSvc, dst: svc, count: 0, errors: 0 })
        const em = edgeMetrics.get(key)
        em.count++
        if (span.span_status?.code === 'STATUS_CODE_ERROR') em.errors++
      }
    }
  })

  // Max edge count for thickness scaling
  const maxEdgeCount = Math.max(...[...edgeMetrics.values()].map(e => e.count), 1)

  // Build ReactFlow nodes
  const rfNodes = [...svcMetrics.entries()].map(([svc, m]) => {
    const errorRate = m.count > 0 ? m.errors / m.count : 0
    const avgMs = m.count > 0 ? m.total_ms / m.count : 0
    const reqPerSec = m.count / windowSecs
    const color = serviceColor(svc)
    const statusColor = errorRate > 0.05 ? '#F43A3A' : errorRate > 0.01 ? '#F2CC0C' : '#73BF69'
    return {
      id: svc,
      type: 'serviceNode',
      position: { x: 0, y: 0 }, // positioned by layout algo below
      data: { label: svc, color, statusColor, reqPerSec, errorRate, avgMs },
    }
  })

  // Build ReactFlow edges
  const rfEdges = [...edgeMetrics.entries()].map(([key, em]) => {
    const thickness = 1 + Math.round((em.count / maxEdgeCount) * 5)
    const errorRate = em.count > 0 ? em.errors / em.count : 0
    const edgeColor = errorRate > 0.05 ? '#F43A3A' : errorRate > 0.01 ? '#F2CC0C' : 'var(--border-color, #888)'
    return {
      id: key,
      source: em.src,
      target: em.dst,
      label: `${fmtRate(em.count / windowSecs)}/s`,
      labelStyle: { fontSize: 10, fill: 'var(--text-secondary, #888)' },
      labelBgStyle: { fill: 'var(--bg-primary, #1e1e2e)', fillOpacity: 0.85 },
      labelBgPadding: [3, 5],
      style: { stroke: edgeColor, strokeWidth: thickness },
      markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
      animated: thickness >= 3,
    }
  })

  // ── Layered layout (BFS from roots) ────────────────────────────────────────
  const inDegree = new Map(rfNodes.map(n => [n.id, 0]))
  const outAdj = new Map(rfNodes.map(n => [n.id, []]))
  rfEdges.forEach(e => {
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1)
    outAdj.get(e.source)?.push(e.target)
  })

  const layers = []
  const visited = new Set()
  let queue = rfNodes.filter(n => (inDegree.get(n.id) || 0) === 0).map(n => n.id)
  // If everything is in a cycle (no roots), just start with all
  if (queue.length === 0) queue = rfNodes.map(n => n.id)

  while (queue.length > 0) {
    layers.push([...queue])
    queue.forEach(id => visited.add(id))
    const next = new Set()
    queue.forEach(id => outAdj.get(id)?.forEach(tid => { if (!visited.has(tid)) next.add(tid) }))
    queue = [...next]
  }
  // any nodes missed (isolated / cycles not caught)
  rfNodes.forEach(n => { if (!visited.has(n.id)) layers.push([n.id]) })

  const NODE_W = 210, NODE_H = 110, H_GAP = 70, V_GAP = 90
  const posMap = new Map()
  layers.forEach((layer, li) => {
    const totalW = layer.length * NODE_W + (layer.length - 1) * H_GAP
    layer.forEach((id, i) => {
      posMap.set(id, {
        x: i * (NODE_W + H_GAP) - totalW / 2 + NODE_W / 2,
        y: li * (NODE_H + V_GAP),
      })
    })
  })

  rfNodes.forEach(n => { n.position = posMap.get(n.id) || { x: 0, y: 0 } })

  return { nodes: rfNodes, edges: rfEdges }
}

// ── Custom node ───────────────────────────────────────────────────────────────

function ServiceNode({ data, selected }) {
  const errorPct = (data.errorRate * 100)
  return (
    <div
      className={`sg-node ${selected ? 'selected' : ''}`}
      style={{ borderColor: data.statusColor }}
      title={data.label}
    >
      <Handle type="target" position={Position.Top} style={{ background: data.statusColor }} />
      <div className="sg-node-header">
        <span className="sg-node-dot" style={{ background: data.color }} />
        <span className="sg-node-name">{data.label}</span>
      </div>
      <div className="sg-node-metrics">
        <div className="sg-metric">
          <span className="sg-metric-label">req/s</span>
          <span className="sg-metric-value">{fmtRate(data.reqPerSec)}</span>
        </div>
        <div className="sg-metric">
          <span className="sg-metric-label">errors</span>
          <span className="sg-metric-value" style={{ color: errorPct > 0 ? '#F43A3A' : 'inherit' }}>
            {errorPct.toFixed(1)}%
          </span>
        </div>
        <div className="sg-metric">
          <span className="sg-metric-label">avg</span>
          <span className="sg-metric-value">{fmtDur(data.avgMs)}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: data.statusColor }} />
    </div>
  )
}

const nodeTypes = { serviceNode: ServiceNode }

// ── Inner graph (needs ReactFlowProvider context) ─────────────────────────────

function GraphInner({ spans, loading, onNodeClick }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const { fitView } = useReactFlow()

  useEffect(() => {
    const { nodes: n, edges: e } = buildGraphData(spans)
    setNodes(n)
    setEdges(e)
    setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 50)
  }, [spans, setNodes, setEdges, fitView])

  const handleNodeClick = useCallback((_, node) => {
    onNodeClick(node.id)
  }, [onNodeClick])

  if (loading) return <div className="sg-placeholder">Building service graph…</div>
  if (nodes.length === 0) return <div className="sg-placeholder">No service relationships found in current data.</div>

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} size={1} color="var(--border-color, #333)" />
      <Controls showInteractive={false} />
      <MiniMap
        nodeColor={n => n.data?.statusColor || '#888'}
        nodeStrokeWidth={2}
        zoomable
        pannable
      />
    </ReactFlow>
  )
}

// ── Public component ──────────────────────────────────────────────────────────

export default function ServiceGraph({
  selectedIndex,
  apiUrl = '',
  startTime,
  endTime,
  filters = [],
  query = '*',
  searchTrigger = 0,
  onNodeClick,
}) {
  const [spans, setSpans] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  const fetch_ = useCallback(async () => {
    if (!selectedIndex) return
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    setError(null)

    const indexes = Array.isArray(selectedIndex) ? selectedIndex.join(',') : selectedIndex
    const parts = []
    if (query && query !== '*') parts.push(query)
    filters.filter(f => !f.disabled).forEach(f => {
      if (f.operator === 'is' || !f.operator) parts.push(`${f.field}:"${f.value}"`)
      else if (f.operator === 'is not') parts.push(`NOT ${f.field}:"${f.value}"`)
    })
    const q = parts.length > 0 ? parts.join(' AND ') : '*'

    const body = { query: q, max_hits: 2000 }
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
      setSpans(data.hits || [])
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [selectedIndex, apiUrl, startTime, endTime, query, filters])

  useEffect(() => { fetch_() }, [searchTrigger, selectedIndex, fetch_])

  return (
    <div className="service-graph-container">
      {error && <div className="trace-error">{error}</div>}
      <div className="sg-canvas">
        <ReactFlowProvider>
          <GraphInner spans={spans} loading={loading} onNodeClick={onNodeClick} />
        </ReactFlowProvider>
      </div>
      {spans.length > 0 && (
        <div className="sg-footer">
          Based on {spans.length.toLocaleString()} spans · click a node to filter traces
        </div>
      )}
    </div>
  )
}
