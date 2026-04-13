import { useState, useRef, useEffect } from 'react'
import './FieldsSidebar.css'

const POPULAR_MAX = 10

function loadPopularity() {
  try { return JSON.parse(localStorage.getItem('fieldPopularity') || '{}') } catch { return {} }
}

function savePopularity(data) {
  localStorage.setItem('fieldPopularity', JSON.stringify(data))
}

function FieldsSidebar({ fields, aggregations, loadingFields = new Set(), onFilterChange, onFieldExpand, selectedIndex, indexes, onIndexChange, selectedColumns = [], onToggleColumn, onSetDefaultIndex, viewMode }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [popularity, setPopularity] = useState(loadPopularity)
  const [defaultIndex, setDefaultIndex] = useState(() => {
    return localStorage.getItem('defaultIndex') || null
  })
  const [valueModalField, setValueModalField] = useState(null)
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 })
  const fieldRefs = useRef({})

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

  const handleFieldClick = (field, event) => {
    event.stopPropagation()

    // If clicking the same field that has the popover open, close it
    if (valueModalField === field) {
      setValueModalField(null)
      return
    }

    // Get the position of the clicked field
    const fieldElement = event.currentTarget
    const rect = fieldElement.getBoundingClientRect()
    const sidebarRect = fieldElement.closest('.sidebar').getBoundingClientRect()

    const POPOVER_WIDTH = 380
    const POPOVER_HEIGHT = 300 // approximate max height
    const GAP = 8
    const PADDING = 10 // padding from viewport edge

    let left = rect.right - sidebarRect.left + GAP
    let top = rect.top - sidebarRect.top

    // Check if popover would overflow on the right
    const popoverRightEdge = sidebarRect.left + left + POPOVER_WIDTH
    if (popoverRightEdge > window.innerWidth - PADDING) {
      // Position to the left of the field instead
      left = rect.left - sidebarRect.left - POPOVER_WIDTH - GAP
    }

    // Check if popover would overflow at the bottom
    const popoverBottomEdge = rect.top + POPOVER_HEIGHT
    if (popoverBottomEdge > window.innerHeight - PADDING) {
      // Adjust top to keep it visible
      top = window.innerHeight - PADDING - POPOVER_HEIGHT - sidebarRect.top
    }

    // Ensure positions are not negative
    left = Math.max(0, left)
    top = Math.max(0, top)

    // Open popover immediately
    setPopoverPosition({ top, left })
    setValueModalField(field)

    // Fetch aggregation in the background if not already loaded or loading
    if (!aggregations?.[field]?.buckets && !loadingFields.has(field) && onFieldExpand) {
      onFieldExpand(field)
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

  useEffect(() => {
    if (!valueModalField) return
    const handler = (e) => {
      const popover = document.querySelector('.values-popover')
      const fieldHeader = e.target.closest('.field-header')

      // Don't close if clicking inside the popover
      if (popover && popover.contains(e.target)) {
        return
      }

      // Don't close if clicking a field header (let handleFieldClick handle it)
      if (fieldHeader) {
        return
      }

      // Close on any other click
      setValueModalField(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [valueModalField])

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
              const isLoading = loadingFields.has(field)
              const hasBuckets = aggregation && aggregation.buckets && aggregation.buckets.length > 0
              return (
                <div key={field} className="field-item selected-field-item">
                  <div className="field-header" onClick={(e) => handleFieldClick(field, e)} style={{ cursor: 'pointer' }}>
                    <div
                      className="field-header-main"
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
                      title={field}
                    >
                      <span className="field-icon">t</span>
                      <span className="field-name" title={field}>
                        {field}
                      </span>
                      {isLoading && <span className="field-loading" title="Loading aggregation data">⟳</span>}
                      {!isLoading && !hasBuckets && <span className="field-no-stats" title="Click to load aggregation data">◯</span>}
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
            const isLoading = loadingFields.has(field)
            const hasBuckets = aggregation && aggregation.buckets && aggregation.buckets.length > 0
            const isColumnSelected = selectedColumns.includes(field)
            return (
              <div key={`popular-${field}`} className="field-item popular-field-item">
                <div className="field-header" onClick={(e) => handleFieldClick(field, e)} style={{ cursor: 'pointer' }}>
                  <div
                    className="field-header-main"
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
                    {isLoading && <span className="field-loading" title="Loading aggregation data">⟳</span>}
                    {!isLoading && !hasBuckets && <span className="field-no-stats" title="Click to load aggregation data">◯</span>}
                  </div>
                  <button
                    className={`add-column-btn ${isColumnSelected ? 'selected' : ''}`}
                    onClick={(e) => { e.stopPropagation(); trackFieldUse(field); onToggleColumn && onToggleColumn(field) }}
                    title={isColumnSelected ? 'Remove field as column' : 'Add field as column'}
                  >
                    {isColumnSelected ? '−' : '+'}
                  </button>
                </div>
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
            const isLoading = loadingFields.has(field)
            const hasBuckets = aggregation && aggregation.buckets && aggregation.buckets.length > 0
            const isColumnSelected = selectedColumns.includes(field)

            return (
              <div key={field} className="field-item">
                <div className="field-header" onClick={(e) => handleFieldClick(field, e)} style={{ cursor: 'pointer' }}>
                  <div
                    className="field-header-main"
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
                    {isLoading && <span className="field-loading" title="Loading aggregation data">⟳</span>}
                    {!isLoading && !hasBuckets && <span className="field-no-stats" title="Click to load aggregation data">◯</span>}
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
              </div>
            )
          })
        )}
      </div>

      {/* Values Popover */}
      {valueModalField && (
        <div className="values-popover" style={{ top: `${popoverPosition.top}px`, left: `${popoverPosition.left}px` }}>
          <div className="values-popover-header">
            <h3>{valueModalField}</h3>
            <button className="values-popover-close" onClick={() => setValueModalField(null)}>×</button>
          </div>
          <div className="values-popover-content">
            {loadingFields.has(valueModalField) ? (
              <div className="popover-loading">
                <div className="loading-spinner"></div>
                <p>Loading field values...</p>
              </div>
            ) : aggregations?.[valueModalField]?.buckets?.length > 0 ? (
              aggregations[valueModalField].buckets.slice(0, 10).map((bucket, idx) => {
                const displayKey = bucket.key_as_string || String(bucket.key)
                return (
                  <div key={idx} className="popover-bucket-item">
                    <div className="popover-bucket-info">
                      <span className="popover-bucket-key" title={displayKey}>
                        {displayKey}
                      </span>
                      <span className="popover-bucket-count">{bucket.doc_count.toLocaleString()}</span>
                    </div>
                    <div className="popover-bucket-actions">
                      <button
                        className="popover-filter-btn popover-include-btn"
                        onClick={() => {
                          handleInclude(valueModalField, displayKey)
                          setValueModalField(null)
                        }}
                        title="Include this value"
                      >
                        ⊕
                      </button>
                      <button
                        className="popover-filter-btn popover-exclude-btn"
                        onClick={() => {
                          handleExclude(valueModalField, displayKey)
                          setValueModalField(null)
                        }}
                        title="Exclude this value"
                      >
                        ⊖
                      </button>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="popover-empty">
                <p>No data available</p>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}

export default FieldsSidebar
