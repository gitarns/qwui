import { useState, useRef, useEffect } from 'react'
import './SearchBar.css'

function SearchBar({ onSearch, loading, timeRangePicker, fields = [], selectedIndex, onFetchFieldValues, firstEventTime, lastEventTime, histogramInterval, onHistogramIntervalChange, intervalError, totalHits, elapsedTimeMicros, requestTime, onCancelSearch, defaultSearchFields = [], onSaveQuery, onLoadQuery, onShareQuery, externalQuery = '', selectedColumns = [], results = [], onExportCSV, onQueryChange, vrl, onVrlChange, vrlTime, vrlEnabled = false, filters = [], timeRange, onFiltersChange, onTimeRangeChange, onAnalyzePatterns, onRestoreHistoryState }) {
  const [query, setQuery] = useState('')

  // Query history management
  const [queryHistory, setQueryHistory] = useState([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [tempQuery, setTempQuery] = useState('')

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('queryHistory')
      if (savedHistory) {
        const parsed = JSON.parse(savedHistory)
        // Migrate old format (array of strings) to new format (array of objects)
        const migratedHistory = parsed.map(item => {
          if (typeof item === 'string') {
            return {
              query: item,
              filters: [],
              timeRange: null,
              vrl: '',
              histogramInterval: 'auto',
              selectedColumns: []
            }
          }
          return item
        })
        setQueryHistory(migratedHistory)
      }
    } catch (error) {
      console.error('Failed to load query history:', error)
    }
  }, [])

  // Update query when externalQuery changes (e.g., when loading a saved query)
  useEffect(() => {
    if (externalQuery !== undefined && externalQuery !== query) {
      setQuery(externalQuery)
    }
  }, [externalQuery])
  const [maxHits, setMaxHits] = useState(100)
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  const [suggestionType, setSuggestionType] = useState('field') // 'field' or 'value'
  const [currentField, setCurrentField] = useState('')
  const inputRef = useRef(null)
  const suggestionsRef = useRef(null)
  const infoIconRef = useRef(null)
  const [tooltipStyle, setTooltipStyle] = useState({})

  useEffect(() => {
    function handleClickOutside(event) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target) &&
        inputRef.current && !inputRef.current.contains(event.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const saveQueryToHistory = (queryText) => {
    if (!queryText.trim()) return

    // Create complete search state snapshot
    const searchState = {
      query: queryText,
      index: selectedIndex || '',
      filters: filters || [],
      timeRange: timeRange || null,
      vrl: vrl || '',
      histogramInterval: histogramInterval || 'auto',
      selectedColumns: selectedColumns || []
    }

    setQueryHistory(prevHistory => {
      // Don't add if it's the same as the last query (compare full state)
      if (prevHistory.length > 0) {
        const lastState = prevHistory[prevHistory.length - 1]
        if (JSON.stringify(lastState) === JSON.stringify(searchState)) {
          return prevHistory
        }
      }

      // Add to history, limit to last 50 queries
      const newHistory = [...prevHistory, searchState].slice(-50)

      // Save to localStorage
      try {
        localStorage.setItem('queryHistory', JSON.stringify(newHistory))
      } catch (error) {
        console.error('Failed to save query history:', error)
      }

      return newHistory
    })

    // Reset history navigation
    setHistoryIndex(-1)
    setTempQuery('')
  }

  const navigateHistory = (direction) => {
    if (queryHistory.length === 0) return

    // Starting from -1 (no navigation yet)
    // Left arrow (←) = -1 = go back to previous (most recent in history)
    // Right arrow (→) = +1 = go forward (newer, towards current)

    if (historyIndex === -1) {
      // Starting navigation - can only go backwards (to most recent)
      if (direction === -1) {
        // Going back to most recent query in history
        const currentState = {
          query,
          index: selectedIndex || '',
          filters: filters || [],
          timeRange: timeRange || null,
          vrl: vrl || '',
          histogramInterval: histogramInterval || 'auto',
          selectedColumns: selectedColumns || []
        }
        setTempQuery(currentState)

        const newIndex = queryHistory.length - 1
        const historicalState = queryHistory[newIndex]

        setQuery(historicalState.query)
        if (onRestoreHistoryState) onRestoreHistoryState(historicalState)

        setHistoryIndex(newIndex)
      }
      // Can't go forward from -1 (already at current)
      return
    }

    const newIndex = historyIndex + direction

    if (newIndex < 0) {
      // Can't go older than oldest
      return
    } else if (newIndex >= queryHistory.length) {
      // Going past newest - restore to current/temp
      if (tempQuery && typeof tempQuery === 'object') {
        setQuery(tempQuery.query)
        if (onRestoreHistoryState) onRestoreHistoryState(tempQuery)
      }
      setHistoryIndex(-1)
      return
    }

    // Update full search state from history
    const historicalState = queryHistory[newIndex]

    setQuery(historicalState.query)
    if (onRestoreHistoryState) onRestoreHistoryState(historicalState)

    setHistoryIndex(newIndex)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    saveQueryToHistory(query)
    onSearch(query, maxHits)
    setShowSuggestions(false)
  }

  const handleQueryChange = (e) => {
    const value = e.target.value
    setQuery(value)
    if (onQueryChange) onQueryChange(value)

    // Get cursor position to find the current word being typed
    const cursorPos = e.target.selectionStart
    const textBeforeCursor = value.substring(0, cursorPos)

    // Check if we're after a field: (typing a value)
    const valueMatch = textBeforeCursor.match(/([a-zA-Z_][a-zA-Z0-9_]*):([^"\s]*)$/)
    if (valueMatch && fields.includes(valueMatch[1])) {
      const fieldName = valueMatch[1]
      const partialValue = valueMatch[2]

      setSuggestionType('value')
      setCurrentField(fieldName)

      // Fetch field values from aggregation API
      if (onFetchFieldValues && selectedIndex) {
        onFetchFieldValues(fieldName, partialValue).then(values => {
          if (values && values.length > 0) {
            setSuggestions(values)
            setShowSuggestions(true)
            setSelectedSuggestionIndex(-1)
          } else {
            setShowSuggestions(false)
          }
        }).catch(() => {
          setShowSuggestions(false)
        })
      }
      return
    }

    // Otherwise, check for field name completion
    const fieldMatch = textBeforeCursor.match(/(?:^|\s|OR\s|AND\s)([a-zA-Z_][a-zA-Z0-9_]*)$/)

    if (fieldMatch && fieldMatch[1] && fields.length > 0) {
      const currentWord = fieldMatch[1]
      const filtered = fields.filter(field =>
        field.toLowerCase().startsWith(currentWord.toLowerCase())
      )

      if (filtered.length > 0 && currentWord.length > 0) {
        setSuggestionType('field')
        setSuggestions(filtered)
        setShowSuggestions(true)
        setSelectedSuggestionIndex(-1)
      } else {
        setShowSuggestions(false)
      }
    } else {
      setShowSuggestions(false)
    }
  }

  const insertSuggestion = (suggestion) => {
    const cursorPos = inputRef.current.selectionStart
    const textBeforeCursor = query.substring(0, cursorPos)
    const textAfterCursor = query.substring(cursorPos)

    if (suggestionType === 'value') {
      // Replace the current value with the suggestion
      const match = textBeforeCursor.match(/([a-zA-Z_][a-zA-Z0-9_]*):([^"\s]*)$/)
      if (match) {
        const prefix = textBeforeCursor.substring(0, match.index + match[1].length + 1)
        // Quote the value if it contains spaces or special characters (including JSON)
        const needsQuotes = /[\s:{}"\[\]]/.test(suggestion)
        // Escape any double quotes inside the value
        const escapedValue = suggestion.replace(/"/g, '\\"')
        const quotedValue = needsQuotes ? `"${escapedValue}"` : suggestion
        const newQuery = prefix + quotedValue + textAfterCursor
        setQuery(newQuery)
        if (onQueryChange) onQueryChange(newQuery)
        setShowSuggestions(false)

        // Set cursor position after the value
        setTimeout(() => {
          const newCursorPos = prefix.length + quotedValue.length
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos)
          inputRef.current.focus()
        }, 0)
      }
    } else {
      // Replace the current field name with the suggestion
      const match = textBeforeCursor.match(/(?:^|\s|OR\s|AND\s)([a-zA-Z_][a-zA-Z0-9_]*)$/)
      if (match) {
        const prefix = textBeforeCursor.substring(0, match.index + match[0].length - match[1].length)
        const newQuery = prefix + suggestion + ':' + textAfterCursor
        setQuery(newQuery)
        if (onQueryChange) onQueryChange(newQuery)
        setShowSuggestions(false)

        // Set cursor position after the colon
        setTimeout(() => {
          const newCursorPos = prefix.length + suggestion.length + 1
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos)
          inputRef.current.focus()
        }, 0)
      }
    }
  }

  const handleKeyDown = (e) => {
    // Handle history navigation with Up/Down arrows when suggestions are not shown
    if (!showSuggestions) {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        navigateHistory(1) // Up arrow = newer queries (towards most recent)
        return
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        navigateHistory(-1) // Down arrow = older queries (towards oldest)
        return
      } else if (e.key === 'Enter') {
        handleSubmit(e)
        return
      }
      return
    }

    // Handle suggestions navigation when suggestions are shown
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedSuggestionIndex(prev =>
        prev < suggestions.length - 1 ? prev + 1 : prev
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedSuggestionIndex >= 0) {
        insertSuggestion(suggestions[selectedSuggestionIndex])
      } else {
        handleSubmit(e)
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  const handleClear = () => {
    setQuery('')
    if (onQueryChange) onQueryChange('')
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  const [showVrlInput, setShowVrlInput] = useState(false)
  const [localVrl, setLocalVrl] = useState('')

  // Initialize local VRL when opening the input
  useEffect(() => {
    if (showVrlInput) {
      setLocalVrl(vrl || '')
    }
  }, [showVrlInput, vrl])

  const handleApplyVrl = () => {
    if (onVrlChange) {
      onVrlChange(localVrl)
    }
    setShowVrlInput(false)
  }

  const handleClearVrl = () => {
    setLocalVrl('')
    if (onVrlChange) {
      onVrlChange('')
    }
    setShowVrlInput(false)
  }

  return (
    <div className="search-section">
      <div className="search-bar">
        <div className="search-input-wrapper">
          <div className="history-navigation">
            <button
              type="button"
              className="history-nav-btn"
              onClick={() => navigateHistory(-1)}
              disabled={loading || queryHistory.length === 0 || historyIndex === 0}
              title="Previous query"
            >
              ◀
            </button>
            <button
              type="button"
              className="history-nav-btn"
              onClick={() => navigateHistory(1)}
              disabled={loading || queryHistory.length === 0 || historyIndex === -1}
              title="Next query"
            >
              ▶
            </button>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            placeholder=""
            className="search-input"
            disabled={loading}
          />
          <div className="search-actions">
            {vrlEnabled && (
              <button
                type="button"
                className={`query-action-btn function-btn ${vrl ? 'active' : ''} `}
                onClick={() => setShowVrlInput(!showVrlInput)}
                title={vrl ? "Edit VRL Function" : "Add VRL Function"}
                disabled={loading}
              >
                ƒ
              </button>
            )}
            <button
              type="button"
              className="query-action-btn load-btn"
              onClick={onLoadQuery}
              title="Load saved query"
              disabled={loading}
            >
              📂
            </button>
            <button
              type="button"
              className="query-action-btn save-btn"
              onClick={() => onSaveQuery(query)}
              title="Save current query"
              disabled={loading}
            >
              💾
            </button>
            <button
              type="button"
              className="query-action-btn share-btn"
              onClick={onShareQuery}
              title="Share query link"
              disabled={loading}
            >
              🔗
            </button>
            <button
              type="button"
              className="query-action-btn patterns-btn"
              onClick={onAnalyzePatterns}
              title="Analyze log patterns"
              disabled={loading || !selectedIndex}
            >
              ∿
            </button>
            {defaultSearchFields.length > 0 && (
              <div
                className="search-info-icon"
                onMouseEnter={() => setTooltipStyle({ display: 'block' })}
                onMouseLeave={() => setTooltipStyle({ display: 'none' })}
              >
                ℹ️
                <div className="search-info-tooltip" style={tooltipStyle}>
                  <div className="tooltip-title">Default Search Fields:</div>
                  <ul className="tooltip-fields-list">
                    {defaultSearchFields.map(field => (
                      <li key={field}>{field}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
          {query && (
            <button
              className="clear-search-button"
              onClick={handleClear}
              type="button"
              title="Clear search"
            >
              ×
            </button>
          )}
          {showSuggestions && suggestions.length > 0 && (
            <div ref={suggestionsRef} className="search-suggestions">
              {suggestions.map((suggestion, index) => (
                <div
                  key={suggestion}
                  className={`suggestion-item ${index === selectedSuggestionIndex ? 'selected' : ''}`}
                  onClick={() => insertSuggestion(suggestion)}
                  onMouseEnter={() => setSelectedSuggestionIndex(index)}
                  ref={index === selectedSuggestionIndex ? el => el?.scrollIntoView({ block: 'nearest' }) : null}
                >
                  {suggestion}
                </div>
              ))}
            </div>
          )}
        </div>
        {timeRangePicker}
        <button
          type="button"
          className={`search-button ${loading ? 'loading' : ''} `}
          onClick={loading ? onCancelSearch : handleSubmit}
        >
          {loading ? (
            <>
              <span className="loading-spinner"></span>
              Cancel
            </>
          ) : (
            'Search'
          )}
        </button>
      </div>

      {vrlEnabled && showVrlInput && (
        <div className="vrl-input-container">
          <div className="vrl-input-header">
            <span className="vrl-label">VRL Function</span>
            <a
              href="https://vector.dev/docs/reference/vrl/"
              target="_blank"
              rel="noopener noreferrer"
              className="vrl-docs-link"
            >
              Docs
            </a>
          </div>
          <textarea
            className="vrl-textarea"
            value={localVrl}
            onChange={(e) => setLocalVrl(e.target.value)}
            placeholder="Enter VRL code here..."
            rows={3}
          />
          <div className="vrl-actions">
            <button
              className="vrl-btn vrl-clear"
              onClick={handleClearVrl}
            >
              Clear
            </button>
            <button
              className="vrl-btn vrl-cancel"
              onClick={() => setShowVrlInput(false)}
            >
              Cancel
            </button>
            <button
              className="vrl-btn vrl-apply"
              onClick={handleApplyVrl}
            >
              Apply
            </button>
          </div>
        </div>
      )}

      <div className="search-options">
        <a
          href="https://quickwit.io/docs/main-branch/get-started/query-language-intro"
          target="_blank"
          rel="noopener noreferrer"
          className="query-docs-link"
          title="Open Quickwit query language documentation"
        >
          📖 Query Syntax
        </a>

        {(firstEventTime || lastEventTime) && (
          <>
            {firstEventTime && lastEventTime && (
              <>
                <span className="time-label">Earliest Bucket:</span>
                <span className="time-display">
                  {new Date(firstEventTime * 1000).toLocaleString()}
                </span>
                <span className="time-separator">→</span>
                <span className="time-label">Latest Bucket:</span>
                <span className="time-display">
                  {new Date(lastEventTime * 1000).toLocaleString()}
                </span>
                <label style={{ position: 'relative' }}>
                  Interval:
                  <select
                    value={histogramInterval}
                    onChange={(e) => onHistogramIntervalChange(e.target.value)}
                    disabled={loading}
                  >
                    <option value="auto">Auto</option>
                    <option value="1s">1 second</option>
                    <option value="10s">10 seconds</option>
                    <option value="30s">30 seconds</option>
                    <option value="1m">1 minute</option>
                    <option value="5m">5 minutes</option>
                    <option value="15m">15 minutes</option>
                    <option value="30m">30 minutes</option>
                    <option value="1h">1 hour</option>
                    <option value="6h">6 hours</option>
                    <option value="12h">12 hours</option>
                    <option value="1d">1 day</option>
                    <option value="7d">7 days</option>
                    <option value="30d">30 days</option>
                  </select>
                  {intervalError && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: '0',
                      marginTop: '5px',
                      background: '#ef4444',
                      color: 'white',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      whiteSpace: 'nowrap',
                      zIndex: 1000,
                      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                      animation: 'fadeIn 0.2s ease-out'
                    }}>
                      {intervalError}
                      <div style={{
                        position: 'absolute',
                        top: '-4px',
                        left: '20px',
                        width: '8px',
                        height: '8px',
                        background: '#ef4444',
                        transform: 'rotate(45deg)'
                      }}></div>
                    </div>
                  )}
                </label>
              </>
            )}
          </>
        )}
        {totalHits !== undefined && totalHits !== null && (
          <>
            <span
              className="total-hits-display"
              title={
                requestTime
                  ? [
                    elapsedTimeMicros && `Quickwit: ${(elapsedTimeMicros / 1000).toFixed(2)}ms`,
                    vrlTime && `VRL: ${(vrlTime / 1000).toFixed(2)}ms`,
                    `Total: ${requestTime.toFixed(2)}ms`
                  ]
                    .filter(Boolean)
                    .join(' | ')
                  : undefined
              }
            >
              {totalHits.toLocaleString()} hits
            </span>
            {selectedColumns.length > 0 && (
              <button
                className="export-csv-btn"
                onClick={() => onExportCSV && onExportCSV()}
                disabled={!results || results.length === 0}
                title="Export results to CSV"
              >
                📥 Export CSV
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default SearchBar
