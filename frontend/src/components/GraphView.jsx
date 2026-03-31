import { useState, useEffect, useRef } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Area,
  AreaChart
} from 'recharts'
import './GraphView.css'

function GraphView({ selectedIndex, apiUrl, startTime, endTime, filters = [], timestampField = 'timestamp', numericFields = [], query = '*', histogramInterval = 'auto', onTimeRangeChange, searchTrigger = 0, onBucketTimesChange }) {
  // Load saved graph preferences from localStorage
  const loadGraphPreferences = () => {
    const saved = localStorage.getItem('graphCustomization')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {
        console.error('Failed to parse graph preferences:', e)
        return {}
      }
    }
    return {}
  }

  const savedPrefs = loadGraphPreferences()

  const [yAxisField, setYAxisField] = useState(null)
  const [groupByField, setGroupByField] = useState(null)
  const [aggregationFunc, setAggregationFunc] = useState(savedPrefs.aggregationFunc || 'sum')
  const [chartType, setChartType] = useState(savedPrefs.chartType || 'line')
  const [stackedMode, setStackedMode] = useState(savedPrefs.stackedMode || false)
  const [showLegend, setShowLegend] = useState(savedPrefs.showLegend !== undefined ? savedPrefs.showLegend : true)
  const [showGrid, setShowGrid] = useState(savedPrefs.showGrid !== undefined ? savedPrefs.showGrid : true)
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [draggedField, setDraggedField] = useState(null)
  const [isValidYAxisField, setIsValidYAxisField] = useState(false)
  const [validatingField, setValidatingField] = useState(false)

  // Time range selection state
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState(null)
  const [dragEnd, setDragEnd] = useState(null)
  const chartInteractionRef = useRef(null)

  // Legend filtering state - tracks which series are hidden
  const [hiddenSeries, setHiddenSeries] = useState(new Set())

  // Advanced customization options
  const [chartHeight, setChartHeight] = useState(savedPrefs.chartHeight || 700)
  const [barRadius, setBarRadius] = useState(savedPrefs.barRadius !== undefined ? savedPrefs.barRadius : 0)
  const [lineStrokeWidth, setLineStrokeWidth] = useState(savedPrefs.lineStrokeWidth || 2)
  const [lineCurveType, setLineCurveType] = useState(savedPrefs.lineCurveType || 'monotoneX')
  const [showTooltip, setShowTooltip] = useState(savedPrefs.showTooltip !== undefined ? savedPrefs.showTooltip : true)
  const [gridOpacity, setGridOpacity] = useState(savedPrefs.gridOpacity || 0.5)
  const [maxGroups, setMaxGroups] = useState(savedPrefs.maxGroups || 10)
  const [colorScheme, setColorScheme] = useState(savedPrefs.colorScheme || 'default')
  const [xAxisAngle, setXAxisAngle] = useState(savedPrefs.xAxisAngle || 0)
  const [animationDuration, setAnimationDuration] = useState(savedPrefs.animationDuration || 0)
  const [dotSize, setDotSize] = useState(savedPrefs.dotSize || 2)
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
  const [areaOpacity, setAreaOpacity] = useState(savedPrefs.areaOpacity || 0.3)
  const [enableGridX, setEnableGridX] = useState(savedPrefs.enableGridX || false)
  const [yScaleMin, setYScaleMin] = useState(savedPrefs.yScaleMin || 'auto')
  const [yScaleMax, setYScaleMax] = useState(savedPrefs.yScaleMax || 'auto')
  const [axisBottomLegend, setAxisBottomLegend] = useState(savedPrefs.axisBottomLegend || '')
  const [axisLeftLegend, setAxisLeftLegend] = useState(savedPrefs.axisLeftLegend || '')
  const [showPercentage, setShowPercentage] = useState(savedPrefs.showPercentage || false)
  const [selectedPercentiles, setSelectedPercentiles] = useState(savedPrefs.selectedPercentiles || [50, 95, 99])

  // Ref for advanced options panel
  const advancedOptionsPanelRef = useRef(null)
  // Ref for chart container to measure width for dynamic ticks
  const chartContainerRef = useRef(null)
  const [chartWidth, setChartWidth] = useState(0)

  useEffect(() => {
    if (chartType !== 'bar' || !chartContainerRef.current) return

    const updateWidth = () => {
      if (chartContainerRef.current) {
        setChartWidth(chartContainerRef.current.offsetWidth)
      }
    }

    updateWidth()

    const observer = new ResizeObserver(updateWidth)
    observer.observe(chartContainerRef.current)

    return () => observer.disconnect()
  }, [chartType, chartData])

  const aggregationFunctions = [
    { value: 'sum', label: 'Sum' },
    { value: 'avg', label: 'Average' },
    { value: 'min', label: 'Min' },
    { value: 'max', label: 'Max' },
    { value: 'percentiles', label: 'Percentiles' }
  ]

  const chartTypes = [
    { value: 'bar', label: 'Bar Chart' },
    { value: 'line', label: 'Line Chart' },
    { value: 'area', label: 'Area Chart' }
  ]

  const colorSchemes = {
    default: ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b', '#fa709a', '#fee140', '#30cfd0', '#a8edea', '#fed6e3'],
    vibrant: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#fd79a8', '#fdcb6e', '#e17055', '#74b9ff', '#a29bfe'],
    pastel: ['#ffd1dc', '#b5ead7', '#c7ceea', '#e2f0cb', '#ffdac1', '#d4a5a5', '#c5e1a5', '#b3e5fc', '#f8bbd0', '#dcedc8'],
    ocean: ['#006994', '#0582ca', '#00a6fb', '#7dd3fc', '#0496ff', '#5eb8ea', '#92dcf5', '#c5edf9', '#1e88e5', '#42a5f5'],
    sunset: ['#ff6b35', '#f7931e', '#fdc500', '#c1666b', '#d4afb9', '#f4a261', '#e76f51', '#e9c46a', '#f4a462', '#e76e50'],
    forest: ['#2d6a4f', '#40916c', '#52b788', '#74c69d', '#95d5b2', '#b7e4c7', '#d8f3dc', '#588157', '#3a5a40', '#344e41'],
    monochrome: ['#1a1a1a', '#333333', '#4d4d4d', '#666666', '#808080', '#999999', '#b3b3b3', '#cccccc', '#e6e6e6', '#f2f2f2'],
    warm: ['#c9184a', '#ff4d6d', '#ff758f', '#ff8fa3', '#ffb3c1', '#ffccd5', '#a4133c', '#800f2f', '#590d22', '#f72585'],
    cool: ['#03045e', '#023e8a', '#0077b6', '#0096c7', '#00b4d8', '#48cae4', '#90e0ef', '#ade8f4', '#caf0f8', '#1d3557']
  }

  const curveTypes = [
    { value: 'monotoneX', label: 'Smooth' },
    { value: 'linear', label: 'Linear' },
    { value: 'natural', label: 'Natural' },
    { value: 'step', label: 'Step' },
    { value: 'stepBefore', label: 'Step Before' },
    { value: 'stepAfter', label: 'Step After' },
    { value: 'basis', label: 'Basis' },
    { value: 'cardinal', label: 'Cardinal' },
    { value: 'catmullRom', label: 'Catmull-Rom' }
  ]

  useEffect(() => {
    console.log('GraphView useEffect triggered - query:', query, 'startTime:', startTime, 'endTime:', endTime, 'searchTrigger:', searchTrigger)
    fetchAggregationData()

  }, [yAxisField, groupByField, aggregationFunc, startTime, endTime, filters, query, histogramInterval, searchTrigger, selectedPercentiles])

  // Handle click outside to close advanced options panel
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (advancedOptionsPanelRef.current && !advancedOptionsPanelRef.current.contains(event.target)) {
        // Check if the click was on the toggle button (to avoid closing when opening)
        const toggleButton = document.querySelector('.graph-customize-btn')
        if (!toggleButton || !toggleButton.contains(event.target)) {
          setShowAdvancedOptions(false)
        }
      }
    }

    if (showAdvancedOptions) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showAdvancedOptions])

  // Save graph customization preferences to localStorage
  useEffect(() => {
    const preferences = {
      aggregationFunc,
      chartType,
      stackedMode,
      showLegend,
      showGrid,
      chartHeight,
      barRadius,
      lineStrokeWidth,
      lineCurveType,
      showTooltip,
      gridOpacity,
      colorScheme,
      xAxisAngle,
      animationDuration,
      dotSize,
      areaOpacity,
      enableGridX,
      yScaleMin,
      yScaleMax,
      axisBottomLegend,
      axisLeftLegend,
      maxGroups,
      showPercentage,
      selectedPercentiles
    }
    localStorage.setItem('graphCustomization', JSON.stringify(preferences))
  }, [
    aggregationFunc, chartType, stackedMode, showLegend, showGrid,
    chartHeight, barRadius, lineStrokeWidth, lineCurveType,
    showTooltip, gridOpacity, colorScheme, xAxisAngle,
    animationDuration, dotSize, areaOpacity, enableGridX,
    yScaleMin, yScaleMax, axisBottomLegend, axisLeftLegend, maxGroups,
    showPercentage, selectedPercentiles
  ])

  // Escape special characters in query values
  // Special characters that need escaping: + , ^ ` : { } " [ ] ( ) ~ ! \
  const escapeQueryValue = (value) => {
    if (typeof value !== 'string') {
      value = String(value)
    }

    // Escape each special character by prefixing with backslash
    // Order matters: escape backslash first to avoid double-escaping
    const escaped = value
      .replace(/\\/g, '\\\\')    // \ -> \\
      .replace(/\+/g, '\\+')     // + -> \+
      .replace(/,/g, '\\,')      // , -> \,
      .replace(/\^/g, '\\^')     // ^ -> \^
      .replace(/`/g, '\\`')      // ` -> \`
      .replace(/:/g, '\\:')      // : -> \:
      .replace(/\{/g, '\\{')     // { -> \{
      .replace(/\}/g, '\\}')     // } -> \}
      .replace(/"/g, '\\"')      // " -> \"
      .replace(/\[/g, '\\[')     // [ -> \[
      .replace(/\]/g, '\\]')     // ] -> \]
      .replace(/\(/g, '\\(')     // ( -> \(
      .replace(/\)/g, '\\)')     // ) -> \)
      .replace(/~/g, '\\~')      // ~ -> \~
      .replace(/!/g, '\\!')      // ! -> \!

    return escaped
  }

  // Escape search query while preserving field:value syntax
  const escapeSearchQuery = (query) => {
    if (!query || query === '*') return query

    // Match field:value patterns, keeping quoted strings together
    // This regex handles: field:value, field:"quoted value", field:[complex]
    const fieldValueRegex = /(\w+):([^\s()]+(?:\s+"[^"]*")?|\[[^\]]*\]|"[^"]*")/g

    return query.replace(fieldValueRegex, (match, field, value) => {
      // Don't escape if value is already in quotes or is a wildcard
      if (value === '*' || value.startsWith('"')) {
        return match
      }

      // Escape the value part only
      const escapedValue = escapeQueryValue(value)
      return `${field}:${escapedValue}`
    })
  }

  const buildQueryWithFilters = (baseQuery) => {
    // Escape the base query
    const escapedBaseQuery = escapeSearchQuery(baseQuery)

    if (filters.length === 0) return escapedBaseQuery

    const filterClauses = filters.map(filter => {
      const escapedValue = escapeQueryValue(filter.value)

      if (filter.type === 'exclude') {
        // For "is not" filters, ensure field exists with field:* AND NOT field:value
        return `(${filter.field}:* AND NOT ${filter.field}:${escapedValue})`
      }
      return `${filter.field}:${escapedValue}`
    })

    if (!baseQuery || baseQuery.trim() === '' || baseQuery === '*') {
      return filterClauses.join(' AND ')
    }

    return `(${escapedBaseQuery}) AND ${filterClauses.join(' AND ')}`
  }

  const formatXAxisDate = (timestamp) => {
    if (!startTime || !endTime) return new Date(timestamp).toLocaleString()

    const rangeMs = endTime - startTime
    const date = new Date(timestamp)

    if (rangeMs <= 60 * 1000) { // <= 1 minute
      // Show HH:MM:SS.mmm for very short ranges
      const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
      const ms = date.getMilliseconds().toString().padStart(3, '0')
      return `${time}.${ms}`
    } else if (rangeMs <= 5 * 60 * 1000) { // <= 5 minutes
      // Show HH:MM:SS for short ranges
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    } else if (rangeMs <= 3600 * 1000) { // <= 1 hour
      // Show HH:MM:SS
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    } else if (rangeMs <= 24 * 3600 * 1000) { // <= 1 day
      // Show HH:MM
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    } else if (rangeMs <= 7 * 24 * 3600 * 1000) { // <= 1 week
      // Show MM/DD HH:MM
      const dateStr = date.toLocaleDateString([], { month: '2-digit', day: '2-digit' })
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      return `${dateStr} ${timeStr}`
    } else if (rangeMs <= 30 * 24 * 3600 * 1000) { // <= 1 month
      // Show MM/DD
      return date.toLocaleDateString([], { month: '2-digit', day: '2-digit' })
    } else { // > 1 month
      // Show YYYY-MM
      return date.toLocaleDateString([], { year: 'numeric', month: '2-digit' })
    }
  }

  const formatYAxisNumber = (value) => {
    const absValue = Math.abs(value)

    if (absValue >= 1000000000) {
      return (value / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B'
    } else if (absValue >= 1000000) {
      return (value / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
    } else if (absValue >= 1000) {
      return (value / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
    }
    return value.toString()
  }

  // Custom tooltip for Recharts
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null

    const timestamp = typeof label === 'string' ? new Date(label) : label
    // Check if we have grouped data by checking if payload has multiple entries with different dataKeys
    const hasGroupedData = payload.length > 1 || (payload.length === 1 && payload[0].dataKey !== 'value')

    return (
      <div style={{
        backgroundColor: '#ffffff',
        padding: '8px 10px',
        border: '1px solid #e5e7eb',
        borderRadius: '6px',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        fontSize: '12px',
        zIndex: 1000,
        position: 'relative'
      }}>
        <div style={{ marginBottom: '6px', fontWeight: 600, color: '#374151', fontSize: '11px' }}>
          {formatTooltipTimestamp(timestamp)}
        </div>
        {payload.map((entry, index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
            <div style={{ width: '10px', height: '10px', backgroundColor: entry.color, borderRadius: '2px' }} />
            <span style={{ color: '#374151', fontWeight: 600 }}>{entry.name || entry.dataKey}</span>
            <span style={{ color: '#6b7280' }}>•</span>
            <span style={{ color: '#374151' }}>
              {showPercentage && hasGroupedData ? `${entry.value.toFixed(1)}%` : entry.value}
            </span>
          </div>
        ))}
      </div>
    )
  }

  // Format compact timestamp for tooltips
  const formatTooltipTimestamp = (date) => {
    const d = date instanceof Date ? date : new Date(date)
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    const seconds = String(d.getSeconds()).padStart(2, '0')
    return `${month}/${day} ${hours}:${minutes}:${seconds}`
  }

  // Nivo tooltip functions removed - now using unified CustomTooltip for Recharts

  const fetchAggregationData = async () => {
    if (!selectedIndex) return

    setLoading(true)
    setError(null)

    try {
      const queryWithFilters = buildQueryWithFilters(query)

      let agg = {}

      // Build aggregation: histogram first, then terms if needed, then metric
      if (groupByField) {
        // Grouped data with histogram + terms
        agg.by_time = {
          histogram: {
            field: timestampField,
            interval: calculateInterval(),
            min_doc_count: 0
          },
          aggs: {
            by_group: {
              terms: {
                field: groupByField,
                size: 100
              }
            }
          }
        }

        // Add Y-axis metric aggregation nested inside terms if Y-axis field is set
        if (yAxisField) {
          if (aggregationFunc === 'percentiles') {
            agg.by_time.aggs.by_group.aggs = {
              percentiles_value: {
                percentiles: {
                  field: yAxisField,
                  percents: selectedPercentiles
                }
              }
            }
          } else {
            agg.by_time.aggs.by_group.aggs = {
              [`${aggregationFunc}_value`]: {
                [aggregationFunc]: {
                  field: yAxisField
                }
              }
            }
          }
        }
      } else if (yAxisField) {
        // Simple metric aggregation without histogram
        // Quickwit might not support metrics nested in histogram without grouping
        // Use a simple metric aggregation instead
        if (aggregationFunc === 'percentiles') {
          agg.percentiles_value = {
            percentiles: {
              field: yAxisField,
              percents: selectedPercentiles
            }
          }
          // Also add histogram for time-based bucketing
          agg.by_time = {
            histogram: {
              field: timestampField,
              interval: calculateInterval(),
              min_doc_count: 0
            },
            aggs: {
              percentiles_value: {
                percentiles: {
                  field: yAxisField,
                  percents: selectedPercentiles
                }
              }
            }
          }
        } else {
          agg[`${aggregationFunc}_value`] = {
            [aggregationFunc]: {
              field: yAxisField
            }
          }
          // Also add histogram for time-based bucketing
          agg.by_time = {
            histogram: {
              field: timestampField,
              interval: calculateInterval(),
              min_doc_count: 0
            },
            aggs: {
              [`${aggregationFunc}_value`]: {
                [aggregationFunc]: {
                  field: yAxisField
                }
              }
            }
          }
        }
      } else {
        // Simple histogram without any metric
        agg.by_time = {
          histogram: {
            field: timestampField,
            interval: calculateInterval(),
            min_doc_count: 0
          }
        }
      }

      const requestBody = {
        query: queryWithFilters,
        max_hits: 0,
        aggs: agg
      }

      if (startTime && endTime) {
        requestBody.start_timestamp = Math.floor(startTime / 1000)
        requestBody.end_timestamp = Math.floor(endTime / 1000)
      }

      const response = await fetch(`${apiUrl}/quickwit/api/v1/${selectedIndex}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(requestBody)
      })

      const data = await response.json()

      if (!response.ok) {
        // Check for bucket limit exceeded error
        if (response.status === 500 && data.message) {
          const bucketLimitMatch = data.message.match(/bucket limit was exceeded\. Limit: (\d+), Current: (\d+)/i)
          if (bucketLimitMatch) {
            throw new Error(`Bucket limit exceeded (Limit: ${bucketLimitMatch[1]}, Current: ${bucketLimitMatch[2]}). Change your time-step`)
          }
        }
        throw new Error(data.message || `HTTP error! status: ${response.status}`)
      }

      // Parse aggregation results
      const timeBuckets = data.aggregations?.by_time?.buckets || []

      // Update bucket times for SearchBar display
      if (timeBuckets.length > 0 && onBucketTimesChange) {
        const firstBucket = timeBuckets[0]
        const lastBucket = timeBuckets[timeBuckets.length - 1]
        onBucketTimesChange({
          first: firstBucket.key / 1000, // Convert ms to seconds
          last: lastBucket.key / 1000
        })
      }

      if (groupByField) {
        // Process grouped data (histogram -> terms structure)
        const formattedData = processGroupedData(timeBuckets)
        setChartData(formattedData)
      } else {
        // Process simple time series data
        if (aggregationFunc === 'percentiles' && yAxisField) {
          // Handle percentiles - create multiple series
          const formattedData = timeBuckets.map(bucket => {
            const name = bucket.key_as_string || new Date(bucket.key).toISOString()
            const dataPoint = { name }

            const percentilesData = bucket.percentiles_value?.values || {}
            selectedPercentiles.forEach(p => {
              const key = `${p}.0`
              dataPoint[`p${p}`] = percentilesData[key] || 0
            })

            return dataPoint
          })
          setChartData(formattedData)
        } else {
          const formattedData = timeBuckets.map(bucket => {
            const name = bucket.key_as_string || new Date(bucket.key).toISOString()
            let value

            if (yAxisField) {
              value = bucket[`${aggregationFunc}_value`]?.value || 0
            } else {
              value = bucket.doc_count
            }

            return { name, value }
          })
          setChartData(formattedData)
        }
      }
    } catch (err) {
      console.error('Error fetching aggregation data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const processGroupedData = (timeBuckets) => {
    // timeBuckets structure: [{ key: timestamp, by_group: { buckets: [{ key: "user1", ... }] } }, ...]
    // We need to transform to: [{ name: "time1", user1: value1, user2: value2 }, ...]

    const dataMap = {}
    const groupTotals = {} // Track total for each group to find top groups

    // First pass: collect all data and calculate totals
    timeBuckets.forEach(timeBucket => {
      const timestamp = timeBucket.key_as_string || new Date(timeBucket.key).toISOString()

      if (!dataMap[timestamp]) {
        dataMap[timestamp] = { name: timestamp }
      }

      const groupBuckets = timeBucket.by_group?.buckets || []
      groupBuckets.forEach(groupBucket => {
        const groupKey = String(groupBucket.key)

        let value
        if (yAxisField) {
          if (aggregationFunc === 'percentiles') {
            // For percentiles with grouping, we need to handle multiple percentile values
            // We'll use the median (p50) for sorting/totals but store all percentiles
            const percentilesData = groupBucket.percentiles_value?.values || {}

            // Store each percentile as a separate series
            selectedPercentiles.forEach(p => {
              const key = `${p}.0`
              const percentileGroupKey = `${groupKey}_p${p}`
              const percentileValue = percentilesData[key] || 0
              dataMap[timestamp][percentileGroupKey] = percentileValue
              groupTotals[percentileGroupKey] = (groupTotals[percentileGroupKey] || 0) + percentileValue
            })

            // Use median for backward compatibility
            value = percentilesData['50.0'] || 0
          } else {
            value = groupBucket[`${aggregationFunc}_value`]?.value || 0
          }
        } else {
          value = groupBucket.doc_count
        }

        if (aggregationFunc !== 'percentiles') {
          dataMap[timestamp][groupKey] = value
          groupTotals[groupKey] = (groupTotals[groupKey] || 0) + value
        }
      })
    })

    // Get top N groups by total value (configurable via maxGroups)
    const topGroups = Object.entries(groupTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, maxGroups)
      .map(([key]) => key)

    // Filter data to only include top groups
    const filteredData = Object.values(dataMap).map(timePoint => {
      const filtered = { name: timePoint.name }
      topGroups.forEach(group => {
        if (timePoint[group] !== undefined) {
          filtered[group] = timePoint[group]
        }
      })
      return filtered
    })

    return {
      data: filteredData,
      groups: topGroups,
      totalGroups: Object.keys(groupTotals).length
    }
  }

  const calculateInterval = () => {
    // If user has selected a specific interval, use it
    if (histogramInterval !== 'auto') {
      // If override is a string (e.g. "1h"), convert to ms, otherwise return as is
      if (typeof histogramInterval === 'string') {
        const unit = histogramInterval.slice(-1);
        const value = parseInt(histogramInterval.slice(0, -1));
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
      return histogramInterval
    }

    // Auto mode: calculate based on time range for ~50 buckets
    if (!startTime || !endTime) return 3600000 // 1 hour default

    const rangeMs = endTime - startTime

    // Ensure we have a positive range
    if (rangeMs <= 0) return 60000 // Default to 1 minute if invalid range

    // Divide by 50 to get approximately 50 data points
    // For very short time ranges, support millisecond intervals
    const rawInterval = rangeMs / 50

    // Minimum 1 millisecond for very short ranges
    const interval = Math.max(1, Math.round(rawInterval))

    return interval
  }

  const validateFieldForYAxis = async (fieldName) => {
    if (!selectedIndex || !fieldName) return false

    setValidatingField(true)

    try {
      const queryWithFilters = buildQueryWithFilters(query)

      const requestBody = {
        query: queryWithFilters,
        max_hits: 0,
        aggs: {
          field_stats: {
            stats: {
              field: fieldName
            }
          }
        }
      }

      if (startTime && endTime) {
        requestBody.start_timestamp = Math.floor(startTime / 1000)
        requestBody.end_timestamp = Math.floor(endTime / 1000)
      }

      const response = await fetch(`${apiUrl}/quickwit/api/v1/${selectedIndex}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        return false
      }

      const data = await response.json()
      const stats = data.aggregations?.field_stats
      return stats != null && stats.count > 0
    } catch (err) {
      console.error('Error validating field:', err)
      return false
    } finally {
      setValidatingField(false)
    }
  }

  const handleDragEnterYAxis = async (e) => {
    e.preventDefault()

    // Get field name from drag effect
    // We'll use a global variable set by FieldsSidebar
    const field = e.dataTransfer.types.find(type => type.startsWith('field:'))?.split(':')[1]

    if (field && field !== draggedField) {
      setDraggedField(field)
      const isValid = await validateFieldForYAxis(field)
      setIsValidYAxisField(isValid)

      // Visual feedback
      if (isValid) {
        e.currentTarget.classList.add('valid-drop')
        e.currentTarget.classList.remove('invalid-drop')
      } else {
        e.currentTarget.classList.add('invalid-drop')
        e.currentTarget.classList.remove('valid-drop')
      }
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove('valid-drop', 'invalid-drop')
  }

  const handleDropYAxis = async (e) => {
    e.preventDefault()
    e.currentTarget.classList.remove('valid-drop', 'invalid-drop')

    const field = e.dataTransfer.getData('field')
    if (!field) return

    // Validate the field before accepting the drop
    const isValid = await validateFieldForYAxis(field)

    if (!isValid) {
      setError(`Cannot use "${field}" for Y-axis: field contains non-numeric values or no data.`)
      return
    }

    setError(null)
    setYAxisField(field)
    setDraggedField(null)
  }

  const isLikelyNumericField = (fieldName) => {
    // Check if field name suggests it's numeric
    const numericKeywords = [
      'count', 'total', 'sum', 'amount', 'price', 'cost', 'value',
      'quantity', 'size', 'length', 'width', 'height', 'weight',
      'number', 'num', 'id', 'score', 'rate', 'ratio', 'percent',
      'age', 'duration', 'time', 'bytes', 'memory', 'cpu', 'disk',
      'latency', 'response', 'request', 'error', 'success', 'failure'
    ]

    const lowerField = fieldName.toLowerCase()

    // Check if field name contains numeric keywords
    return numericKeywords.some(keyword => lowerField.includes(keyword))
  }

  const handleDropGroupBy = (e) => {
    e.preventDefault()
    const field = e.dataTransfer.getData('field')
    if (field) {
      setGroupByField(field)
    }
  }

  // Time range selection handlers
  const getDataIndexFromX = (x, chartElement, dataLength) => {
    if (!chartElement || dataLength === 0) return null

    const rect = chartElement.getBoundingClientRect()
    const relativeX = x - rect.left

    // Account for margins
    const margin = chartType === 'bar'
      ? { left: 60, right: 10 }
      : { left: 60, right: 20 }

    const chartWidth = rect.width - margin.left - margin.right
    const dataWidth = chartWidth / dataLength
    const index = Math.floor((relativeX - margin.left) / dataWidth)

    return Math.max(0, Math.min(index, dataLength - 1))
  }

  const handleMouseDown = (e, currentData) => {
    if (!onTimeRangeChange || !currentData || currentData.length === 0) {
      return
    }

    // Don't start drag if clicking on the legend
    const target = e.target
    if (target.closest('.recharts-legend-wrapper') || target.closest('.recharts-legend-item')) {
      return
    }

    const chartElement = chartInteractionRef.current
    if (!chartElement) {
      return
    }

    // Check if click is within the chart area (excluding margins/axes/legend)
    const rect = chartElement.getBoundingClientRect()
    const relativeX = e.clientX - rect.left
    const relativeY = e.clientY - rect.top

    // Calculate the same margins as used in the chart
    // Legend is always at bottom, so we need to exclude that area from click detection
    const estimatedLeftMargin = 60
    const estimatedRightMargin = 20
    const estimatedTopMargin = 20
    const estimatedBottomMargin = showLegend ? 140 : (Math.abs(xAxisAngle) > 0 ? 120 : 60)

    // Check if click is within the actual chart area
    if (relativeX < estimatedLeftMargin ||
        relativeX > rect.width - estimatedRightMargin ||
        relativeY < estimatedTopMargin ||
        relativeY > rect.height - estimatedBottomMargin) {
      return
    }

    const index = getDataIndexFromX(e.clientX, chartElement, currentData.length)

    if (index !== null) {
      setIsDragging(true)
      setDragStart(index)
      setDragEnd(index)
      e.preventDefault()
      e.stopPropagation()
    }
  }

  const handleMouseMove = (e, currentData) => {
    if (!isDragging || !currentData || currentData.length === 0) return

    const chartElement = chartInteractionRef.current
    if (!chartElement) return

    const index = getDataIndexFromX(e.clientX, chartElement, currentData.length)

    if (index !== null) {
      setDragEnd(index)
    }
  }

  const handleMouseUp = (currentData) => {
    if (!isDragging || dragStart === null || dragEnd === null || !currentData) {
      setIsDragging(false)
      setDragStart(null)
      setDragEnd(null)
      return
    }

    const startIdx = Math.min(dragStart, dragEnd)
    const endIdx = Math.max(dragStart, dragEnd)

    // Only apply selection if there's a meaningful range
    if (startIdx !== endIdx && onTimeRangeChange && currentData[startIdx] && currentData[endIdx]) {
      const startData = currentData[startIdx]
      const endData = currentData[endIdx]

      // Extract timestamps from the chart data
      let startTimestamp, endTimestamp

      if (startData.name && !isNaN(new Date(startData.name).getTime())) {
        // For time-based data
        startTimestamp = Math.floor(new Date(startData.name).getTime() / 1000)
        endTimestamp = Math.floor(new Date(endData.name).getTime() / 1000)
      } else {
        console.error('Unable to extract valid timestamps from chart data', startData, endData)
        setIsDragging(false)
        setDragStart(null)
        setDragEnd(null)
        return
      }

      if (!isNaN(startTimestamp) && !isNaN(endTimestamp)) {
        const formatDate = (date) => {
          return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          })
        }

        const newTimeRange = {
          from: startTimestamp,
          to: endTimestamp,
          label: `Custom: ${formatDate(new Date(startTimestamp * 1000))} → ${formatDate(new Date(endTimestamp * 1000))}`,
          fromIsNow: false,
          toIsNow: false
        }

        onTimeRangeChange(newTimeRange)
      }
    }

    setIsDragging(false)
    setDragStart(null)
    setDragEnd(null)
  }

  const handleMouseLeave = (currentData) => {
    if (isDragging) {
      handleMouseUp(currentData)
    }
  }

  const getSelectionStyle = (currentData) => {
    if (!isDragging || dragStart === null || dragEnd === null || !chartInteractionRef.current || !currentData) return null

    const rect = chartInteractionRef.current.getBoundingClientRect()
    const margin = chartType === 'bar'
      ? { left: 60, right: 10 }
      : { left: 60, right: 20 }

    const chartWidth = rect.width - margin.left - margin.right
    const dataWidth = chartWidth / currentData.length

    const startIdx = Math.min(dragStart, dragEnd)
    const endIdx = Math.max(dragStart, dragEnd)

    const left = margin.left + (startIdx * dataWidth)
    const width = (endIdx - startIdx + 1) * dataWidth

    return {
      position: 'absolute',
      left: `${left}px`,
      width: `${width}px`,
      top: 0,
      bottom: 0,
      backgroundColor: 'rgba(102, 126, 234, 0.2)',
      border: '1px solid rgba(102, 126, 234, 0.5)',
      pointerEvents: 'none',
      zIndex: 10
    }
  }

  const handleClearYAxis = () => {
    setYAxisField(null)
    if (!groupByField) {
      setChartData([])
      setError(null)
    }
  }

  const handleClearGroupBy = () => {
    setGroupByField(null)
  }

  // Check if we have valid data to display
  const hasData = () => {
    if (loading || error || (!yAxisField && !groupByField)) {
      return false
    }
    return Array.isArray(chartData)
      ? chartData.length > 0
      : (chartData.data && chartData.data.length > 0)
  }

  const renderChart = () => {
    if (loading) {
      return <div className="loading-state">Loading chart data...</div>
    }

    if (error) {
      return <div className="error-state">Error loading data: {error}</div>
    }



    // Check if we have any data
    const hasDataNow = Array.isArray(chartData)
      ? chartData.length > 0
      : (chartData.data && chartData.data.length > 0)

    if (!hasDataNow) {
      return (
        <div className="empty-state">
          No data available for the selected fields and time range
        </div>
      )
    }

    // Determine if we have grouped data
    const isGrouped = chartData.groups && chartData.groups.length > 0
    const data = isGrouped ? chartData.data : chartData
    const groups = isGrouped ? chartData.groups : null

    // Get colors from selected color scheme
    const colors = colorSchemes[colorScheme] || colorSchemes.default

    // Calculate margins based on x-axis angle and legend position
    // Minimal margins to maximize chart area - Legend is always at bottom
    const leftMargin = 5
    // Bottom margin needs space for X-axis labels (60-80px) plus legend if shown (80-100px)
    const xAxisSpace = Math.abs(xAxisAngle) > 0 ? 80 : 60
    const legendSpace = showLegend ? 100 : 0
    const bottomMargin = xAxisSpace + legendSpace
    const rightMargin = 5
    const topMargin = 5

    // Prepare margin object for Recharts
    const margin = {
      top: topMargin,
      right: rightMargin,
      bottom: bottomMargin,
      left: leftMargin
    }

    // Get visible keys (filter hidden series)
    let allKeys = groups || ['value']

    // For percentiles without grouping, use percentile series names
    if (aggregationFunc === 'percentiles' && !groupByField && yAxisField) {
      allKeys = selectedPercentiles.map(p => `p${p}`)
    }

    const visibleKeys = allKeys.filter(key => !hiddenSeries.has(key))

    // Handle legend click
    const handleLegendClick = (entry) => {
      setHiddenSeries(prev => {
        const clickedKey = entry.value || entry.dataKey
        // If only this series is visible, show all series
        if (prev.size > 0 && !prev.has(clickedKey)) {
          const allHidden = allKeys.every(key => key === clickedKey || prev.has(key))
          if (allHidden) {
            return new Set() // Show all
          }
        }
        // Otherwise, hide all except this one
        const newSet = new Set(allKeys.filter(key => key !== clickedKey))
        return newSet
      })
    }

    if (chartType === 'bar') {
      // Bar chart with Recharts
      let finalData = [...data]

      // Convert to percentage if enabled
      if (showPercentage && isGrouped) {
        finalData = finalData.map(dataPoint => {
          const newPoint = { name: dataPoint.name }

          // Calculate total for this time bucket
          let total = 0
          allKeys.forEach(key => {
            total += dataPoint[key] || 0
          })

          // Convert each value to percentage
          if (total > 0) {
            allKeys.forEach(key => {
              newPoint[key] = ((dataPoint[key] || 0) / total) * 100
            })
          } else {
            allKeys.forEach(key => {
              newPoint[key] = 0
            })
          }

          return newPoint
        })
      }

      return (
        <div
          ref={(el) => {
            chartContainerRef.current = el
            chartInteractionRef.current = el
          }}
          style={{ height: '100%', width: '100%', position: 'relative', userSelect: 'none' }}
          onMouseDown={(e) => handleMouseDown(e, finalData)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={finalData} margin={margin}>
              {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={gridOpacity} vertical={enableGridX} />}
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: '#6b7280' }}
                tickLine={{ stroke: '#6b7280' }}
                tickMargin={40}
                angle={xAxisAngle}
                
                tickFormatter={(value) => formatXAxisDate(value)}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#6b7280' }}
                tickLine={{ stroke: '#6b7280' }}
                tickFormatter={(value) => showPercentage && isGrouped ? `${value.toFixed(1)}%` : formatYAxisNumber(value)}
                domain={showPercentage && isGrouped ? [0, 100] : [yScaleMin === 'auto' ? 'auto' : Number(yScaleMin), yScaleMax === 'auto' ? 'auto' : Number(yScaleMax)]}
                label={axisLeftLegend || (showPercentage && isGrouped ? 'Percentage (%)' : (yAxisField ? `${aggregationFunc} of ${yAxisField}` : 'Count')) ? { value: axisLeftLegend || (showPercentage && isGrouped ? 'Percentage (%)' : (yAxisField ? `${aggregationFunc} of ${yAxisField}` : 'Count')), angle: -90, position: 'insideLeft' } : undefined}
              />
              {showTooltip && <Tooltip
                content={<CustomTooltip />}
                wrapperStyle={{ opacity: 1, zIndex: 1000 }}
                contentStyle={{ backgroundColor: '#ffffff', opacity: 1 }}
              />}
              {allKeys.map((key) => {
                const originalIndex = allKeys.indexOf(key)
                const isHidden = hiddenSeries.has(key)
                return (
                  <Bar
                    key={key}
                    dataKey={key}
                    fill={colors[originalIndex % colors.length]}
                    stackId={stackedMode ? 'stack' : undefined}
                    radius={[barRadius, barRadius, 0, 0]}
                    isAnimationActive={animationDuration > 0}
                    animationDuration={animationDuration}
                    hide={isHidden}
                  />
                )
              })}
              {showLegend && (
                <Legend
                  verticalAlign='bottom'
                  align='center'
                  layout='horizontal'
                  onClick={handleLegendClick}
                  iconSize={10}
                  wrapperStyle={{
                    cursor: 'pointer',
                    paddingTop: 80
                  }}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
          {/* Overlay for mouse interaction - only active when dragging */}
          {isDragging && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                cursor: 'col-resize',
                zIndex: 5
              }}
              onMouseMove={(e) => handleMouseMove(e, finalData)}
              onMouseUp={() => handleMouseUp(finalData)}
              onMouseLeave={() => handleMouseLeave(finalData)}
            />
          )}
          {/* Selection overlay */}
          {isDragging && dragStart !== null && dragEnd !== null && (
            <div style={getSelectionStyle(finalData)} />
          )}
        </div>
      )
    } else {
      // Line/Area chart with Recharts
      const ChartComponent = chartType === 'area' ? AreaChart : LineChart
      const SeriesComponent = chartType === 'area' ? Area : Line

      // Map curve type from Nivo to Recharts
      const curveTypeMap = {
        'linear': 'linear',
        'monotoneX': 'monotone',
        'monotoneY': 'monotone',
        'natural': 'natural',
        'step': 'step',
        'stepBefore': 'stepBefore',
        'stepAfter': 'stepAfter',
        'basis': 'basis',
        'cardinal': 'cardinal',
        'catmullRom': 'catmullRom'
      }
      const rechartsCurve = curveTypeMap[lineCurveType] || 'linear'

      // Prepare data for line/area chart
      const finalData = [...data]

      return (
        <div
          ref={chartInteractionRef}
          style={{ height: '100%', width: '100%', position: 'relative', userSelect: 'none' }}
          onMouseDown={(e) => handleMouseDown(e, finalData)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ChartComponent data={finalData} margin={margin}>
              {showGrid && (
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e5e7eb"
                  opacity={gridOpacity}
                  vertical={enableGridX}
                />
              )}
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: '#6b7280' }}
                tickLine={{ stroke: '#6b7280' }}
                tickMargin={40}
                angle={xAxisAngle}
                
                tickFormatter={(value) => formatXAxisDate(value)}
                
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#6b7280' }}
                tickLine={{ stroke: '#6b7280' }}
                tickFormatter={(value) => formatYAxisNumber(value)}
                domain={[
                  yScaleMin === 'auto' ? 'auto' : Number(yScaleMin),
                  yScaleMax === 'auto' ? 'auto' : Number(yScaleMax)
                ]}
                label={axisLeftLegend ? {
                  value: axisLeftLegend,
                  angle: -90,
                  position: 'insideLeft',
                  style: { textAnchor: 'middle' }
                } : (yAxisField ? {
                  value: `${aggregationFunc} of ${yAxisField}`,
                  angle: -90,
                  position: 'insideLeft',
                  style: { textAnchor: 'middle' }
                } : {
                  value: 'Count',
                  angle: -90,
                  position: 'insideLeft',
                  style: { textAnchor: 'middle' }
                })}
              />
              {showTooltip && <Tooltip
                content={<CustomTooltip />}
                wrapperStyle={{ opacity: 1, zIndex: 1000 }}
                contentStyle={{ backgroundColor: '#ffffff', opacity: 1 }}
              />}
              {allKeys.map((key) => {
                const originalIndex = allKeys.indexOf(key)
                const isHidden = hiddenSeries.has(key)
                return (
                  <SeriesComponent
                    key={key}
                    type={rechartsCurve}
                    dataKey={key}
                    stroke={colors[originalIndex % colors.length]}
                    fill={chartType === 'area' ? colors[originalIndex % colors.length] : undefined}
                    fillOpacity={chartType === 'area' ? areaOpacity : undefined}
                    strokeWidth={lineStrokeWidth}
                    dot={dotSize > 0 ? { r: dotSize } : false}
                    isAnimationActive={animationDuration > 0}
                    animationDuration={animationDuration}
                    stackId={stackedMode ? 'stack' : undefined}
                    hide={isHidden}
                  />
                )
              })}
              {showLegend && (
                <Legend
                  verticalAlign='bottom'
                  align='center'
                  layout='horizontal'
                  onClick={handleLegendClick}
                  iconSize={10}
                  wrapperStyle={{
                    cursor: 'pointer',
                    paddingTop: 80
                  }}
                />
              )}
            </ChartComponent>
          </ResponsiveContainer>
          {/* Overlay for mouse interaction - only active when dragging */}
          {isDragging && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                cursor: 'col-resize',
                zIndex: 5
              }}
              onMouseMove={(e) => handleMouseMove(e, finalData)}
              onMouseUp={() => handleMouseUp(finalData)}
              onMouseLeave={() => handleMouseLeave(finalData)}
            />
          )}
          {/* Selection overlay */}
          {isDragging && dragStart !== null && dragEnd !== null && (
            <div style={getSelectionStyle(finalData)} />
          )}
        </div>
      )
    }
  }

  return (
    <div className="graph-view">
      <div className="graph-configuration">
        <div className="config-section">
          <h3>Y-Axis Field</h3>
          <div
            className={`drop-zone y-axis-drop-zone ${yAxisField ? 'has-field' : ''}`}
            onDragEnter={handleDragEnterYAxis}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDropYAxis}
          >
            {yAxisField ? (
              <div className="selected-field-display">
                <span className="field-icon">t</span>
                <span className="field-name">{yAxisField}</span>
                <button
                  className="clear-field-btn"
                  onClick={handleClearYAxis}
                  title="Clear field"
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="drop-zone-placeholder">
                Drag a numeric field here for Y-axis
              </div>
            )}
          </div>
        </div>

        <div className="config-section">
          <h3>Aggregation Function</h3>
          <select
            className="aggregation-select"
            value={aggregationFunc}
            onChange={(e) => setAggregationFunc(e.target.value)}
          >
            {aggregationFunctions.map(func => (
              <option key={func.value} value={func.value}>
                {func.label}
              </option>
            ))}
          </select>
        </div>

        <div className="config-section">
          <h3>Group By / Breakdown</h3>
          <div
            className={`drop-zone ${groupByField ? 'has-field' : ''}`}
            onDragOver={handleDragOver}
            onDrop={handleDropGroupBy}
          >
            {groupByField ? (
              <div className="selected-field-display">
                <span className="field-icon">t</span>
                <span className="field-name">{groupByField}</span>
                <button
                  className="clear-field-btn"
                  onClick={handleClearGroupBy}
                  title="Clear field"
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="drop-zone-placeholder">
                Drag and drop a field to group by
              </div>
            )}
          </div>
        </div>

        <div className="config-section config-section-customize">
          <button
            className="graph-customize-icon-btn"
            onClick={() => setShowAdvancedOptions(true)}
            title="Customize chart"
          >
            ⚙️
          </button>
        </div>

      </div>

      {showAdvancedOptions && (
        <div className="advanced-options-panel" ref={advancedOptionsPanelRef}>
          <div className="advanced-options-header">
            <h3 className="advanced-options-title">Chart Customization</h3>
            <button
              className="advanced-options-close"
              onClick={() => setShowAdvancedOptions(false)}
              title="Close"
            >
              ×
            </button>
          </div>
          <div className="advanced-options-content">
            <div className="advanced-options-grid">
              <div className="advanced-option">
                <label>Chart Type</label>
                <div className="button-group">
                  {chartTypes.map(type => (
                    <button
                      key={type.value}
                      className={`mini-btn ${chartType === type.value ? 'active' : ''}`}
                      onClick={() => setChartType(type.value)}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="advanced-option">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={stackedMode}
                    onChange={(e) => setStackedMode(e.target.checked)}
                    disabled={chartType === 'line' || chartType === 'area'}
                  />
                  <span>Stacked Mode{(chartType === 'line' || chartType === 'area') ? ' (only for Bar charts)' : ''}</span>
                </label>
              </div>

              <div className="advanced-option">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={showLegend}
                    onChange={(e) => setShowLegend(e.target.checked)}
                  />
                  <span>Show Legend</span>
                </label>
              </div>

              <div className="advanced-option">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => setShowGrid(e.target.checked)}
                  />
                  <span>Show Grid</span>
                </label>
              </div>

              <div className="advanced-option">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={showPercentage}
                    onChange={(e) => setShowPercentage(e.target.checked)}
                    disabled={chartType !== 'bar' || !groupByField}
                  />
                  <span>Show Percentage{(chartType !== 'bar' || !groupByField) ? ' (only for Bar charts with Group-by)' : ''}</span>
                </label>
              </div>

              <div className="advanced-option">
                <label>Percentiles {aggregationFunc !== 'percentiles' ? '(only for Percentiles aggregation)' : ''}</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                  {[1, 5, 25, 50, 75, 95, 99].map(p => (
                    <label key={p} className="checkbox-label" style={{ display: 'inline-flex', marginRight: '12px' }}>
                      <input
                        type="checkbox"
                        checked={selectedPercentiles.includes(p)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPercentiles([...selectedPercentiles, p].sort((a, b) => a - b))
                          } else {
                            setSelectedPercentiles(selectedPercentiles.filter(x => x !== p))
                          }
                        }}
                        disabled={aggregationFunc !== 'percentiles'}
                      />
                      <span>p{p}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="advanced-option">
                <label>Chart Height</label>
                <div className="slider-container">
                  <input
                    type="range"
                    min="300"
                    max="1000"
                    step="50"
                    value={chartHeight}
                    onChange={(e) => setChartHeight(Number(e.target.value))}
                  />
                  <span className="slider-value">{chartHeight}px</span>
                </div>
              </div>

              <div className="advanced-option">
                <label>Color Scheme</label>
                <select
                  value={colorScheme}
                  onChange={(e) => setColorScheme(e.target.value)}
                  className="advanced-select"
                >
                  <option value="default">Default</option>
                  <option value="vibrant">Vibrant</option>
                  <option value="pastel">Pastel</option>
                  <option value="ocean">Ocean</option>
                  <option value="sunset">Sunset</option>
                  <option value="forest">Forest</option>
                  <option value="monochrome">Monochrome</option>
                  <option value="warm">Warm</option>
                  <option value="cool">Cool</option>
                </select>
              </div>

              <div className="advanced-option">
                <label>Grid Opacity</label>
                <div className="slider-container">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={gridOpacity}
                    onChange={(e) => setGridOpacity(Number(e.target.value))}
                  />
                  <span className="slider-value">{gridOpacity.toFixed(1)}</span>
                </div>
              </div>

              <div className="advanced-option">
                <label>Max Groups (Breakdown)</label>
                <div className="slider-container">
                  <input
                    type="range"
                    min="5"
                    max="50"
                    step="5"
                    value={maxGroups}
                    onChange={(e) => setMaxGroups(Number(e.target.value))}
                    title="Maximum number of groups to display when using Group By"
                  />
                  <span className="slider-value">{maxGroups}</span>
                </div>
              </div>

              <div className="advanced-option">
                <label>X-Axis Label Angle</label>
                <div className="slider-container">
                  <input
                    type="range"
                    min="-90"
                    max="90"
                    step="15"
                    value={xAxisAngle}
                    onChange={(e) => setXAxisAngle(Number(e.target.value))}
                  />
                  <span className="slider-value">{xAxisAngle}°</span>
                </div>
              </div>

              <div className="advanced-option">
                <label>Animation Duration</label>
                <div className="slider-container">
                  <input
                    type="range"
                    min="0"
                    max="2000"
                    step="100"
                    value={animationDuration}
                    onChange={(e) => setAnimationDuration(Number(e.target.value))}
                  />
                  <span className="slider-value">{animationDuration}ms</span>
                </div>
              </div>

              {chartType === 'bar' && (
                <>
                  <div className="advanced-option">
                    <label>Bar Corner Radius</label>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0"
                        max="20"
                        step="1"
                        value={barRadius}
                        onChange={(e) => setBarRadius(Number(e.target.value))}
                      />
                      <span className="slider-value">{barRadius}px</span>
                    </div>
                  </div>

                </>
              )}

              {(chartType === 'line' || chartType === 'area') && (
                <>
                  <div className="advanced-option">
                    <label>Line Curve Type</label>
                    <select
                      value={lineCurveType}
                      onChange={(e) => setLineCurveType(e.target.value)}
                      className="advanced-select"
                    >
                      {curveTypes.map(curve => (
                        <option key={curve.value} value={curve.value}>
                          {curve.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="advanced-option">
                    <label>Line Stroke Width</label>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="1"
                        max="10"
                        step="0.5"
                        value={lineStrokeWidth}
                        onChange={(e) => setLineStrokeWidth(Number(e.target.value))}
                      />
                      <span className="slider-value">{lineStrokeWidth}px</span>
                    </div>
                  </div>

                  {chartType === 'line' && (
                    <div className="advanced-option">
                      <label>Dot Size</label>
                      <div className="slider-container">
                        <input
                          type="range"
                          min="0"
                          max="10"
                          step="0.5"
                          value={dotSize}
                          onChange={(e) => setDotSize(Number(e.target.value))}
                        />
                        <span className="slider-value">{dotSize}px</span>
                      </div>
                    </div>
                  )}

                  {chartType === 'area' && (
                    <div className="advanced-option">
                      <label>Area Opacity</label>
                      <div className="slider-container">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={areaOpacity}
                          onChange={(e) => setAreaOpacity(Number(e.target.value))}
                        />
                        <span className="slider-value">{areaOpacity.toFixed(1)}</span>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="advanced-option">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={showTooltip}
                    onChange={(e) => setShowTooltip(e.target.checked)}
                  />
                  <span>Show Tooltip</span>
                </label>
              </div>

              <div className="advanced-option">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={enableGridX}
                    onChange={(e) => setEnableGridX(e.target.checked)}
                  />
                  <span>Show Vertical Grid</span>
                </label>
              </div>

              <div className="advanced-option">
                <label>Y-Axis Min Value</label>
                <input
                  type="text"
                  value={yScaleMin}
                  onChange={(e) => setYScaleMin(e.target.value)}
                  placeholder="auto"
                  className="advanced-input"
                />
              </div>

              <div className="advanced-option">
                <label>Y-Axis Max Value</label>
                <input
                  type="text"
                  value={yScaleMax}
                  onChange={(e) => setYScaleMax(e.target.value)}
                  placeholder="auto"
                  className="advanced-input"
                />
              </div>

              <div className="advanced-option">
                <label>X-Axis Label</label>
                <input
                  type="text"
                  value={axisBottomLegend}
                  onChange={(e) => setAxisBottomLegend(e.target.value)}
                  placeholder="Optional"
                  className="advanced-input"
                />
              </div>

              <div className="advanced-option">
                <label>Y-Axis Label</label>
                <input
                  type="text"
                  value={axisLeftLegend}
                  onChange={(e) => setAxisLeftLegend(e.target.value)}
                  placeholder="Optional (auto-generated)"
                  className="advanced-input"
                />
              </div>

            </div>
          </div>
        </div>
      )}

      <div className="graph-display">
        {renderChart()}
      </div>
    </div>
  )
}

export default GraphView
