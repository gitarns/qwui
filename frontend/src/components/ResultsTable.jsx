import { useState, useEffect, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import ReactJson from '@microlink/react-json-view'
import './ResultsTable.css'

function extractHighlightTerms(query) {
  if (!query || query.trim() === '*') return []
  const terms = []
  // quoted phrases
  const quoted = [...query.matchAll(/"([^"]+)"/g)]
  quoted.forEach(m => terms.push(m[1]))
  // strip quoted parts and field:value → extract the value
  let rest = query.replace(/"[^"]+"/g, '')
  const fieldValues = [...rest.matchAll(/\w+:([^\s"]+)/g)]
  fieldValues.forEach(m => { if (!m[1].includes('*')) terms.push(m[1]) })
  rest = rest.replace(/\w+:[^\s"]+/g, '')
  // bare words (skip operators)
  rest.split(/\s+/).forEach(w => {
    if (w && !['AND', 'OR', 'NOT', '*', '-'].includes(w.toUpperCase()) && !w.includes('*'))
      terms.push(w)
  })
  return [...new Set(terms.filter(t => t.length >= 2))]
}

function highlightText(text, terms) {
  if (!terms.length || !text) return text
  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = String(text).split(regex)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    regex.test(part) ? <mark key={i} className="search-highlight">{part}</mark> : part
  )
}

function ResultsTable({ results, loading, timestampField = 'timestamp', hasMoreResults = false, loadingMore = false, onLoadMore, requestTime = null, selectedColumns = [], onRemoveColumn, onFilterChange, onToggleColumn, userPreferences, darkMode = false, searchQuery = '' }) {
  const [expandedRows, setExpandedRows] = useState(new Set())
  const [sortBy, setSortBy] = useState({ field: null, direction: 'asc' })
  const [expandedRowTabs, setExpandedRowTabs] = useState({}) // Track active tab for each expanded row
  const [copiedIndex, setCopiedIndex] = useState(null) // Track which row was copied
  const scrollContainerRef = useRef(null)

  const highlightTerms = extractHighlightTerms(searchQuery)

  // Extract preferences with defaults
  const defaultTab = userPreferences?.defaultTab || 'table'
  const fontSize = userPreferences?.fontSize || 13
  const baseJsonViewOptions = userPreferences?.jsonViewOptions || {
    collapsed: false,
    displayDataTypes: true,
    displayObjectSize: true,
    enableClipboard: true,
    iconStyle: 'circle',
    themeLightMode: 'rjv-default',
    themeDarkMode: 'monokai'
  }

  // Override theme based on dark mode
  const jsonViewOptions = {
    ...baseJsonViewOptions,
    theme: darkMode ?
      (baseJsonViewOptions.themeDarkMode || 'monokai') :
      (baseJsonViewOptions.themeLightMode || 'rjv-default')
  }

  // Close all expanded documents when new search results arrive
  useEffect(() => {
    setExpandedRows(new Set())

    // Log search results info
    // Results logged in SearchBar component
  }, [results, requestTime])

  // Handle scroll to bottom for infinite loading
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer || !hasMoreResults || loadingMore) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer
      // Trigger load more when scrolled to within 100px of the bottom
      if (scrollHeight - scrollTop - clientHeight < 100) {
        if (onLoadMore && hasMoreResults && !loadingMore) {
          onLoadMore()
        }
      }
    }

    scrollContainer.addEventListener('scroll', handleScroll)
    return () => scrollContainer.removeEventListener('scroll', handleScroll)
  }, [hasMoreResults, loadingMore, onLoadMore])

  if (loading) {
    return (
      <div className="results-container">
        <div className="loading-state">Searching...</div>
      </div>
    )
  }

  if (!results) {
    return (
      <div className="results-container">
        <div className="empty-state">Run a search to see results</div>
      </div>
    )
  }

  const { hits, num_hits, elapsed_time_micros } = results

  const toggleRow = (index) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
      // Clean up tab state when closing
      setExpandedRowTabs(prev => {
        const newTabs = { ...prev }
        delete newTabs[index]
        return newTabs
      })
    } else {
      newExpanded.add(index)
      // Initialize tab state to user's default preference
      setExpandedRowTabs(prev => ({ ...prev, [index]: defaultTab }))
    }
    setExpandedRows(newExpanded)
  }

  const setActiveTab = (index, tab) => {
    setExpandedRowTabs(prev => ({ ...prev, [index]: tab }))
  }

  const copyJsonToClipboard = async (hit, index) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(hit, null, 2))
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000) // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy JSON:', err)
    }
  }

  const handleSort = (field) => {
    setSortBy(prev => ({
      field: field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  // Sort hits based on sortBy state
  const sortedHits = (hits && sortBy.field) ? [...hits].sort((a, b) => {
    const aVal = getNestedValue(a, sortBy.field)
    const bVal = getNestedValue(b, sortBy.field)

    // Handle null/undefined
    if (aVal === null || aVal === undefined) return 1
    if (bVal === null || bVal === undefined) return -1

    // Compare values
    let comparison = 0
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      comparison = aVal - bVal
    } else {
      comparison = String(aVal).localeCompare(String(bVal))
    }

    return sortBy.direction === 'asc' ? comparison : -comparison
  }) : hits

  const isTimestamp = (key, value) => {
    // Use the configured timestamp field from the index
    if (key === timestampField) return true

    // Fallback: Check if the field name suggests it's a timestamp
    const timestampFields = ['timestamp', '@timestamp', 'created_at', 'updated_at', 'time', 'date']
    const keyLower = key.toLowerCase()
    const isTimestampField = timestampFields.some(field => keyLower.includes(field))

    if (!isTimestampField) return false

    // Check if the value is an ISO 8601 date string
    if (typeof value === 'string') {
      // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ or similar
      const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/
      return iso8601Regex.test(value)
    }

    // Check if the value is a Unix timestamp (in seconds or milliseconds)
    if (typeof value === 'number') {
      const isUnixSeconds = value > 946684800 && value < 4102444800 // 2000-2100 in seconds
      const isUnixMillis = value > 946684800000 && value < 4102444800000 // 2000-2100 in milliseconds
      return isUnixSeconds || isUnixMillis
    }

    return false
  }

  const formatTimestamp = (value) => {
    if (typeof value === 'string') {
      // For ISO 8601/RFC 3339 strings, preserve full precision by extracting fractional seconds
      // Format: 2025-11-15T16:19:52.078892Z
      const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/)
      if (match) {
        const fractional = match[2]
        // Parse the date and format it
        const date = parseISO(value)
        const baseFormat = format(date, "yyyy-MM-dd'T'HH:mm:ss")

        // Preserve original fractional seconds precision
        if (fractional) {
          return baseFormat + fractional
        }
        return baseFormat
      }
      // Fallback for other string formats
      return value
    } else if (typeof value === 'number') {
      // Parse Unix timestamp (detect if seconds or milliseconds)
      const timestamp = value > 946684800000 ? value : value * 1000
      const date = new Date(timestamp)

      // Format with milliseconds if present
      const baseFormat = format(date, "yyyy-MM-dd'T'HH:mm:ss")
      if (timestamp % 1000 !== 0) {
        const ms = String(date.getMilliseconds()).padStart(3, '0')
        return `${baseFormat}.${ms}`
      }
      return baseFormat
    }

    return String(value)
  }

  const formatValue = (value, key = '') => {
    if (value === null || value === undefined) return 'null'
    if (typeof value === 'object') return JSON.stringify(value, null, 2)
    if (isTimestamp(key, value)) {
      return formatTimestamp(value)
    }
    return String(value)
  }

  // Helper function to get nested value by dot-notation path
  const getNestedValue = (obj, path) => {
    if (!path) return obj
    const keys = path.split('.')
    let value = obj
    for (const key of keys) {
      if (value === null || value === undefined) return undefined
      value = value[key]
    }
    return value
  }

  const renderValueWithSyntaxHighlight = (value, key = '') => {
    if (value === null || value === undefined) {
      return <span className="syntax-null">null</span>
    }
    if (typeof value === 'object') {
      return <span className="syntax-object">{highlightText(JSON.stringify(value, null, 2), highlightTerms)}</span>
    }
    if (isTimestamp(key, value)) {
      const formatted = formatTimestamp(value)
      return <span className="syntax-string">{highlightText(formatted, highlightTerms)}</span>
    }
    if (typeof value === 'number') {
      return <span className="syntax-number">{highlightText(String(value), highlightTerms)}</span>
    }
    if (typeof value === 'string') {
      return <span className="syntax-string">{highlightText(value, highlightTerms)}</span>
    }
    if (typeof value === 'boolean') {
      return <span className="syntax-boolean">{String(value)}</span>
    }
    return String(value)
  }


  return (
    <div className="results-container" style={{ fontSize: `${fontSize}px` }}>
      <div className="results-table" ref={scrollContainerRef}>
        {hits && hits.length > 0 ? (
          <div className="results-list">
            <div
              className="results-list-header"
              style={{
                gridTemplateColumns: selectedColumns.length === 0
                  ? 'auto 200px 1fr'
                  : `auto 200px repeat(${selectedColumns.length}, minmax(200px, 1fr))`
              }}
            >
              <div className="header-expand"></div>
              <div className="header-time">Time</div>
              {selectedColumns.length === 0 ? (
                <div className="header-document">Document</div>
              ) : (
                selectedColumns.map((column) => (
                  <div key={column} className="header-column">
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={column}>
                      {column}
                    </span>
                    <div className="column-actions">
                      <button
                        className={`sort-column-btn ${sortBy.field === column ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSort(column)
                        }}
                        title={sortBy.field === column && sortBy.direction === 'desc' ? 'Sort ascending' : 'Sort descending'}
                      >
                        {sortBy.field === column ? (sortBy.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </button>
                      <button
                        className="remove-column-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemoveColumn && onRemoveColumn(column)
                        }}
                        title="Remove column"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {sortedHits.map((hit, index) => {
              const isExpanded = expandedRows.has(index)
              const fields = Object.entries(hit).sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()))

              // Find timestamp field using the configured timestampField
              const timestampValue = hit[timestampField] ? formatTimestamp(hit[timestampField]) : '-'

              // Get non-timestamp fields for content preview
              const contentFields = fields.filter(([key]) => key !== timestampField)

              return (
                <div key={index} className="result-item">
                  <div
                    className="result-row"
                    onClick={() => toggleRow(index)}
                    style={{
                      gridTemplateColumns: selectedColumns.length === 0
                        ? 'auto 200px 1fr'
                        : `auto 200px repeat(${selectedColumns.length}, minmax(200px, 1fr))`,
                      fontSize: `${fontSize}px`
                    }}
                  >
                    <button className="expand-btn">
                      {isExpanded ? '▼' : '▶'}
                    </button>
                    <div className="result-timestamp">
                      {timestampValue}
                    </div>
                    {selectedColumns.length === 0 ? (
                      <div className="result-content">
                        <div className="result-json-preview">
                          {contentFields.map(([key, value], idx) => (
                            <span key={idx} className="field-value-pair">
                              <span className="field-name-badge">{key}:</span>
                              <span className="field-value-text">{highlightText(JSON.stringify(value), highlightTerms)}</span>
                              {idx < contentFields.length - 1 && ' '}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      selectedColumns.map((column) => {
                        const value = getNestedValue(hit, column)
                        return (
                          <div key={column} className="result-column-value-wrapper">
                            <div className="result-column-value">
                              {renderValueWithSyntaxHighlight(value, column)}
                            </div>
                            <div className="column-filter-buttons">
                              <button
                                className="column-filter-btn filter-in"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const filterType = (value === null || value === undefined) ? 'not_exists' : 'include'
                                  onFilterChange && onFilterChange(column, value, filterType)
                                }}
                                title={value === null || value === undefined ? "Filter for null (field does not exist)" : "Filter for this value"}
                              >
                                +
                              </button>
                              <button
                                className="column-filter-btn filter-out"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  const filterType = (value === null || value === undefined) ? 'exists' : 'exclude'
                                  onFilterChange && onFilterChange(column, value, filterType)
                                }}
                                title={value === null || value === undefined ? "Filter out null (field exists)" : "Filter out this value"}
                              >
                                −
                              </button>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>

                  {isExpanded && (
                    <div className="result-expanded">
                      <div className="expanded-tabs">
                        <button
                          className={`tab-button ${expandedRowTabs[index] === 'table' || !expandedRowTabs[index] ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setActiveTab(index, 'table')
                          }}
                        >
                          Table
                        </button>
                        <button
                          className={`tab-button ${expandedRowTabs[index] === 'json' ? 'active' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setActiveTab(index, 'json')
                          }}
                        >
                          JSON
                        </button>
                      </div>
                      <div className="tab-content">
                        {(expandedRowTabs[index] === 'table' || !expandedRowTabs[index]) && (
                          <table className="result-table" style={{ fontSize: `${fontSize}px` }}>
                            <thead>
                              <tr>
                                <th className="table-header-actions">Actions</th>
                                <th className="table-header-field">Field</th>
                                <th className="table-header-value">Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {fields.map(([key, value]) => {
                                const isColumnSelected = selectedColumns.includes(key)
                                return (
                                  <tr key={key}>
                                    <td className="table-field-actions">
                                      <div className="action-buttons">
                                        <button
                                          className="action-btn filter-in-btn"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            onFilterChange && onFilterChange(key, value, 'include')
                                          }}
                                          title="Filter for value"
                                        >
                                          ⊕
                                        </button>
                                        <button
                                          className="action-btn filter-out-btn"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            onFilterChange && onFilterChange(key, value, 'exclude')
                                          }}
                                          title="Filter out value"
                                        >
                                          ⊖
                                        </button>
                                        <button
                                          className={`action-btn toggle-column-btn ${isColumnSelected ? 'selected' : ''}`}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            onToggleColumn && onToggleColumn(key)
                                          }}
                                          title={isColumnSelected ? 'Remove column' : 'Toggle column'}
                                        >
                                          ⚙
                                        </button>
                                      </div>
                                    </td>
                                    <td className="table-field-name">{key}</td>
                                    <td className="table-field-value">
                                      <code>{renderValueWithSyntaxHighlight(value, key)}</code>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        )}
                        {expandedRowTabs[index] === 'json' && (
                          <div className="json-container">
                            <button
                              className="copy-json-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                copyJsonToClipboard(hit, index)
                              }}
                              title="Copy JSON to clipboard"
                            >
                              {copiedIndex === index ? '✓ Copied!' : '📋 Copy'}
                            </button>
                            <div className="json-view" style={{ fontSize: `${fontSize}px` }}>
                              <ReactJson
                                src={hit}
                                theme={jsonViewOptions.theme}
                                collapsed={jsonViewOptions.collapsed}
                                displayDataTypes={jsonViewOptions.displayDataTypes}
                                displayObjectSize={jsonViewOptions.displayObjectSize}
                                enableClipboard={jsonViewOptions.enableClipboard}
                                name={false}
                                indentWidth={2}
                                iconStyle={jsonViewOptions.iconStyle}
                                style={{ fontSize: `${fontSize}px` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {loadingMore && (
              <div className="loading-more-indicator">
                <div className="spinner"></div>
                <span>Loading more results...</span>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">No results found</div>
        )}
      </div>
    </div>
  )
}

export default ResultsTable
