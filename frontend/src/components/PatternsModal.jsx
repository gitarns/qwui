import { useState } from 'react'

function PatternsModal({ isOpen, onClose, patterns = [], loading, error, totalLogs, totalClusters, fields = [], field, onFieldChange }) {
  const [expandedSamples, setExpandedSamples] = useState({})

  if (!isOpen) return null

  const toggleSample = (i) => setExpandedSamples(prev => ({ ...prev, [i]: !prev[i] }))

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal patterns-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <div className="patterns-header-left">
            <span>Log Patterns</span>
            {totalLogs > 0 && (
              <span className="patterns-subtitle">{totalLogs.toLocaleString()} events · {totalClusters} clusters</span>
            )}
          </div>
          <div className="patterns-header-right">
            <select
              className="patterns-field-select"
              value={field}
              onChange={e => onFieldChange(e.target.value)}
              disabled={loading}
            >
              <option value="_all">All fields</option>
              {fields.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <button className="settings-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="patterns-content">
          {loading && <div className="patterns-loading">Analyzing patterns…</div>}
          {error && <div className="patterns-error">{error}</div>}
          {!loading && !error && patterns.length === 0 && (
            <div className="patterns-empty">No patterns found.</div>
          )}
          {!loading && !error && patterns.map((p, i) => (
            <div key={i} className="pattern-card">
              <div className="pattern-card-header">
                <span className="pattern-pct">{p.percentage.toFixed(2)}%</span>
                <span className="pattern-count">{p.count.toLocaleString()} events</span>
                {p.sample && (
                  <button className="pattern-sample-btn" onClick={() => toggleSample(i)}>
                    {expandedSamples[i] ? 'Hide sample' : 'Show sample'}
                  </button>
                )}
              </div>
              <div className="pattern-bar-row">
                <div className="pattern-bar-track">
                  <div className="pattern-bar-fill" style={{ width: `${Math.min(p.percentage, 100)}%` }} />
                </div>
              </div>
              <div className="pattern-template">
                {p.template.split(/(<\*>)/).map((part, j) =>
                  part === '<*>'
                    ? <span key={j} className="pattern-wildcard">&lt;*&gt;</span>
                    : <span key={j}>{part}</span>
                )}
              </div>
              {expandedSamples[i] && p.sample && (
                <div className="pattern-sample">{p.sample}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default PatternsModal
