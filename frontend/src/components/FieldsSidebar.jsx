import { useState, useRef, useEffect } from 'react'
import './FieldsSidebar.css'

const POPULAR_MAX = 10

function loadPopularity() {
  try { return JSON.parse(localStorage.getItem('fieldPopularity') || '{}') } catch { return {} }
}

function savePopularity(data) {
  localStorage.setItem('fieldPopularity', JSON.stringify(data))
}

function FieldsSidebar({ fields, aggregations, onFilterChange, onFieldExpand, selectedIndex, indexes, onIndexChange, selectedColumns = [], onToggleColumn, onSetDefaultIndex, viewMode }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedFields, setExpandedFields] = useState(new Set())
  const [popularity, setPopularity] = useState(loadPopularity)
  const [defaultIndex, setDefaultIndex] = useState(() => {
    return localStorage.getItem('defaultIndex') || null
  })

  // primary index (first in comma-joined list) used as key for popularity
  const primaryIndex = selectedIndex.split(',')[0] || selectedIndex

  const trackFieldUse = (field) => {
    setPopularity(prev => {
      const next = { ...prev, [primaryIndex]: { ...(prev[primaryIndex] || {}), [field]: ((prev[primaryIndex] || {})[field] || 0) + 1 } }
      savePopularity(next)
      return next
    })
  }

  const indexPopularity = popularity[primaryIndex] || {}
  const popularFields = Object.entries(indexPopularity)
    .filter(([f]) => fields.includes(f) && !selectedColumns.includes(f))
    .sort((a, b) => b[1] - a[1])
    .slice(0, POPULAR_MAX)
    .map(([f]) => f)

  const filteredFields = fields
    .filter(field =>
      field.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !selectedColumns.includes(field) &&
      !popularFields.includes(field)
    )
    .sort((a, b) => a.localeCompare(b))

  const filteredPopular = popularFields.filter(f =>
    f.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const toggleField = async (field) => {
    const newExpanded = new Set(expandedFields)
    if (newExpanded.has(field)) {
      newExpanded.delete(field)
      setExpandedFields(newExpanded)
    } else {
      newExpanded.add(field)
      setExpandedFields(newExpanded)
      if (onFieldExpand && !aggregations?.[field]) {
        await onFieldExpand(field)
      }
    }
  }

  const getFieldAggregation = (fieldName) => {
    if (!aggregations) return null
    return aggregations[fieldName]
  }

  const handleInclude = (fieldName, value) => {
    if (onFilterChange) {
      onFilterChange(fieldName, value, 'include')
    }
  }

  const handleExclude = (fieldName, value) => {
    if (onFilterChange) {
      onFilterChange(fieldName, value, 'exclude')
    }
  }

  const handleSetDefaultIndex = (indexId) => {
    const newDefault = defaultIndex === indexId ? null : indexId
    setDefaultIndex(newDefault)
    if (newDefault) {
      localStorage.setItem('defaultIndex', newDefault)
    } else {
      localStorage.removeItem('defaultIndex')
    }
    if (onSetDefaultIndex) {
      onSetDefaultIndex(newDefault)
    }
  }

  const getTimestampField = (idx) =>
    idx.index_config?.doc_mapping?.timestamp_field ||
    idx.index_config?.indexing_settings?.timestamp_field ||
    null

  const firstSelectedId = selectedIndex.split(',').filter(Boolean)[0]
  const firstIndex = indexes.find(idx => idx.index_config.index_id === firstSelectedId)
  const firstTsField = firstIndex ? getTimestampField(firstIndex) : null
  const selectedIds = selectedIndex.split(',').filter(Boolean)

  const sortedIndexes = [...indexes].sort((a, b) =>
    a.index_config.index_id.localeCompare(b.index_config.index_id)
  )

  // Index dropdown state
  const [indexDropdownOpen, setIndexDropdownOpen] = useState(false)
  const [indexSearch, setIndexSearch] = useState('')
  const dropdownRef = useRef(null)

  useEffect(() => {
    if (!indexDropdownOpen) return
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setIndexDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [indexDropdownOpen])

  const handleSelectOnly = (indexId) => {
    onIndexChange({ target: { value: indexId } })
    setIndexDropdownOpen(false)
    setIndexSearch('')
  }

  const handleAddIndex = (e, indexId) => {
    e.stopPropagation()
    const next = selectedIds.includes(indexId)
      ? selectedIds.filter(id => id !== indexId)
      : [...selectedIds, indexId]
    onIndexChange({ target: { value: next.join(',') } })
  }

  const filteredIndexes = sortedIndexes.filter(idx =>
    idx.index_config.index_id.toLowerCase().includes(indexSearch.toLowerCase())
  )

  return (
    <aside className="sidebar">
      <div className="sidebar-index-selector" ref={dropdownRef}>
        <label>Index</label>
        <div
          className={`index-control ${indexDropdownOpen ? 'open' : ''}`}
          onClick={() => setIndexDropdownOpen(v => !v)}
        >
          <span className="index-control-value">
            {selectedIds.length === 0
              ? <span className="index-placeholder">Select index…</span>
              : selectedIds.map(id => (
                <span key={id} className="index-chip">
                  {id}
                  <button
                    className="index-chip-remove"
                    onClick={e => { e.stopPropagation(); handleAddIndex(e, id) }}
                    title="Remove"
                  >×</button>
                </span>
              ))
            }
          </span>
          <span className="index-control-arrow">{indexDropdownOpen ? '▴' : '▾'}</span>
        </div>

        {indexDropdownOpen && (
          <div className="index-dropdown">
            <input
              className="index-search-input"
              placeholder="Search indexes…"
              value={indexSearch}
              onChange={e => setIndexSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
              autoFocus
            />
            <div className="index-dropdown-list">
              {filteredIndexes.map(idx => {
                const id = idx.index_config.index_id
                const tsField = getTimestampField(idx)
                const compatible = !firstTsField || !firstSelectedId || tsField === firstTsField || id === firstSelectedId
                const isSelected = selectedIds.includes(id)
                const isAdded = isSelected && selectedIds.length > 1 && id !== firstSelectedId
                const isDefault = defaultIndex === id

                return (
                  <div
                    key={id}
                    className={`index-option ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectOnly(id)}
                  >
                    <button
                      className={`select-star-btn ${isDefault ? 'active' : ''}`}
                      onClick={e => { e.stopPropagation(); handleSetDefaultIndex(id) }}
                      title={isDefault ? 'Remove as default' : 'Set as default'}
                    >
                      {isDefault ? '★' : '☆'}
                    </button>
                    <span className="index-option-label">{id}</span>
                    <button
                      className={`index-add-btn ${isAdded ? 'added' : ''}`}
                      onClick={e => handleAddIndex(e, id)}
                      title={!compatible ? `Timestamp field "${tsField || 'none'}" differs from "${firstTsField}"` : isAdded ? 'Remove from selection' : 'Add to selection'}
                      disabled={!compatible}
                    >
                      {isAdded ? '−' : '+'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="field-search">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          placeholder="Search field names"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <button
            className="clear-field-search-button"
            onClick={() => setSearchTerm('')}
            type="button"
            title="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {/* Selected fields section */}
      {selectedColumns.length > 0 && (
        <>
          <div className="sidebar-header">
            <details open>
              <summary>
                <span className="section-title">Selected fields</span>
                <span className="field-count">{selectedColumns.length}</span>
              </summary>
            </details>
          </div>

          <div className="fields-list selected-fields-list">
            {[...selectedColumns].sort((a, b) => a.localeCompare(b)).map(field => {
              const aggregation = getFieldAggregation(field)
              const hasBuckets = aggregation && aggregation.buckets && aggregation.buckets.length > 0
              const isExpanded = expandedFields.has(field)
              return (
                <div key={field} className="field-item selected-field-item">
                  <div className={`field-header ${isExpanded ? 'expanded' : ''}`}>
                    <div
                      className="field-header-main"
                      onClick={() => toggleField(field)}
                      draggable={viewMode === 'visualize'}
                      onDragStart={(e) => {
                        if (viewMode !== 'visualize') {
                          e.preventDefault()
                          return
                        }
                        e.dataTransfer.setData('field', field)
                        e.dataTransfer.setData(`field:${field}`, '')
                      }}
                      style={{ cursor: viewMode === 'visualize' ? 'grab' : 'pointer', flex: 1, display: 'flex', alignItems: 'center' }}
                    >
                      <span className="field-icon">t</span>
                      <span className="field-name" title={field}>
                        {field}
                      </span>
                    </div>
                    <button
                      className="add-column-btn selected"
                      onClick={(e) => {
                        e.stopPropagation()
                        trackFieldUse(field); onToggleColumn && onToggleColumn(field)
                      }}
                      title="Remove field as column"
                    >
                      −
                    </button>
                  </div>

                  {hasBuckets && isExpanded && (
                    <div className="field-buckets">
                      {aggregation.buckets.map((bucket, idx) => {
                        const displayKey = bucket.key_as_string || String(bucket.key)
                        return (
                          <div key={idx} className="bucket-item">
                            <span className="bucket-key" title={displayKey}>
                              {displayKey.substring(0, 25)}
                              {displayKey.length > 25 ? '...' : ''}
                            </span>
                            <div className="bucket-actions">
                              <span className="bucket-count">{bucket.doc_count.toLocaleString()}</span>
                              <button
                                className="filter-btn include-btn"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleInclude(field, displayKey)
                                }}
                                title="Include this value"
                              >
                                ⊕
                              </button>
                              <button
                                className="filter-btn exclude-btn"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleExclude(field, displayKey)
                                }}
                                title="Exclude this value"
                              >
                                ⊖
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      <div className="sidebar-header">
        <details open>
          <summary>
            <span className="section-title">Available fields</span>
            <span className="field-count">{fields.length - selectedColumns.length}</span>
          </summary>
        </details>
      </div>

      {filteredPopular.length > 0 && (
        <div className="fields-list popular-fields-list">
          <div className="popular-section-label">Popular</div>
          {filteredPopular.map(field => {
            const aggregation = aggregations?.[field]
            const hasBuckets = aggregation && aggregation.buckets && aggregation.buckets.length > 0
            const isExpanded = expandedFields.has(field)
            const isColumnSelected = selectedColumns.includes(field)
            return (
              <div key={`popular-${field}`} className="field-item popular-field-item">
                <div className={`field-header ${isExpanded ? 'expanded' : ''}`}>
                  <div
                    className="field-header-main"
                    onClick={() => toggleField(field)}
                    draggable={viewMode === 'visualize'}
                    onDragStart={(e) => {
                      if (viewMode !== 'visualize') {
                        e.preventDefault()
                        return
                      }
                      e.dataTransfer.setData('field', field)
                      e.dataTransfer.setData(`field:${field}`, '')
                    }}
                    style={{ cursor: viewMode === 'visualize' ? 'grab' : 'pointer', flex: 1, display: 'flex', alignItems: 'center' }}
                  >
                    <span className="field-icon">t</span>
                    <span className="field-name" title={field}>{field}</span>
                  </div>
                  <button
                    className={`add-column-btn ${isColumnSelected ? 'selected' : ''}`}
                    onClick={(e) => { e.stopPropagation(); trackFieldUse(field); onToggleColumn && onToggleColumn(field) }}
                    title={isColumnSelected ? 'Remove field as column' : 'Add field as column'}
                  >
                    {isColumnSelected ? '−' : '+'}
                  </button>
                </div>
                {hasBuckets && isExpanded && (
                  <div className="field-buckets">
                    {aggregation.buckets.map((bucket, idx) => {
                      const displayKey = bucket.key_as_string || String(bucket.key)
                      return (
                        <div key={idx} className="bucket-item">
                          <span className="bucket-key" title={displayKey}>
                            {displayKey.substring(0, 25)}
                            {displayKey.length > 25 ? '...' : ''}
                          </span>
                          <div className="bucket-actions">
                            <span className="bucket-count">{bucket.doc_count.toLocaleString()}</span>
                            <button
                              className="filter-btn include-btn"
                              onClick={(e) => { e.stopPropagation(); handleInclude(field, displayKey) }}
                              title="Include this value"
                            >⊕</button>
                            <button
                              className="filter-btn exclude-btn"
                              onClick={(e) => { e.stopPropagation(); handleExclude(field, displayKey) }}
                              title="Exclude this value"
                            >⊖</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          <div className="popular-section-divider" />
        </div>
      )}

      <div className="fields-list">
        {filteredFields.length === 0 ? (
          <div className="empty-state">
            {fields.length === 0 ? 'Run a search to discover fields' : 'No fields match your search'}
          </div>
        ) : (
          filteredFields.map(field => {
            const aggregation = getFieldAggregation(field)
            const hasBuckets = aggregation && aggregation.buckets && aggregation.buckets.length > 0
            const isExpanded = expandedFields.has(field)
            const isColumnSelected = selectedColumns.includes(field)

            return (
              <div key={field} className="field-item">
                <div className={`field-header ${isExpanded ? 'expanded' : ''}`}>
                  <div
                    className="field-header-main"
                    onClick={() => toggleField(field)}
                    draggable={viewMode === 'visualize'}
                    onDragStart={(e) => {
                      if (viewMode !== 'visualize') {
                        e.preventDefault()
                        return
                      }
                      e.dataTransfer.setData('field', field)
                      e.dataTransfer.setData(`field:${field}`, '')
                    }}
                    style={{ cursor: viewMode === 'visualize' ? 'grab' : 'pointer', flex: 1, display: 'flex', alignItems: 'center' }}
                  >
                    <span className="field-icon">t</span>
                    <span className="field-name" title={field}>
                      {field}
                    </span>
                  </div>
                  <button
                    className={`add-column-btn ${isColumnSelected ? 'selected' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      trackFieldUse(field); onToggleColumn && onToggleColumn(field)
                    }}
                    title={isColumnSelected ? 'Remove field as column' : 'Add field as column'}
                  >
                    {isColumnSelected ? '−' : '+'}
                  </button>
                </div>

                {hasBuckets && isExpanded && (
                  <div className="field-buckets">
                    {aggregation.buckets.map((bucket, idx) => {
                      const displayKey = bucket.key_as_string || String(bucket.key)
                      return (
                        <div key={idx} className="bucket-item">
                          <span className="bucket-key" title={displayKey}>
                            {displayKey.substring(0, 25)}
                            {displayKey.length > 25 ? '...' : ''}
                          </span>
                          <div className="bucket-actions">
                            <span className="bucket-count">{bucket.doc_count.toLocaleString()}</span>
                            <button
                              className="filter-btn include-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleInclude(field, displayKey)
                              }}
                              title="Include this value"
                            >
                              ⊕
                            </button>
                            <button
                              className="filter-btn exclude-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleExclude(field, displayKey)
                              }}
                              title="Exclude this value"
                            >
                              ⊖
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}

export default FieldsSidebar
