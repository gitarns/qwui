import { useState, useEffect, useRef } from 'react'
import JSZip from 'jszip'
import './App.css'
import SearchBar from './components/SearchBar'
import FieldsSidebar from './components/FieldsSidebar'
import ResultsTable from './components/ResultsTable'
import TimeRangePicker from './components/TimeRangePicker'
import Histogram from './components/Histogram'
import GraphView from './components/GraphView'
import TraceView from './components/TraceView'
import SaveQueryModal from './components/SaveQueryModal'
import LoadQueryModal from './components/LoadQueryModal'
import ExportCSVModal from './components/ExportCSVModal'
import PatternsModal from './components/PatternsModal'
import ExportProgress from './components/ExportProgress'
import Login from './components/Login'



const QUICKWIT_URL = ''
const MAX_BATCH_SIZE = 10 // Maximum number of parallel aggregation requests
const SAVED_QUERIES_INDEX = import.meta.env.VITE_SAVED_QUERIES_INDEX || 'qwui'

function App() {
  const [indexes, setIndexes] = useState([])
  const [selectedIndex, setSelectedIndex] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [fields, setFields] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [abortController, setAbortController] = useState(null)
  const [currentQuery, setCurrentQuery] = useState('*')
  const [filters, setFilters] = useState([])
  const filtersRef = useRef([]) // Ref to hold current filters for immediate access
  const [timeRange, setTimeRange] = useState(null)
  const timeRangeRef = useRef(null) // Ref to hold current timeRange for immediate access
  const [intervalError, setIntervalError] = useState(null)
  const [lastUsedTimeRange, setLastUsedTimeRange] = useState(null) // Store actual resolved time range from last search
  const [timestampField, setTimestampField] = useState('timestamp')
  const [defaultSearchFields, setDefaultSearchFields] = useState([]) // Store default_search_fields from index config
  const [fieldCache, setFieldCache] = useState({}) // Cache discovered fields per index
  const [histogramData, setHistogramData] = useState(null)
  const [fieldAggregations, setFieldAggregations] = useState({}) // Store individual field aggregations
  const [startOffset, setStartOffset] = useState(0) // Pagination offset
  const [hasMoreResults, setHasMoreResults] = useState(false) // Track if more results are available
  const [loadingMore, setLoadingMore] = useState(false) // Track if loading more results
  const [requestTime, setRequestTime] = useState(null) // Track full request time in milliseconds
  const [firstEventTime, setFirstEventTime] = useState(null) // First event timestamp
  const [lastEventTime, setLastEventTime] = useState(null) // Last event timestamp
  const [histogramInterval, setHistogramInterval] = useState('auto') // auto, ms, s, m, h, d, w, M, y
  const [darkMode, setDarkMode] = useState(() => {
    // Initialize from localStorage, default to false if not set
    const saved = localStorage.getItem('darkMode')
    return saved === 'true'
  })
  const [editingFilter, setEditingFilter] = useState(null) // Track which filter is being edited
  const [editFilterData, setEditFilterData] = useState({ field: '', operator: 'is', value: '' })
  const [selectedColumns, setSelectedColumns] = useState([]) // Track selected field columns
  const [viewMode, setViewMode] = useState('logs') // 'logs', 'visualize', or 'traces'
  const [numericFields, setNumericFields] = useState([]) // Track numeric fields for visualization
  const [showSettings, setShowSettings] = useState(false) // Track settings modal visibility
  const [userPreferences, setUserPreferences] = useState(() => {
    // Initialize from localStorage
    const saved = localStorage.getItem('userPreferences')
    return saved ? JSON.parse(saved) : {
      defaultTab: 'table', // 'table' or 'json'
      fontSize: 13, // Font size in pixels (default 13px = 0.8125rem)
      jsonViewOptions: {
        collapsed: false,
        displayDataTypes: true,
        displayObjectSize: true,
        enableClipboard: true,
        iconStyle: 'circle', // 'circle' or 'triangle'
        themeLightMode: 'rjv-default',
        themeDarkMode: 'monokai'
      }
    }
  })
  const [savedQueries, setSavedQueries] = useState([]) // List of all saved queries
  const [currentQueryId, setCurrentQueryId] = useState(null) // Track loaded query ID
  const [currentQueryName, setCurrentQueryName] = useState(null) // Track loaded query name
  const [showSaveQueryModal, setShowSaveQueryModal] = useState(false)
  const [showLoadQueryModal, setShowLoadQueryModal] = useState(false)
  const [showExportCSVModal, setShowExportCSVModal] = useState(false)
  const [showPatternsModal, setShowPatternsModal] = useState(false)
  const [patterns, setPatterns] = useState([])
  const [patternsLoading, setPatternsLoading] = useState(false)
  const [patternsError, setPatternsError] = useState(null)
  const [patternsTotalLogs, setPatternsTotalLogs] = useState(0)
  const [patternsTotalClusters, setPatternsTotalClusters] = useState(0)
  const [patternsField, setPatternsField] = useState('_all')
  const [exportModalData, setExportModalData] = useState(null)
  const [exportProgress, setExportProgress] = useState(null) // Track background export progress
  const [lastSearchQuery, setLastSearchQuery] = useState('') // Track search bar text
  const [currentSearchBarQuery, setCurrentSearchBarQuery] = useState('') // Track current search bar input
  const currentSearchBarQueryRef = useRef('') // Ref for immediate access
  const hasLoadedFromURL = useRef(false) // Track if we've already loaded from URL
  const [sharedQueryLoaded, setSharedQueryLoaded] = useState(false) // Track if shared query was just loaded
  const [vrl, setVrl] = useState('') // VRL code for search transformation
  const [vrlTime, setVrlTime] = useState(null) // Execution time of VRL script
  const [searchTrigger, setSearchTrigger] = useState(0) // Trigger counter to force GraphView refresh

  // Auth state
  const [authStatus, setAuthStatus] = useState({
    loading: true,
    oidcEnabled: false,
    authenticated: false,
    user: null,
    vrlEnabled: false
  })

  // Save userPreferences to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('userPreferences', JSON.stringify(userPreferences))
  }, [userPreferences])

  // Fetch auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/status')
        if (response.ok) {
          const data = await response.json()
          setAuthStatus({
            loading: false,
            oidcEnabled: data.oidc_enabled,
            authenticated: data.authenticated,
            user: data.user,
            vrlEnabled: data.features?.vrl ?? false
          })
        } else {
          // Fallback if endpoint fails (e.g. older backend)
          setAuthStatus(prev => ({ ...prev, loading: false }))
        }
      } catch (err) {
        console.error('Failed to check auth status:', err)
        setAuthStatus(prev => ({ ...prev, loading: false }))
      }
    }
    checkAuth()
  }, [])

  // Fetch available indexes on mount (only if authenticated)
  useEffect(() => {
    if (!authStatus.loading && (!authStatus.oidcEnabled || authStatus.authenticated)) {
      fetchIndexes()
    }
  }, [authStatus.loading, authStatus.oidcEnabled, authStatus.authenticated])

  // Load shared query from URL after indexes are loaded (only once)
  useEffect(() => {
    if (indexes.length > 0 && !hasLoadedFromURL.current) {
      hasLoadedFromURL.current = true
      const wasLoaded = loadQueryFromURL()
      // If no shared query was loaded, allow auto-trigger to run
      if (!wasLoaded) {
        hasLoadedFromURL.current = false
      }
    }
  }, [indexes])

  // Trigger search when shared query is loaded
  useEffect(() => {
    if (sharedQueryLoaded && selectedIndex && timeRange) {
      executeSearch(100)
      setSharedQueryLoaded(false) // Reset flag
    }
  }, [sharedQueryLoaded, selectedIndex, timeRange, currentQuery])

  // Auto-trigger search on page load when index and time range are ready
  // Skip if a shared query was loaded (it will trigger its own search)
  useEffect(() => {
    if (selectedIndex && selectedIndex.trim() !== '' && timeRange && !searchResults && indexes.length > 0 && !sharedQueryLoaded) {
      // Trigger initial search with current query (defaults to '*' if not set)
      executeSearch(100)
    }
  }, [selectedIndex, timeRange, indexes])

  // Apply dark mode class to document and save to localStorage
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark-mode')
      localStorage.setItem('darkMode', 'true')
    } else {
      document.documentElement.classList.remove('dark-mode')
      localStorage.setItem('darkMode', 'false')
    }
  }, [darkMode])

  // Save user preferences to localStorage
  useEffect(() => {
    localStorage.setItem('userPreferences', JSON.stringify(userPreferences))
  }, [userPreferences])

  // Sync refs with state
  useEffect(() => {
    filtersRef.current = filters
  }, [filters])

  useEffect(() => {
    timeRangeRef.current = timeRange
  }, [timeRange])

  useEffect(() => {
    currentSearchBarQueryRef.current = currentSearchBarQuery
  }, [currentSearchBarQuery])

  // Refetch histogram when ONLY interval changes (search already fetches it in parallel)
  useEffect(() => {
    const refetchHistogram = async () => {
      // Don't fetch if loading or if we're paging (offset > 0)
      if (loading || loadingMore || startOffset > 0) {
        return
      }

      if (!timeRange || !selectedIndex || !searchResults) {
        return
      }

      if (searchResults.num_hits === 0) {
        setHistogramData(null)
        return
      }

      try {
        const now = Math.floor(Date.now() / 1000)
        const endTimestamp = timeRange.to !== null ? timeRange.to : now

        const fixedInterval = computeFixedInterval(
          timeRange.from * 1000,
          endTimestamp * 1000,
          50,
          histogramInterval
        )

        const histogramAggsBody = {
          query: buildQueryWithFilters(currentQuery) || '*',
          max_hits: 0,
          aggs: {
            _histogram: {
              histogram: {
                field: timestampField,
                interval: fixedInterval,
                min_doc_count: 0
              }
            }
          }
        }

        histogramAggsBody.start_timestamp = timeRange.from
        if (timeRange.to !== null) {
          histogramAggsBody.end_timestamp = timeRange.to
        }

        const histogramResponse = await fetch(`${QUICKWIT_URL}/quickwit/api/v1/${selectedIndex}/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify(histogramAggsBody)
        })

        if (histogramResponse.ok) {
          const histogramData = await histogramResponse.json()
          if (histogramData.aggregations?._histogram) {
            const histogram = histogramData.aggregations._histogram
            setHistogramData(histogram)

            // Extract first and last event times from histogram buckets
            if (histogram.buckets && histogram.buckets.length > 0) {
              const firstBucket = histogram.buckets[0]
              const lastBucket = histogram.buckets[histogram.buckets.length - 1]
              setFirstEventTime(firstBucket.key / 1000) // Convert ms to seconds
              setLastEventTime(lastBucket.key / 1000) // Convert ms to seconds
            }
          }
        }
      } catch (err) {
        console.warn('Could not refetch histogram:', err)
      }
    }

    refetchHistogram()
  }, [histogramInterval]) // Only re-fetch when interval changes, not on every search result

  // Query management functions
  const generateQueryId = () => crypto.randomUUID()

  const captureCurrentQuery = (searchBarQuery = null) => ({
    index: selectedIndex,
    search_query: searchBarQuery !== null ? searchBarQuery : (lastSearchQuery || currentSearchBarQuery),
    filters: filters,
    time_range: timeRange,
    selected_columns: selectedColumns,
    histogram_interval: histogramInterval
  })

  const fetchSavedQueries = async () => {
    try {
      const response = await fetch(
        `${QUICKWIT_URL}/quickwit/api/v1/${SAVED_QUERIES_INDEX}/search?query=type:query&max_hits=1000&sort_by=-timestamp`,
        {
          headers: {
            'Accept-Encoding': 'gzip, deflate',
            'Access-Control-Allow-Origin': '*'
          },
        }
      )

      if (!response.ok) {
        console.error('Failed to fetch saved queries')
        return
      }

      const data = await response.json()

      // Extract documents from hits
      const allDocs = (data.hits || []).map(hit => {
        return hit._source || hit
      })

      // Group by id and get latest version
      const queryMap = {}
      allDocs.forEach(doc => {
        if (!queryMap[doc.id] || doc.timestamp > queryMap[doc.id].timestamp) {
          queryMap[doc.id] = doc
        }
      })

      // Filter out deleted queries (status: false)
      const activeQueries = Object.values(queryMap)
        .filter(doc => doc.status === true)
        .sort((a, b) => b.modified_at - a.modified_at)

      setSavedQueries(activeQueries)
    } catch (err) {
      console.error('Error fetching saved queries:', err)
    }
  }

  const saveQuery = async (name) => {
    try {
      const id = generateQueryId()
      const now = Math.floor(Date.now() / 1000)
      const doc = {
        id,
        type: 'query',
        status: true,
        name,
        timestamp: now,
        created_at: now,
        modified_at: now,
        query: captureCurrentQuery()
      }

      const response = await fetch(`${QUICKWIT_URL}/quickwit/api/v1/${SAVED_QUERIES_INDEX}/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(doc)
      })

      if (!response.ok) throw new Error('Failed to save query')

      setCurrentQueryId(id)
      setCurrentQueryName(name)
      await fetchSavedQueries()
      return true
    } catch (err) {
      console.error('Error saving query:', err)
      setError('Failed to save query')
      return false
    }
  }

  const updateQuery = async (id, name, created_at) => {
    try {
      // Insert updated version with status: true
      const now = Math.floor(Date.now() / 1000)
      const doc = {
        id,
        type: 'query',
        status: true,
        name,
        timestamp: now,
        created_at,
        modified_at: now,
        query: captureCurrentQuery()
      }

      const response = await fetch(`${QUICKWIT_URL}/quickwit/api/v1/${SAVED_QUERIES_INDEX}/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(doc)
      })

      if (!response.ok) throw new Error('Failed to update query')

      await fetchSavedQueries()
      return true
    } catch (err) {
      console.error('Error updating query:', err)
      setError('Failed to update query')
      return false
    }
  }

  // Helper function to recompute time range from label
  const recomputeTimeRangeFromLabel = (timeRange) => {
    if (!timeRange || !timeRange.label) return timeRange

    // Check if it's a relative range like "Last X minutes/hours/days"
    const match = timeRange.label.match(/^Last (\d+) (.+)$/)
    if (match) {
      const value = parseInt(match[1])
      let unit = match[2]

      // Compute milliseconds based on unit
      let ms = 0
      if (unit.includes('second')) ms = value * 1000
      else if (unit.includes('minute')) ms = value * 60 * 1000
      else if (unit.includes('hour')) ms = value * 60 * 60 * 1000
      else if (unit.includes('day')) ms = value * 24 * 60 * 60 * 1000
      else if (unit.includes('week')) ms = value * 7 * 24 * 60 * 60 * 1000
      else if (unit.includes('month')) ms = value * 30 * 24 * 60 * 60 * 1000
      else if (unit.includes('year')) ms = value * 365 * 24 * 60 * 60 * 1000
      else return timeRange // Unknown unit, return as-is

      const now = Math.floor(Date.now() / 1000)
      const from = now - Math.floor(ms / 1000)

      return {
        from,
        to: now,
        label: timeRange.label,
        fromIsNow: false,
        toIsNow: true
      }
    }

    // Not a relative range, return as-is
    return timeRange
  }

  const loadQuery = (savedQuery) => {
    setSelectedIndex(savedQuery.query.index)
    setLastSearchQuery(savedQuery.query.search_query)
    setCurrentSearchBarQuery(savedQuery.query.search_query)
    setFilters(savedQuery.query.filters)

    // Recompute time range if it's a relative range
    const timeRange = recomputeTimeRangeFromLabel(savedQuery.query.time_range)
    setTimeRange(timeRange ? { ...timeRange } : null)

    if (savedQuery.query.selected_columns) setSelectedColumns(savedQuery.query.selected_columns)
    if (savedQuery.query.histogram_interval) setHistogramInterval(savedQuery.query.histogram_interval)
    setCurrentQueryId(savedQuery.id)
    setCurrentQueryName(savedQuery.name)

    // Trigger search with the loaded query
    // Use executeSearch directly
    // We need to update refs first because executeSearch reads from them
    currentSearchBarQueryRef.current = savedQuery.query.search_query
    filtersRef.current = savedQuery.query.filters
    timeRangeRef.current = timeRange

    executeSearch(100)
  }

  const deleteQuery = async (id) => {
    try {
      // Insert a new document with status: false to mark as deleted
      const now = Math.floor(Date.now() / 1000)
      const doc = {
        id,
        type: 'query',
        status: false,  // Mark as deleted
        timestamp: now
      }

      const response = await fetch(`${QUICKWIT_URL}/quickwit/api/v1/${SAVED_QUERIES_INDEX}/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(doc)
      })

      if (!response.ok) throw new Error('Failed to delete query')

      if (currentQueryId === id) {
        setCurrentQueryId(null)
        setCurrentQueryName(null)
      }

      await fetchSavedQueries()
      return true
    } catch (err) {
      console.error('Error deleting query:', err)
      setError('Failed to delete query')
      return false
    }
  }

  const fetchIndexes = async () => {
    try {
      const response = await fetch(`${QUICKWIT_URL}/quickwit/api/v1/indexes`, {
        headers: {
          'Accept-Encoding': 'gzip, deflate',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache'
        },
      })
      const data = await response.json()
      setIndexes(data)
      if (data.length > 0) {
        // Check if there's a saved default index
        const savedDefaultIndex = localStorage.getItem('defaultIndex')
        let indexToSelect = null

        if (savedDefaultIndex) {
          // Try to find the saved default index
          indexToSelect = data.find(idx => idx.index_config.index_id === savedDefaultIndex)
        }

        // If no saved default or it doesn't exist anymore, use first index in alphabetical order
        if (!indexToSelect) {
          const sortedIndexes = [...data].sort((a, b) =>
            a.index_config.index_id.localeCompare(b.index_config.index_id)
          )
          indexToSelect = sortedIndexes[0]
        }

        setSelectedIndex(indexToSelect.index_config.index_id)

        // Extract timestamp field from index config
        const tsField = indexToSelect.index_config?.doc_mapping?.timestamp_field ||
          indexToSelect.index_config?.indexing_settings?.timestamp_field ||
          'timestamp'
        setTimestampField(tsField)

        // Extract default_search_fields from index config
        const searchFields = indexToSelect.index_config?.search_settings?.default_search_fields || []
        setDefaultSearchFields(searchFields)

      }
    } catch (err) {
      setError('Failed to fetch indexes: ' + err.message)
    }
  }



  const handleIndexChange = (e) => {
    const newIndexId = e.target.value
    setSelectedIndex(newIndexId)

    const newFirstIndex = newIndexId.split(',')[0]
    const prevFirstIndex = selectedIndex.split(',')[0]
    const primaryIndexChanged = newFirstIndex !== prevFirstIndex

    // Only reset search state when the primary (first) index changes
    if (primaryIndexChanged) {
      setCurrentQuery('*')
      setLastSearchQuery('')
      setCurrentSearchBarQuery('')
      setFilters([])
      setSearchResults(null)
      setFieldAggregations({})
      setHistogramData(null)

      const now = Date.now()
      const from = now - 15 * 60 * 1000
      setTimeRange({
        from: Math.floor(from / 1000),
        to: Math.floor(now / 1000),
        label: 'Last 15 minutes'
      })
    }

    // Use the first selected index for metadata (timestamp field, search fields)
    const newIndex = indexes.find(idx => idx.index_config.index_id === newFirstIndex)
    if (newIndex && primaryIndexChanged) {
      const tsField = newIndex.index_config?.doc_mapping?.timestamp_field ||
        newIndex.index_config?.indexing_settings?.timestamp_field ||
        'timestamp'
      setTimestampField(tsField)

      const searchFields = newIndex.index_config?.search_settings?.default_search_fields || []
      setDefaultSearchFields(searchFields)
    }
  }

  const onIntervalChange = (val) => {
    console.log('Interval changed', val)

    if (!timeRange) {
      setHistogramInterval(val)
      return
    }

    const fromMs = timeRange.from * 1000
    const toMs = timeRange.to * 1000
    const interval = computeFixedInterval(fromMs, toMs, 50, val)
    const numBuckets = (toMs - fromMs) / interval
    console.log('numBuckets', numBuckets)
    if (numBuckets >= 65000) {
      // reject this selected interval
      setIntervalError('The Interval would create too many buckets, rejected')
      setTimeout(() => setIntervalError(null), 3000)
    } else {
      setHistogramInterval(val)
    }
  }


  // Compute Quickwit interval string
  const computeFixedInterval = (fromMs, toMs, numBuckets = 50, override = 'auto') => {
    // If user selected a specific interval, use it directly
    if (override !== 'auto') {
      // If override is a string (e.g. "1h"), convert to ms, otherwise return as is
      if (typeof override === 'string') {
        const unit = override.slice(-1);
        const value = parseInt(override.slice(0, -1));
        switch (unit) {
          case 's': return value * 1000;
          case 'm': return value * 60 * 1000;
          case 'h': return value * 60 * 60 * 1000;
          case 'd': return value * 24 * 60 * 60 * 1000;
          case 'w': return value * 7 * 24 * 60 * 60 * 1000;
          case 'M': return value * 30 * 24 * 60 * 60 * 1000; // Approx
          case 'y': return value * 365 * 24 * 60 * 60 * 1000; // Approx
          default: return 60000; // Default 1m
        }
      }
      return override
    }

    const rangeSeconds = (toMs - fromMs)
    return rangeSeconds / 50
  };

  // URL-based query sharing functions
  const encodeQueryToURL = () => {
    const encoded = encodeURIComponent(JSON.stringify(captureCurrentQuery()))
    const shareUrl = `${window.location.origin}${window.location.pathname}?q=${encoded}`
    return shareUrl
  }

  const handleShareQuery = async () => {
    try {
      const shareUrl = encodeQueryToURL()
      await navigator.clipboard.writeText(shareUrl)

      // Show success notification
      const notification = document.createElement('div')
      notification.textContent = '✓ Query link copied to clipboard!'
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        font-weight: 600;
        font-size: 14px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        animation: slideIn 0.3s ease-out;
      `
      document.body.appendChild(notification)

      setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out'
        setTimeout(() => notification.remove(), 300)
      }, 3000)
    } catch (error) {
      console.error('Failed to copy to clipboard', error)
      alert('Failed to copy link to clipboard')
    }
  }

  const loadQueryFromURL = () => {
    const urlParams = new URLSearchParams(window.location.search)
    const sharedQuery = urlParams.get('q')

    if (sharedQuery) {
      try {
        const queryData = JSON.parse(decodeURIComponent(sharedQuery))
        // Restore query state
        if (queryData.index) {
          setSelectedIndex(queryData.index)
          // Also restore timestampField from the index config
          const firstIndex = queryData.index.split(',')[0]
          const indexObj = indexes.find(idx => idx.index_config.index_id === firstIndex)
          if (indexObj) {
            const tsField = indexObj.index_config?.doc_mapping?.timestamp_field ||
              indexObj.index_config?.indexing_settings?.timestamp_field ||
              'timestamp'
            setTimestampField(tsField)
          }
        }
        if (queryData.search_query !== undefined) {
          setCurrentSearchBarQuery(queryData.search_query)
          currentSearchBarQueryRef.current = queryData.search_query // Update ref immediately
          setLastSearchQuery(queryData.search_query)
          setCurrentQuery(queryData.search_query)
        }
        if (queryData.filters) {
          setFilters(queryData.filters)
          filtersRef.current = queryData.filters // Update ref immediately
        }
        if (queryData.time_range) {
          // Recompute time range if it's a relative range
          const timeRange = recomputeTimeRangeFromLabel(queryData.time_range)
          setTimeRange({ ...timeRange })
          timeRangeRef.current = timeRange // Update ref immediately
        }
        if (queryData.selected_columns) {
          setSelectedColumns(queryData.selected_columns)
        }
        if (queryData.histogram_interval) {
          setHistogramInterval(queryData.histogram_interval)
        }

        // Clear URL parameter after loading
        window.history.replaceState({}, '', window.location.pathname)

        // Show notification
        const notification = document.createElement('div')
        notification.textContent = '✓ Shared query loaded!'
        notification.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: #667eea;
          color: white;
          padding: 12px 20px;
          border-radius: 6px;
          font-weight: 600;
          font-size: 14px;
          z-index: 10000;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          animation: slideIn 0.3s ease-out;
        `
        document.body.appendChild(notification)

        setTimeout(() => {
          notification.style.animation = 'slideOut 0.3s ease-out'
          setTimeout(() => notification.remove(), 300)
        }, 3000)

        // Signal that shared query was loaded
        setSharedQueryLoaded(true)

        return true
      } catch (error) {
        console.error('Failed to load shared query', error)
        return false
      }
    }
    return false
  }

  const resolveTimeRange = () => {
    if (!timeRange || !timeRange.from) return {}
    const now = Date.now()
    let start, end
    if (timeRange.fromIsRelative && timeRange.toIsNow) {
      start = Math.floor((now - timeRange.from.value * getMillisecondsForUnit(timeRange.from.unit)) / 1000)
      end = Math.floor(now / 1000)
    } else {
      start = typeof timeRange.from === 'number' ? timeRange.from : Math.floor(new Date(timeRange.from).getTime() / 1000)
      end = timeRange.toIsNow ? Math.floor(now / 1000) : (typeof timeRange.to === 'number' ? timeRange.to : Math.floor(new Date(timeRange.to).getTime() / 1000))
    }
    return { start_timestamp: start, end_timestamp: end }
  }

  const handleAnalyzePatterns = async (fieldOverride) => {
    const field = fieldOverride !== undefined ? fieldOverride : patternsField
    setShowPatternsModal(true)
    setPatternsLoading(true)
    setPatternsError(null)
    setPatterns([])
    try {
      const body = {
        index: selectedIndex,
        query: buildQueryWithFilters(currentQuery) || '*',
        field,
        top_n: 10,
        ...resolveTimeRange(),
      }
      const resp = await fetch('/api/patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(text || resp.statusText)
      }
      const data = await resp.json()
      setPatterns(data.patterns || [])
      setPatternsTotalLogs(data.total_logs || 0)
      setPatternsTotalClusters(data.total_clusters || 0)
    } catch (e) {
      setPatternsError(e.message)
    } finally {
      setPatternsLoading(false)
    }
  }

  const handlePatternsFieldChange = (newField) => {
    setPatternsField(newField)
    handleAnalyzePatterns(newField)
  }

  const handleApplyPattern = (template) => {
    const query = template.replace(/<\*>/g, '*')
    setCurrentSearchBarQuery(query)
    currentSearchBarQueryRef.current = query
    setShowPatternsModal(false)
  }

  // CSV Export with size estimation and gzip compression
  const handleExportCSV = async () => {
    if (!searchResults || !searchResults.hits || searchResults.hits.length === 0) {
      alert('No results to export')
      return
    }

    const totalHits = searchResults.num_hits
    const currentHits = searchResults.hits.length
    const maxExportLimit = 10000
    const exportCount = Math.min(totalHits, maxExportLimit)

    // Calculate size estimation from current sample
    // Note: Quickwit returns full JSON documents regardless of search_field parameter
    const sampleCSV = convertToCSV(searchResults.hits, selectedColumns)
    const sampleCSVSize = new Blob([sampleCSV]).size

    // Calculate actual JSON payload size from Quickwit
    // Use the full searchResults object which includes metadata (num_hits, elapsed_time_micros, etc.)
    const sampleResponseJSON = JSON.stringify(searchResults)
    const sampleResponseSize = new Blob([sampleResponseJSON]).size

    // Calculate per-hit overhead: metadata + JSON formatting overhead
    const hitsOnlyJSON = JSON.stringify(searchResults.hits)
    const hitsOnlySize = new Blob([hitsOnlyJSON]).size
    const metadataOverhead = sampleResponseSize - hitsOnlySize

    const sampleCompressed = await compressData(sampleCSV)
    const sampleCompressedSize = sampleCompressed.size

    // Size estimations
    const estimatedCSVSize = Math.ceil((exportCount / currentHits) * sampleCSVSize)

    // Estimate download size accounting for metadata overhead
    const perHitSize = hitsOnlySize / currentHits
    const estimatedDownloadSize = Math.ceil(metadataOverhead + (perHitSize * exportCount))

    const compressionRatio = sampleCompressedSize / sampleCSVSize
    const estimatedCompressedSize = Math.ceil(estimatedCSVSize * compressionRatio)

    // Show modal with export details
    setExportModalData({
      totalHits,
      exportCount,
      maxExportLimit,
      estimatedCompressedSize: estimatedCompressedSize,
      estimatedUncompressedSize: estimatedCSVSize,
      estimatedDownloadSize: estimatedDownloadSize,
      compressionRatio
    })
    setShowExportCSVModal(true)
  }

  const confirmExportCSV = () => {
    setShowExportCSVModal(false)

    if (!exportModalData) {
      console.error('No export modal data available')
      return
    }

    // Start export in background (non-blocking)
    const exportId = Date.now()
    setExportProgress({
      id: exportId,
      status: 'preparing',
      message: 'Preparing export...',
      progress: 0
    })

      // Run export asynchronously without blocking UI
      ; (async () => {
        try {
          // Build the search query - use '*' if empty
          const baseQuery = lastSearchQuery.trim() === '' ? '*' : lastSearchQuery
          const fullQuery = buildQueryWithFilters(baseQuery)

          // Build the export request
          const exportRequest = {
            index: selectedIndex,
            query: fullQuery || '*',
            columns: selectedColumns,
            max_docs: exportModalData.exportCount,
            timestamp_field: timestampField || 'timestamp'
          }

          // Add time range if present
          // Add time range if present
          if (timeRange.from && timeRange.to) {
            if (timeRange.fromIsRelative && timeRange.toIsNow) {
              const now = Date.now()
              const fromMs = now - (timeRange.from.value * getMillisecondsForUnit(timeRange.from.unit))
              exportRequest.start_timestamp = Math.floor(fromMs / 1000)
              exportRequest.end_timestamp = Math.floor(now / 1000)
            } else {
              // Handle absolute ranges or mixed

              // Start timestamp
              if (typeof timeRange.from === 'number') {
                // Already in seconds
                exportRequest.start_timestamp = timeRange.from
              } else {
                // Date string or object
                exportRequest.start_timestamp = Math.floor(new Date(timeRange.from).getTime() / 1000)
              }

              // End timestamp
              if (timeRange.toIsNow) {
                exportRequest.end_timestamp = Math.floor(Date.now() / 1000)
              } else if (typeof timeRange.to === 'number') {
                exportRequest.end_timestamp = timeRange.to
              } else {
                exportRequest.end_timestamp = Math.floor(new Date(timeRange.to).getTime() / 1000)
              }
            }
          }

          setExportProgress({
            id: exportId,
            status: 'downloading',
            message: 'Downloading from server...',
            progress: 50
          })

          // Call Go backend to generate and stream CSV
          const response = await fetch('/api/export/csv', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(exportRequest)
          })

          if (!response.ok) {
            throw new Error(`Export failed: ${response.statusText}`)
          }

          // Get the blob from the response
          const blob = await response.blob()

          // Extract filename from Content-Disposition header if present
          const contentDisposition = response.headers.get('Content-Disposition')
          let filename = `quickwit-export-${selectedIndex}.csv.gz`
          if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/)
            if (filenameMatch) {
              filename = filenameMatch[1]
            }
          }

          // Download the file
          downloadFile(blob, filename)

          // Show success
          setExportProgress({
            id: exportId,
            status: 'complete',
            message: `Export complete (${formatSize(blob.size)})`,
            progress: 100
          })

          // Clear progress after 5 seconds
          setTimeout(() => {
            setExportProgress(prev => prev?.id === exportId ? null : prev)
          }, 5000)

        } catch (error) {
          console.error('Export failed:', error)
          setExportProgress({
            id: exportId,
            status: 'error',
            message: `Export failed: ${error.message}`,
            progress: 0
          })

          // Clear error after 10 seconds
          setTimeout(() => {
            setExportProgress(prev => prev?.id === exportId ? null : prev)
          }, 10000)
        }
      })()
  }

  const getMillisecondsForUnit = (unit) => {
    switch (unit) {
      case 'seconds': return 1000
      case 'minutes': return 60 * 1000
      case 'hours': return 60 * 60 * 1000
      case 'days': return 24 * 60 * 60 * 1000
      case 'weeks': return 7 * 24 * 60 * 60 * 1000
      case 'months': return 30 * 24 * 60 * 60 * 1000
      case 'years': return 365 * 24 * 60 * 60 * 1000
      default: return 0
    }
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  // Download file helper
  const downloadFile = (blob, filename) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // CSV helper functions (used for size estimation in export modal)
  // Actual CSV generation is handled by Go backend

  const compressData = async (text) => {
    // Create a new JSZip instance
    const zip = new JSZip()

    // Add the CSV content to the zip with a filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    const filename = `quickwit-export-${selectedIndex}-${timestamp}.csv`
    zip.file(filename, text)

    // Generate the zip file as a blob
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 } // Maximum compression
    })

    return zipBlob
  }

  const convertToCSV = (data, columns, includeTimestamp = true) => {
    if (data.length === 0) return ''

    // Build fields list: timestamp field + selected columns
    let fields = []
    if (includeTimestamp) {
      fields.push(timestampField)
    }
    if (columns.length > 0) {
      // Add selected columns, avoiding duplicates with timestamp
      fields.push(...columns.filter(col => col !== timestampField))
    } else {
      // If no columns selected, use all fields except timestamp (already added)
      const allFields = Object.keys(data[0] || {})
      fields.push(...allFields.filter(col => col !== timestampField))
    }

    // Create header row with actual field names
    const header = fields.map(field => escapeCSVField(field)).join(',')

    // Create data rows
    const rows = data.map(row => {
      return fields.map(field => {
        const value = row[field]
        return escapeCSVField(formatCSVValue(value))
      }).join(',')
    })

    return [header, ...rows].join('\n')
  }

  const formatCSVValue = (value) => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  const escapeCSVField = (field) => {
    const stringValue = String(field)
    // If contains comma, newline, or quote, wrap in quotes and escape internal quotes
    if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
      return `"${stringValue.replace(/"/g, '""')}"`
    }
    return stringValue
  }

  // Escape special characters in query values
  // Special characters that need escaping: + , ^ ` : { } " [ ] ( ) ~ ! \
  const escapeQueryValue = (value) => {
    if (typeof value !== 'string') {
      value = String(value)
    }

    // Escape quotes and double quotes only
    const escaped = value
      .replace(/\\/g, '\\\\')    // \ -> \\
      .replace(/"/g, '\\"')      // " -> \"
      .replace(/'/g, "\\'")      // ' -> \'

    return escaped
  }

  // No escaping - return query as-is
  const escapeSearchQuery = (query) => {
    return query
  }

  const buildQueryWithFilters = (baseQuery, filtersToUse = filtersRef.current) => {
    const clauses = []

    // Escape the base query
    const escapedBaseQuery = escapeSearchQuery(baseQuery)

    // Add field filters (skip disabled ones)
    if (filtersToUse.length > 0) {
      const filterClauses = filtersToUse
        .filter(f => !f.disabled) // Skip disabled filters
        .map(f => {
          const escapedValue = escapeQueryValue(f.value)
          if (f.type === 'include') {
            return `${f.field}:${escapedValue}`
          } else if (f.type === 'exclude') {
            // For "is not" filters, ensure field exists with field:* AND NOT field:value
            return `(${f.field}:* AND NOT ${f.field}:${escapedValue})`
          } else if (f.type === 'exists') {
            return `${f.field}:*`
          } else if (f.type === 'not_exists') {
            return `NOT ${f.field}:*`
          } else {
            // Fallback for backwards compatibility
            return `(${f.field}:* AND NOT ${f.field}:${escapedValue})`
          }
        })
      clauses.push(...filterClauses)
    }

    if (clauses.length === 0) return escapedBaseQuery

    const filterQuery = clauses.join(' AND ')

    // If base query is empty or just *, return only the filter query
    if (!baseQuery || baseQuery.trim() === '' || baseQuery === '*') {
      return filterQuery
    }

    return `(${escapedBaseQuery}) AND ${filterQuery}`
  }



  const handleFilterChange = (field, value, type) => {
    // For exists/not_exists filters, check only by field and type
    // For include/exclude filters, check by field and value
    let existingFilterIndex = -1

    if (type === 'exists' || type === 'not_exists') {
      // Check if a filter with the same field and type (exists/not_exists) already exists
      existingFilterIndex = filters.findIndex(f =>
        f.field === field && (f.type === 'exists' || f.type === 'not_exists')
      )
    } else {
      // Check if a filter with the same field and value already exists
      existingFilterIndex = filters.findIndex(f =>
        f.field === field && f.value === value
      )
    }

    if (existingFilterIndex !== -1) {
      // Update existing filter type instead of adding a duplicate
      const updatedFilters = [...filters]
      updatedFilters[existingFilterIndex].type = type
      updatedFilters[existingFilterIndex].disabled = false // Re-enable if it was disabled
      if (type === 'exists' || type === 'not_exists') {
        updatedFilters[existingFilterIndex].value = null // Clear value for exists/not_exists
      } else {
        updatedFilters[existingFilterIndex].value = value
      }
      setFilters(updatedFilters)
      filtersRef.current = updatedFilters
    } else {
      // Add new filter
      const newFilter = {
        field,
        value: (type === 'exists' || type === 'not_exists') ? null : value,
        type
      }
      const updatedFilters = [...filters, newFilter]
      setFilters(updatedFilters)
      filtersRef.current = updatedFilters
    }

    // Clear field aggregations since query changed
    setFieldAggregations({})
    executeSearch(100)
  }

  const removeFilter = (index) => {
    const updatedFilters = [...filters]
    updatedFilters.splice(index, 1)
    setFilters(updatedFilters)
    filtersRef.current = updatedFilters // Update ref immediately

    // Re-run search without this filter
    // Clear field aggregations since query changed
    setFieldAggregations({})
    executeSearch(100)
  }

  const toggleFilterDisabled = (index) => {
    const updatedFilters = [...filters]
    updatedFilters[index].disabled = !updatedFilters[index].disabled
    setFilters(updatedFilters)
    filtersRef.current = updatedFilters // Update ref immediately

    // Re-run search with toggled filter
    setFieldAggregations({})
    executeSearch(100)
  }

  const invertFilterType = (index) => {
    const updatedFilters = [...filters]
    const currentType = updatedFilters[index].type

    // Invert the filter type
    if (currentType === 'include') {
      updatedFilters[index].type = 'exclude'
    } else if (currentType === 'exclude') {
      updatedFilters[index].type = 'include'
    } else if (currentType === 'exists') {
      updatedFilters[index].type = 'not_exists'
    } else if (currentType === 'not_exists') {
      updatedFilters[index].type = 'exists'
    }

    setFilters(updatedFilters)
    filtersRef.current = updatedFilters // Update ref immediately

    // Re-run search with inverted filter
    setFieldAggregations({})
    executeSearch(100)
  }

  const toggleFilterType = (index) => {
    const updatedFilters = [...filters]
    updatedFilters[index].type = updatedFilters[index].type === 'include' ? 'exclude' : 'include'
    setFilters(updatedFilters)
    filtersRef.current = updatedFilters // Update ref immediately

    // Re-run search with toggled filter
    setFieldAggregations({})
    executeSearch(100)
  }

  const openEditFilterDialog = (index) => {
    const filter = filters[index]
    let operator = 'is'
    if (filter.type === 'include') {
      operator = 'is'
    } else if (filter.type === 'exclude') {
      operator = 'is not'
    } else if (filter.type === 'exists') {
      operator = 'exists'
    } else if (filter.type === 'not_exists') {
      operator = 'does not exist'
    }
    setEditFilterData({
      field: filter.field,
      operator: operator,
      value: filter.value || ''
    })
    setEditingFilter(index)
  }

  const saveEditedFilter = () => {
    if (editingFilter === null) return

    let filterType = 'include'
    if (editFilterData.operator === 'is') {
      filterType = 'include'
    } else if (editFilterData.operator === 'is not') {
      filterType = 'exclude'
    } else if (editFilterData.operator === 'exists') {
      filterType = 'exists'
    } else if (editFilterData.operator === 'does not exist') {
      filterType = 'not_exists'
    }

    // Check if another filter with the same field and value already exists (excluding the current one being edited)
    const duplicateIndex = filters.findIndex((f, idx) =>
      idx !== editingFilter &&
      f.field === editFilterData.field &&
      f.value === editFilterData.value
    )

    if (duplicateIndex !== -1) {
      // If duplicate exists, update that one and remove the current one being edited
      const updatedFilters = [...filters]
      updatedFilters[duplicateIndex].type = filterType
      updatedFilters[duplicateIndex].disabled = false
      updatedFilters.splice(editingFilter, 1)
      setFilters(updatedFilters)
      filtersRef.current = updatedFilters
    } else {
      // No duplicate, just update the current filter
      const updatedFilters = [...filters]
      updatedFilters[editingFilter] = {
        field: editFilterData.field,
        type: filterType,
        value: editFilterData.value
      }
      setFilters(updatedFilters)
      filtersRef.current = updatedFilters
    }

    setFieldAggregations({})
    executeSearch(100)

    setEditingFilter(null)
    setEditFilterData({ field: '', operator: 'is', value: '' })
  }

  const cancelEditFilter = () => {
    setEditingFilter(null)
    setEditFilterData({ field: '', operator: 'is', value: '' })
  }

  const handleToggleColumn = (fieldName) => {
    setSelectedColumns(prev => {
      if (prev.includes(fieldName)) {
        // Remove column
        return prev.filter(col => col !== fieldName)
      } else {
        // Add column
        return [...prev, fieldName]
      }
    })
  }

  const handleTimeRangeChange = (newTimeRange) => {
    setTimeRange(newTimeRange)
    timeRangeRef.current = newTimeRange // Update ref immediately

    // Don't trigger search if no index is selected
    if (!selectedIndex || selectedIndex.trim() === '') {
      return
    }

    // Re-run search with the new time range
    // Also clear field aggregations since time range changed
    setFieldAggregations({})

    // Pass the new time range directly to handleSearch
    // Use current search bar query to respect typed text
    executeSearch(100)
  }

  const fetchAllFieldAggregations = async (fieldsToFetch, queryToUse, filtersToUse, timeRangeToUse) => {
    // Fetch aggregations for all fields in parallel
    if (!selectedIndex || !fieldsToFetch || fieldsToFetch.length === 0) return

    console.log('Fetching aggregations for fields:', fieldsToFetch.length, 'with', filtersToUse?.length || 0, 'filters')

    try {
      // Build query with filters
      const queryWithFilters = buildQueryWithFilters(queryToUse, filtersToUse)

      // Calculate batch size based on time range duration
      let batchSize = 1
      if (timeRangeToUse && timeRangeToUse.from !== null && timeRangeToUse.to !== null) {
        const durationSeconds = timeRangeToUse.to - timeRangeToUse.from
        const durationHours = durationSeconds / 3600
        batchSize = Math.min(Math.max(1, Math.ceil(durationHours / 3)), MAX_BATCH_SIZE)
      }

      // Create time range slices
      const timeSlices = []
      if (batchSize > 1 && timeRangeToUse && timeRangeToUse.from !== null && timeRangeToUse.to !== null) {
        const totalDuration = timeRangeToUse.to - timeRangeToUse.from
        const sliceDuration = totalDuration / batchSize

        for (let i = 0; i < batchSize; i++) {
          const sliceStart = Math.floor(timeRangeToUse.from + (i * sliceDuration))
          const sliceEnd = i === batchSize - 1 ? timeRangeToUse.to : Math.floor(timeRangeToUse.from + ((i + 1) * sliceDuration))
          timeSlices.push({ start: sliceStart, end: sliceEnd })
        }
      } else {
        timeSlices.push({
          start: timeRangeToUse?.from || null,
          end: timeRangeToUse?.to || null
        })
      }

      // Create aggregation requests for all fields across all time slices
      const allRequests = []
      fieldsToFetch.forEach(fieldName => {
        timeSlices.forEach(slice => {
          const aggs = {
            [fieldName]: {
              terms: {
                field: fieldName,
                size: 10
              }
            }
          }

          const aggsBody = {
            query: queryWithFilters || '*',
            max_hits: 0,
            aggs: aggs
          }

          if (slice.start !== null) {
            aggsBody.start_timestamp = slice.start
            if (slice.end !== null) {
              aggsBody.end_timestamp = slice.end
            }
          }

          allRequests.push(
            fetch(`${QUICKWIT_URL}/quickwit/api/v1/${selectedIndex}/search`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept-Encoding': 'gzip, deflate',
                'Access-Control-Allow-Origin': '*'
              },
              body: JSON.stringify(aggsBody)
            })
              .then(res => res.ok ? res.json() : null)
              .catch(err => {
                console.warn('Aggregation fetch failed for', fieldName, err)
                return null
              })
              .then(data => ({ fieldName, data }))
          )
        })
      })

      // Execute all requests in parallel
      const results = await Promise.all(allRequests)

      // Merge results by field
      const mergedAggregations = {}
      const failedFields = new Set()

      results.forEach(({ fieldName, data }) => {
        if (!data || !data.aggregations || !data.aggregations[fieldName]) {
          failedFields.add(fieldName)
          return
        }

        if (!mergedAggregations[fieldName]) {
          mergedAggregations[fieldName] = { buckets: {} }
        }

        // Merge buckets from this time slice
        const buckets = data.aggregations[fieldName].buckets || []

        // If no buckets returned, mark as failed
        if (buckets.length === 0) {
          failedFields.add(fieldName)
          return
        }

        buckets.forEach(bucket => {
          const key = bucket.key_as_string || String(bucket.key)
          if (mergedAggregations[fieldName].buckets[key]) {
            mergedAggregations[fieldName].buckets[key].doc_count += bucket.doc_count
          } else {
            mergedAggregations[fieldName].buckets[key] = { ...bucket, key: bucket.key }
          }
        })
      })

      // Log fields that failed to get aggregations
      if (failedFields.size > 0) {
        console.info('Fields without aggregation data:', Array.from(failedFields))
      }

      // Convert merged buckets to arrays and sort
      const finalAggregations = {}
      Object.entries(mergedAggregations).forEach(([fieldName, data]) => {
        const bucketArray = Object.values(data.buckets).sort((a, b) => b.doc_count - a.doc_count)
        finalAggregations[fieldName] = { buckets: bucketArray }
      })

      // Update state with all aggregations
      setFieldAggregations(finalAggregations)
    } catch (err) {
      console.warn('Failed to fetch all field aggregations:', err)
    }
  }

  const fetchFieldAggregation = async (fieldName) => {
    // Fetch aggregation for a single field, splitting by time range into parallel batches
    if (!selectedIndex || !fieldName) return

    // Calculate batch size based on time range duration
    let batchSize = 1
    if (lastUsedTimeRange && lastUsedTimeRange.from !== null && lastUsedTimeRange.from !== undefined && lastUsedTimeRange.to !== null && lastUsedTimeRange.to !== undefined) {
      // Calculate time range duration in seconds (timestamps are in seconds)
      const durationSeconds = lastUsedTimeRange.to - lastUsedTimeRange.from
      const durationHours = durationSeconds / 3600

      // Scale batch size: 1 batch per 3 hours, capped at MAX_BATCH_SIZE
      batchSize = Math.min(Math.max(1, Math.ceil(durationHours / 3)), MAX_BATCH_SIZE)
    } else {
      // Default to 1 batch if no time range
      batchSize = 1
    }

    try {
      // Build query with current filters
      const queryWithFilters = buildQueryWithFilters(currentQuery)

      // Create time range slices
      const timeSlices = []
      if (batchSize > 1 && lastUsedTimeRange && lastUsedTimeRange.from !== null && lastUsedTimeRange.to !== null) {
        const totalDuration = lastUsedTimeRange.to - lastUsedTimeRange.from
        const sliceDuration = totalDuration / batchSize

        for (let i = 0; i < batchSize; i++) {
          const sliceStart = Math.floor(lastUsedTimeRange.from + (i * sliceDuration))
          const sliceEnd = i === batchSize - 1 ? lastUsedTimeRange.to : Math.floor(lastUsedTimeRange.from + ((i + 1) * sliceDuration))
          timeSlices.push({ start: sliceStart, end: sliceEnd })
        }
      } else {
        // Single request with full time range
        timeSlices.push({
          start: lastUsedTimeRange?.from || null,
          end: lastUsedTimeRange?.to || null
        })
      }

      // Create parallel requests for each time slice
      const batchRequests = timeSlices.map(async (slice) => {
        const aggs = {
          [fieldName]: {
            terms: {
              field: fieldName,
              size: 10
            }
          }
        }

        const aggsBody = {
          query: queryWithFilters || '*',
          max_hits: 0,
          aggs: aggs
        }

        // Add time range parameters for this slice
        if (slice.start !== null) {
          aggsBody.start_timestamp = slice.start
          if (slice.end !== null) {
            aggsBody.end_timestamp = slice.end
          }
        }

        const aggsResponse = await fetch(`${QUICKWIT_URL}/quickwit/api/v1/${selectedIndex}/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify(aggsBody)
        })

        if (aggsResponse.ok) {
          const aggsData = await aggsResponse.json()
          return aggsData.aggregations?.[fieldName] || null
        } else {
          console.warn('Batch aggregation request failed')
          return null
        }
      })

      // Wait for all batch requests to complete
      const batchResults = await Promise.all(batchRequests)

      // Merge aggregation results from all time slices
      const mergedBuckets = {}
      batchResults.forEach(aggResult => {
        if (aggResult && aggResult.buckets) {
          aggResult.buckets.forEach(bucket => {
            const key = bucket.key_as_string || String(bucket.key)
            if (mergedBuckets[key]) {
              mergedBuckets[key].doc_count += bucket.doc_count
            } else {
              mergedBuckets[key] = { ...bucket }
            }
          })
        }
      })

      // Convert merged buckets back to array and sort by doc_count
      const finalBuckets = Object.values(mergedBuckets).sort((a, b) => b.doc_count - a.doc_count)

      // Update field aggregations with merged result
      setFieldAggregations(prev => ({
        ...prev,
        [fieldName]: {
          buckets: finalBuckets
        }
      }))
    } catch (err) {
      // Aggregation fetch failed
    }
  }

  const handleFieldExpand = async (fieldName) => {
    // Fetch aggregation for this field if not already loaded
    if (!fieldAggregations[fieldName]) {
      await fetchFieldAggregation(fieldName)
    }
  }

  const fetchFieldValues = async (fieldName, partialValue) => {
    // Fetch top values for a field to use in autocomplete
    if (!selectedIndex) return []

    try {
      const aggs = {
        [fieldName]: {
          terms: {
            field: fieldName,
            size: 20
          }
        }
      }

      // Build query with current filters
      const queryWithFilters = buildQueryWithFilters(currentQuery)

      const aggsBody = {
        query: queryWithFilters || '*',
        max_hits: 0,
        aggs: aggs
      }

      // Add time range parameters if set
      if (timeRange && timeRange.from !== null) {
        aggsBody.start_timestamp = timeRange.from
        if (timeRange.to !== null) {
          aggsBody.end_timestamp = timeRange.to
        }
      }

      const aggsResponse = await fetch(`${QUICKWIT_URL}/quickwit/api/v1/${selectedIndex}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(aggsBody)
      })

      if (aggsResponse.ok) {
        const aggsData = await aggsResponse.json()
        if (aggsData.aggregations && aggsData.aggregations[fieldName] &&
          aggsData.aggregations[fieldName].buckets) {
          const values = aggsData.aggregations[fieldName].buckets.map(bucket => bucket.key_as_string || String(bucket.key))

          // Filter by partial value if provided
          if (partialValue) {
            return values.filter(v =>
              v.toLowerCase().includes(partialValue.toLowerCase())
            )
          }
          return values
        }
      }
    } catch (err) {
      console.warn('Could not fetch field values for', fieldName, err)
    }

    return []
  }

  // Unified search function that always reads from current state refs
  const executeSearch = async (maxHits = 100, offset = 0, appendResults = false, forceFetchDocs = false) => {
    // Guard: Don't search if no index is selected
    if (!selectedIndex || selectedIndex.trim() === '') {
      console.warn('Cannot search: no index selected')
      return
    }

    // In visualize mode, skip the API calls but still update the state
    // GraphView watches these state changes and will fetch its own data
    const skipAPICallsInVisualizeMode = (viewMode === 'visualize' || viewMode === 'traces') && !forceFetchDocs

    // Cancel any ongoing search
    if (abortController) {
      abortController.abort()
    }

    // Create new AbortController for this search
    const controller = new AbortController()
    setAbortController(controller)

    // Get current values from refs to ensure we always use the latest state
    const query = currentSearchBarQueryRef.current
    const activeFilters = filtersRef.current
    const activeTimeRange = timeRangeRef.current

    // Update lastSearchQuery to match what we're searching for
    setLastSearchQuery(query)
    setCurrentQuery(query)

    if (appendResults) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      // Reset offset if not appending
      if (offset === 0) {
        setStartOffset(0)
      }
    }
    setError(null)

    // Track request start time
    const requestStartTime = performance.now()

    try {
      // Build aggregations for all fields in the selected index
      const currentIndex = indexes.find(idx => idx.index_config.index_id === selectedIndex.split(',')[0])
      const fieldMappings = currentIndex?.index_config?.doc_mapping?.field_mappings || []

      // Step 1: Make initial request to get results (no aggregations yet)
      // Build query with filters applied
      const queryWithFilters = buildQueryWithFilters(query, activeFilters)

      // When in visualize mode and fields are already discovered, don't fetch documents
      const shouldFetchDocs = forceFetchDocs || (viewMode !== 'visualize' && viewMode !== 'traces') || !fieldCache[selectedIndex] || fieldCache[selectedIndex].length === 0
      const effectiveMaxHits = shouldFetchDocs ? maxHits : 0

      const searchBody = {
        query: queryWithFilters || '*',
        max_hits: effectiveMaxHits,
        start_offset: offset,
        aggs: {}
      }

      // Add sort_by only for single-index (multi-index may have different schemas)
      if (timestampField && !selectedIndex.includes(',')) {
        searchBody.sort_by = timestampField
      }

      // Add VRL if present
      if (vrl && vrl.trim() !== '') {
        searchBody.vrl = vrl
      }

      // Add time range parameters if set
      if (activeTimeRange && activeTimeRange.from !== null) {
        const now = Math.floor(Date.now() / 1000)
        searchBody.start_timestamp = activeTimeRange.fromIsNow ? now : activeTimeRange.from
        // Only add end_timestamp if explicitly set (for absolute ranges)
        if (activeTimeRange.to !== null) {
          searchBody.end_timestamp = activeTimeRange.toIsNow ? now : activeTimeRange.to
        }

        // Store the resolved time range for use in field aggregations
        setLastUsedTimeRange({
          from: searchBody.start_timestamp,
          to: searchBody.end_timestamp || null
        })
      } else {
        setLastUsedTimeRange(null)
      }

      // In visualize mode, skip API calls and return early
      // GraphView will watch state changes and make its own API call
      if (skipAPICallsInVisualizeMode) {
        console.log('Visualize/Traces mode: skipping API calls, currentQuery updated to:', query)
        console.log('Time range:', activeTimeRange)
        console.log('Filters:', activeFilters)
        // Increment search trigger to force GraphView to re-fetch
        setSearchTrigger(prev => prev + 1)
        setLoading(false)
        setLoadingMore(false)
        return
      }

      // Prepare histogram request to run in parallel
      const histogramPromise = (async () => {
        if (!activeTimeRange || offset > 0) return null // Skip histogram for pagination
        if (selectedIndex.includes(',')) return null // Skip histogram for multi-index (field may differ)

        try {
          const now = Math.floor(Date.now() / 1000)
          const endTimestamp = activeTimeRange.to !== null ? activeTimeRange.to : now

          const fixedInterval = computeFixedInterval(
            activeTimeRange.from * 1000,
            endTimestamp * 1000,
            50,
            histogramInterval
          )

          const histogramBody = {
            query: queryWithFilters || '*',
            max_hits: 0,
            aggs: {
              _histogram: {
                histogram: {
                  field: timestampField,
                  interval: fixedInterval,
                  min_doc_count: 0
                }
              }
            },
            start_timestamp: activeTimeRange.from
          }

          if (activeTimeRange.to !== null) {
            histogramBody.end_timestamp = activeTimeRange.to
          }

          const histogramResponse = await fetch(`${QUICKWIT_URL}/quickwit/api/v1/${selectedIndex}/search`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept-Encoding': 'gzip, deflate',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(histogramBody),
            signal: controller.signal
          })

          if (histogramResponse.ok) {
            return await histogramResponse.json()
          }
        } catch (err) {
          console.warn('Histogram fetch failed:', err)
        }
        return null
      })()

      // Run both requests in parallel
      const [response, histogramResult] = await Promise.all([
        fetch(`${QUICKWIT_URL}/quickwit/api/v1/${selectedIndex}/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify(searchBody),
          signal: controller.signal
        }),
        histogramPromise
      ])

      if (!response.ok) {
        let errorMessage = `Search failed: ${response.statusText}`
        try {
          const errorData = await response.json()
          // Try to extract error message from Quickwit response
          if (errorData.message) {
            errorMessage = errorData.message
          } else if (errorData.error) {
            errorMessage = errorData.error
          } else if (typeof errorData === 'string') {
            errorMessage = errorData
          }
        } catch (e) {
          // If response is not JSON, just use status text
        }
        throw new Error(errorMessage)
      }

      const data = await response.json()

      // Update histogram if we got results
      if (histogramResult && histogramResult.aggregations?._histogram) {
        const histogram = histogramResult.aggregations._histogram
        setHistogramData(histogram)

        // Extract first and last event times from histogram buckets
        if (histogram.buckets && histogram.buckets.length > 0) {
          const firstBucket = histogram.buckets[0]
          const lastBucket = histogram.buckets[histogram.buckets.length - 1]
          setFirstEventTime(firstBucket.key / 1000)
          setLastEventTime(lastBucket.key / 1000)
        }
      }

      // Step 2: Extract all fields from results, including nested fields
      let discoveredFields = []
      const discoveredFieldsSet = new Set()
      const fieldsWithObjectValues = new Set() // Track fields that have object values
      const discoveredNumericFields = new Set() // Track numeric fields

      const extractFields = (obj, prefix = '') => {
        Object.entries(obj).forEach(([key, value]) => {
          const fieldName = prefix ? `${prefix}.${key}` : key

          // Recursively extract nested fields from objects
          if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            // Mark this field as having an object value (should be excluded)
            fieldsWithObjectValues.add(fieldName)
            // Recursively extract nested fields
            extractFields(value, fieldName)
          } else {
            // Only add leaf fields (non-object values)
            discoveredFieldsSet.add(fieldName)
            // Track numeric fields
            if (typeof value === 'number') {
              discoveredNumericFields.add(fieldName)
            }
          }
        })
      }

      // Extract fields from hits if we have them
      if (data.hits && data.hits.length > 0) {
        data.hits.forEach(hit => {
          extractFields(hit)
        })
        // Filter out fields that have object values
        discoveredFields = Array.from(discoveredFieldsSet)
          .filter(field => !fieldsWithObjectValues.has(field))
          .sort()

        // Cache discovered fields for this index
        setFieldCache(prev => ({
          ...prev,
          [selectedIndex]: discoveredFields
        }))
      } else if (fieldCache[selectedIndex]) {
        // Use cached fields if we didn't fetch documents
        discoveredFields = fieldCache[selectedIndex]
      }

      // Also check field mappings for numeric types
      const numericFieldsFromMapping = new Set(discoveredNumericFields)
      fieldMappings.forEach(mapping => {
        const fieldType = mapping.type || mapping.field_mapping?.type
        if (['i64', 'u64', 'f64', 'i32', 'u32', 'f32', 'f16'].includes(fieldType)) {
          numericFieldsFromMapping.add(mapping.name)
        }
      })

      setNumericFields(Array.from(numericFieldsFromMapping))

      // Fetch aggregations for all discovered fields (only for initial search, not pagination)
      if (!appendResults && discoveredFields && discoveredFields.length > 0) {
        // Fire aggregations fetch in background (don't await it)
        fetchAllFieldAggregations(discoveredFields, query, activeFilters, activeTimeRange)
      }

      // Calculate total request time (only for initial search, not when loading more)
      if (!appendResults) {
        const requestEndTime = performance.now()
        const totalRequestTime = requestEndTime - requestStartTime
        setRequestTime(totalRequestTime)
      }

      // Determine if there are more results
      setVrlTime(data.vrl_time || null)
      setHasMoreResults(data.num_hits > offset + maxHits)

      if (appendResults) {
        // Append new hits to existing results
        setSearchResults(prev => ({
          ...data,
          hits: [...(prev?.hits || []), ...data.hits]
        }))
      } else {
        setSearchResults(data)
      }
      setFields(discoveredFields)
    } catch (err) {
      // Don't show error if request was aborted
      if (err.name === 'AbortError') {
        // Search cancelled by user
      } else {
        setError('Search failed: ' + err.message)
        console.error('Search error:', err)
      }
    } finally {
      setLoading(false)
      setLoadingMore(false)
      setAbortController(null)
    }
  }

  const handleRestoreHistoryState = (state) => {
    // Restore index + timestampField
    if (state.index && state.index !== selectedIndex) {
      setSelectedIndex(state.index)
      const firstIndex = state.index.split(',')[0]
      const indexObj = indexes.find(idx => idx.index_config.index_id === firstIndex)
      if (indexObj) {
        const tsField = indexObj.index_config?.doc_mapping?.timestamp_field ||
          indexObj.index_config?.indexing_settings?.timestamp_field || 'timestamp'
        setTimestampField(tsField)
      }
    }
    if (state.query !== undefined) {
      setCurrentSearchBarQuery(state.query)
      currentSearchBarQueryRef.current = state.query
    }
    if (state.filters) {
      setFilters(state.filters)
      filtersRef.current = state.filters
    }
    if (state.vrl !== undefined) setVrl(state.vrl)
    if (state.histogramInterval) setHistogramInterval(state.histogramInterval)
    if (state.timeRange) {
      setTimeRange({ ...state.timeRange })
      timeRangeRef.current = state.timeRange
    }
    // Trigger search after all state updates are flushed (same pattern as sharedQueryLoaded)
    setSharedQueryLoaded(true)
  }

  const handleSearch = async (query, maxHits, skipQueryUpdate = false, forceFetchDocs = false) => {
    if (query !== undefined) {
      setCurrentSearchBarQuery(query)
      currentSearchBarQueryRef.current = query
    }
    // If the end of the time range is "now" (relative range), recompute before searching
    const currentRange = timeRangeRef.current
    if (currentRange?.label) {
      const refreshed = recomputeTimeRangeFromLabel(currentRange)
      if (refreshed) {
        setTimeRange(refreshed)
        timeRangeRef.current = refreshed
      }
    }
    return executeSearch(maxHits, 0, false, forceFetchDocs)
  }



  const handleLoadMore = async () => {
    const newOffset = startOffset + (searchResults?.hits?.length || 0)
    setStartOffset(newOffset)

    // Fetch more results with the same query and time range
    await executeSearch(100, newOffset, true)
  }

  const handleCancelSearch = () => {
    if (abortController) {
      abortController.abort()
      setAbortController(null)
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const handleSetDefaultIndex = (indexId) => {
    // This is just a callback for the FieldsSidebar
    // The actual storage is handled in FieldsSidebar
  }

  if (authStatus.loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    )
  }

  if (authStatus.oidcEnabled && !authStatus.authenticated) {
    return <Login />
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>Quickwit Explorer</h1>
          <div className="view-mode-buttons">
            <button
              onClick={() => {
                setViewMode('logs')
                executeSearch(100, 0, false, true)
              }}
              className={`view-mode-btn ${viewMode === 'logs' ? 'active' : ''}`}
            >
              Logs
            </button>
            <button
              onClick={() => setViewMode('visualize')}
              className={`view-mode-btn ${viewMode === 'visualize' ? 'active' : ''}`}
            >
              Visualize
            </button>
            <button
              onClick={() => setViewMode('traces')}
              className={`view-mode-btn ${viewMode === 'traces' ? 'active' : ''}`}
            >
              Traces
            </button>
          </div>
        </div>
        <div className="header-controls">
          <button
            className="settings-toggle"
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            ⚙️
          </button>
          <div className="theme-toggle-container">
            {authStatus.authenticated && authStatus.user && (
              <div className="user-info">
                <span className="user-name">{authStatus.user.name || authStatus.user.email}</span>
                <a href="/logout" className="logout-btn" title="Logout">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                </a>
              </div>
            )}
            <button
              className="theme-toggle-btn"
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <>
          <div className="settings-overlay" onClick={() => setShowSettings(false)}></div>
          <div className="settings-modal">
            <div className="settings-header">
              <h2>Settings</h2>
              <button className="settings-close" onClick={() => setShowSettings(false)}>×</button>
            </div>
            <div className="settings-content">
              <div className="settings-section">
                <h3>Document View</h3>
                <div className="settings-item">
                  <label>Default Tab:</label>
                  <select
                    value={userPreferences.defaultTab}
                    onChange={(e) => setUserPreferences({
                      ...userPreferences,
                      defaultTab: e.target.value
                    })}
                  >
                    <option value="table">Table</option>
                    <option value="json">JSON</option>
                  </select>
                </div>
                <div className="settings-item">
                  <label>Font Size:</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="range"
                      min="10"
                      max="20"
                      step="1"
                      value={userPreferences.fontSize || 13}
                      onChange={(e) => setUserPreferences({
                        ...userPreferences,
                        fontSize: parseInt(e.target.value)
                      })}
                      style={{ flex: 1 }}
                    />
                    <span style={{ minWidth: '3rem', textAlign: 'right' }}>{userPreferences.fontSize || 13}px</span>
                  </div>
                </div>
              </div>

              <div className="settings-section">
                <h3>JSON View Options</h3>
                <div className="settings-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={!userPreferences.jsonViewOptions.collapsed}
                      onChange={(e) => setUserPreferences({
                        ...userPreferences,
                        jsonViewOptions: {
                          ...userPreferences.jsonViewOptions,
                          collapsed: !e.target.checked
                        }
                      })}
                    />
                    Expand all nodes by default
                  </label>
                </div>
                <div className="settings-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={userPreferences.jsonViewOptions.displayDataTypes}
                      onChange={(e) => setUserPreferences({
                        ...userPreferences,
                        jsonViewOptions: {
                          ...userPreferences.jsonViewOptions,
                          displayDataTypes: e.target.checked
                        }
                      })}
                    />
                    Display data types
                  </label>
                </div>
                <div className="settings-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={userPreferences.jsonViewOptions.displayObjectSize}
                      onChange={(e) => setUserPreferences({
                        ...userPreferences,
                        jsonViewOptions: {
                          ...userPreferences.jsonViewOptions,
                          displayObjectSize: e.target.checked
                        }
                      })}
                    />
                    Display object size
                  </label>
                </div>
                <div className="settings-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={userPreferences.jsonViewOptions.enableClipboard}
                      onChange={(e) => setUserPreferences({
                        ...userPreferences,
                        jsonViewOptions: {
                          ...userPreferences.jsonViewOptions,
                          enableClipboard: e.target.checked
                        }
                      })}
                    />
                    Enable inline copy buttons
                  </label>
                </div>
                <div className="settings-item">
                  <label>Icon Style:</label>
                  <select
                    value={userPreferences.jsonViewOptions.iconStyle}
                    onChange={(e) => setUserPreferences({
                      ...userPreferences,
                      jsonViewOptions: {
                        ...userPreferences.jsonViewOptions,
                        iconStyle: e.target.value
                      }
                    })}
                  >
                    <option value="circle">Circle</option>
                    <option value="triangle">Triangle</option>
                    <option value="square">Square</option>
                  </select>
                </div>
                <div className="settings-item">
                  <label>Light Mode Theme:</label>
                  <select
                    value={userPreferences.jsonViewOptions.themeLightMode || 'rjv-default'}
                    onChange={(e) => setUserPreferences({
                      ...userPreferences,
                      jsonViewOptions: {
                        ...userPreferences.jsonViewOptions,
                        themeLightMode: e.target.value
                      }
                    })}
                  >
                    <option value="rjv-default">Default</option>
                    <option value="monokai">Monokai</option>
                    <option value="summerfruit:inverted">Summerfruit Light</option>
                    <option value="google">Google</option>
                    <option value="grayscale">Grayscale</option>
                    <option value="bright:inverted">Bright</option>
                    <option value="shapeshifter:inverted">Shapeshifter</option>
                  </select>
                </div>
                <div className="settings-item">
                  <label>Dark Mode Theme:</label>
                  <select
                    value={userPreferences.jsonViewOptions.themeDarkMode || 'monokai'}
                    onChange={(e) => setUserPreferences({
                      ...userPreferences,
                      jsonViewOptions: {
                        ...userPreferences.jsonViewOptions,
                        themeDarkMode: e.target.value
                      }
                    })}
                  >
                    <option value="monokai">Monokai</option>
                    <option value="tomorrow">Tomorrow Night</option>
                    <option value="ocean">Ocean</option>
                    <option value="eighties">Eighties</option>
                    <option value="paraiso">Paraiso</option>
                    <option value="ashes">Ashes</option>
                    <option value="harmonic">Harmonic</option>
                    <option value="greenscreen">Green Screen</option>
                    <option value="tube">Tube</option>
                    <option value="rjv-default">Default</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      <div className="main-container">
        <FieldsSidebar
          fields={fields}
          aggregations={fieldAggregations}
          onFilterChange={handleFilterChange}
          onFieldExpand={handleFieldExpand}
          selectedIndex={selectedIndex}
          indexes={indexes}
          onIndexChange={handleIndexChange}
          selectedColumns={selectedColumns}
          onToggleColumn={handleToggleColumn}
          onSetDefaultIndex={handleSetDefaultIndex}
          viewMode={viewMode}
        />

        <main className="content">
          <SearchBar
            onSearch={handleSearch}
            loading={loading}
            fields={fields}
            selectedIndex={selectedIndex}
            onFetchFieldValues={fetchFieldValues}
            firstEventTime={firstEventTime}
            lastEventTime={lastEventTime}
            histogramInterval={histogramInterval}
            onHistogramIntervalChange={onIntervalChange}
            intervalError={intervalError}
            totalHits={searchResults?.num_hits}
            elapsedTimeMicros={searchResults?.elapsed_time_micros}
            requestTime={requestTime}
            onCancelSearch={handleCancelSearch}
            defaultSearchFields={defaultSearchFields}
            onSaveQuery={(searchBarQuery) => {
              setCurrentSearchBarQuery(searchBarQuery)
              setShowSaveQueryModal(true)
            }}
            onLoadQuery={() => {
              fetchSavedQueries()
              setShowLoadQueryModal(true)
            }}
            onShareQuery={handleShareQuery}
            externalQuery={currentSearchBarQuery}
            onQueryChange={(newQuery) => {
              setCurrentSearchBarQuery(newQuery)
              currentSearchBarQueryRef.current = newQuery
            }}
            selectedColumns={selectedColumns}
            results={searchResults?.hits || []}
            onExportCSV={handleExportCSV}
            onAnalyzePatterns={() => handleAnalyzePatterns()}
            onRestoreHistoryState={handleRestoreHistoryState}
            vrl={vrl}
            onVrlChange={setVrl}
            vrlTime={vrlTime}
            vrlEnabled={authStatus.vrlEnabled}
            filters={filters}
            timeRange={timeRange}
            onFiltersChange={(newFilters) => {
              setFilters(newFilters)
              filtersRef.current = newFilters
            }}
            onTimeRangeChange={handleTimeRangeChange}
            timeRangePicker={
              <TimeRangePicker
                onTimeRangeChange={handleTimeRangeChange}
                timestampField={timestampField}
                value={timeRange}
              />
            }
          />

          {viewMode === 'logs' && histogramData && (
            <Histogram data={histogramData} timeRange={timeRange} onTimeRangeChange={handleTimeRangeChange} totalHits={searchResults?.num_hits} />
          )}

          {filters.length > 0 && (
            <div className="active-filters">
              <span className="filters-label">Active Filters:</span>
              {filters.map((filter, idx) => (
                <div key={idx} className={`filter-chip-wrapper ${editingFilter === idx ? 'editing' : ''}`}>
                  <div className={`filter-chip ${filter.type} ${filter.disabled ? 'disabled' : ''}`}>
                    <span
                      className="filter-content"
                      onClick={() => openEditFilterDialog(idx)}
                      style={{ cursor: 'pointer', flex: 1 }}
                    >
                      {filter.type === 'exists'
                        ? `${filter.field} exists`
                        : filter.type === 'not_exists'
                        ? `${filter.field} does not exist`
                        : `${filter.field}: ${String(filter.value)}`
                      }
                    </span>
                    <button
                      className="filter-toggle-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleFilterDisabled(idx)
                      }}
                      title={filter.disabled ? "Enable filter" : "Disable filter"}
                    >
                      {filter.disabled ? '👁️‍🗨️' : '👁️'}
                    </button>
                    <button
                      className="filter-invert-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        invertFilterType(idx)
                      }}
                      title="Invert filter (is ↔ is not, exists ↔ does not exist)"
                    >
                      ⇄
                    </button>
                    <button
                      className="filter-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeFilter(idx)
                      }}
                      title="Remove filter"
                    >
                      ×
                    </button>
                  </div>
                  {editingFilter === idx && (
                    <>
                      <div className="filter-edit-overlay" onClick={cancelEditFilter}></div>
                      <div className="filter-edit-popover" onClick={(e) => e.stopPropagation()}>
                        <div className="filter-edit-arrow"></div>
                        <div className="filter-edit-content">
                          <div className="filter-edit-field-name">{filter.field}</div>
                          <div className="filter-edit-inputs">
                            <select
                              value={editFilterData.operator}
                              onChange={(e) => setEditFilterData({ ...editFilterData, operator: e.target.value })}
                            >
                              <option value="is">is</option>
                              <option value="is not">is not</option>
                              <option value="exists">exists</option>
                              <option value="does not exist">does not exist</option>
                            </select>
                            {editFilterData.operator !== 'exists' && editFilterData.operator !== 'does not exist' && (
                              <input
                                type="text"
                                value={editFilterData.value}
                                onChange={(e) => setEditFilterData({ ...editFilterData, value: e.target.value })}
                                autoFocus
                                placeholder="Value"
                              />
                            )}
                          </div>
                          <div className="filter-edit-actions">
                            <button className="filter-edit-cancel" onClick={cancelEditFilter}>Cancel</button>
                            <button className="filter-edit-save" onClick={saveEditedFilter}>Save</button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {viewMode === 'logs' && (
            <ResultsTable
              results={searchResults}
              loading={loading}
              searchQuery={lastSearchQuery}
              timestampField={timestampField}
              hasMoreResults={hasMoreResults}
              loadingMore={loadingMore}
              onLoadMore={handleLoadMore}
              requestTime={requestTime}
              selectedColumns={selectedColumns}
              onRemoveColumn={handleToggleColumn}
              onFilterChange={handleFilterChange}
              onToggleColumn={handleToggleColumn}
              userPreferences={userPreferences}
              darkMode={darkMode}
            />
          )}

          {viewMode === 'visualize' && (
            <GraphView
              selectedIndex={selectedIndex}
              apiUrl={QUICKWIT_URL}
              startTime={timeRange?.from ? timeRange.from * 1000 : null}
              endTime={timeRange?.to ? timeRange.to * 1000 : null}
              filters={filters}
              timestampField={timestampField}
              numericFields={numericFields}
              query={currentQuery}
              histogramInterval={histogramInterval}
              onTimeRangeChange={handleTimeRangeChange}
              searchTrigger={searchTrigger}
              onBucketTimesChange={({ first, last }) => {
                setFirstEventTime(first)
                setLastEventTime(last)
              }}
            />
          )}

          {viewMode === 'traces' && (
            <TraceView
              selectedIndex={selectedIndex}
              apiUrl={QUICKWIT_URL}
              startTime={timeRange?.from ? timeRange.from * 1000 : null}
              endTime={timeRange?.to ? timeRange.to * 1000 : null}
              filters={filters}
              query={currentQuery}
              searchTrigger={searchTrigger}
            />
          )}
        </main>
      </div>

      {/* Query Management Modals */}
      {showSaveQueryModal && (
        <SaveQueryModal
          onSave={saveQuery}
          onUpdate={(name) => updateQuery(currentQueryId, name, savedQueries.find(q => q.id === currentQueryId)?.created_at)}
          onClose={() => setShowSaveQueryModal(false)}
          currentQueryId={currentQueryId}
          currentQueryName={currentQueryName}
          currentQuery={captureCurrentQuery(currentSearchBarQuery)}
        />
      )}

      {showLoadQueryModal && (
        <LoadQueryModal
          savedQueries={savedQueries}
          onLoad={loadQuery}
          onDelete={deleteQuery}
          onClose={() => setShowLoadQueryModal(false)}
          currentQueryId={currentQueryId}
        />
      )}

      <PatternsModal
        isOpen={showPatternsModal}
        onClose={() => setShowPatternsModal(false)}
        patterns={patterns}
        loading={patternsLoading}
        error={patternsError}
        totalLogs={patternsTotalLogs}
        totalClusters={patternsTotalClusters}
        fields={fields}
        field={patternsField}
        onFieldChange={handlePatternsFieldChange}
      />
      {showExportCSVModal && exportModalData && (
        <ExportCSVModal
          onConfirm={confirmExportCSV}
          onClose={() => setShowExportCSVModal(false)}
          totalHits={exportModalData.totalHits}
          exportCount={exportModalData.exportCount}
          maxExportLimit={exportModalData.maxExportLimit}
          estimatedCompressedSize={exportModalData.estimatedCompressedSize}
          estimatedUncompressedSize={exportModalData.estimatedUncompressedSize}
          estimatedDownloadSize={exportModalData.estimatedDownloadSize}
          compressionRatio={exportModalData.compressionRatio}
        />
      )}

      {/* Export Progress Indicator */}
      {exportProgress && (
        <ExportProgress
          status={exportProgress.status}
          message={exportProgress.message}
          progress={exportProgress.progress}
        />
      )}
    </div>
  )
}

export default App
