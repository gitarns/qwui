import { useState } from 'react'
import Select, { components } from 'react-select'
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

  // Prepare options for react-select, sorted alphabetically
  const selectOptions = indexes
    .map(idx => {
      const tsField = getTimestampField(idx)
      const incompatible = firstTsField !== null &&
        idx.index_config.index_id !== firstSelectedId &&
        tsField !== firstTsField
      return {
        value: idx.index_config.index_id,
        label: idx.index_config.index_id,
        isDefault: defaultIndex === idx.index_config.index_id,
        isDisabled: incompatible,
        disabledReason: incompatible ? `Timestamp field "${tsField || 'none'}" differs from "${firstTsField}"` : null
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))

  // Custom Option component with star button
  const CustomOption = (props) => {
    const { data } = props
    return (
      <components.Option {...props}>
        <div className="select-option-content" title={data.disabledReason || ''}>
          {!data.isDisabled && (
            <button
              className={`select-star-btn ${data.isDefault ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                handleSetDefaultIndex(data.value)
              }}
              title={data.isDefault ? 'Remove as default' : 'Set as default'}
            >
              {data.isDefault ? '★' : '☆'}
            </button>
          )}
          <span className="select-option-label" style={data.isDisabled ? { color: 'var(--text-muted)', fontStyle: 'italic' } : {}}>
            {data.label}
          </span>
        </div>
      </components.Option>
    )
  }

  // Custom styles for react-select
  const customStyles = {
    control: (base, state) => ({
      ...base,
      backgroundColor: 'var(--input-bg)',
      borderColor: state.isFocused ? '#667eea' : 'var(--input-border)',
      boxShadow: state.isFocused ? '0 0 0 3px rgba(102, 126, 234, 0.1)' : 'none',
      '&:hover': {
        borderColor: state.isFocused ? '#667eea' : 'var(--input-border)'
      }
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: 'var(--bg-tertiary)',
      border: '1px solid var(--border-color)',
      zIndex: 100
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? 'var(--input-bg)'
        : state.isFocused
          ? 'var(--bg-primary)'
          : 'transparent',
      color: 'var(--text-primary)',
      cursor: 'pointer',
      padding: 0
    }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: 'var(--bg-primary)',
      border: '1px solid var(--border-color)',
      borderRadius: '3px',
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: 'var(--text-primary)',
      fontSize: '11px',
      padding: '1px 4px',
    }),
    multiValueRemove: (base) => ({
      ...base,
      color: 'var(--text-muted)',
      ':hover': { backgroundColor: 'var(--border-color)', color: 'var(--text-primary)' }
    }),
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-index-selector">
        <label>Index</label>
        <Select
          isMulti
          value={selectOptions.filter(opt => selectedIndex.split(',').filter(Boolean).includes(opt.value))}
          options={selectOptions}
          onChange={(options) => onIndexChange({ target: { value: (options || []).map(o => o.value).join(',') } })}
          components={{ Option: CustomOption }}
          styles={customStyles}
          isSearchable={true}
          placeholder="Search or select index..."
          closeMenuOnSelect={false}
        />
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
                  <div className="field-header-main" onClick={() => toggleField(field)} style={{ cursor: 'pointer', flex: 1, display: 'flex', alignItems: 'center' }}>
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
