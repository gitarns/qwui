import { useMemo, useEffect, useState, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import './Histogram.css'

function Histogram({ data, timeRange, onTimeRangeChange, totalHits }) {
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState(null)
  const [dragEnd, setDragEnd] = useState(null)
  const containerRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    // Check if dark mode is active
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark-mode'))
    }

    checkDarkMode()

    // Watch for dark mode changes
    const observer = new MutationObserver(checkDarkMode)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })

    return () => observer.disconnect()
  }, [])
  const formatTimestamp = (date, timeRange) => {
    if (!timeRange) return date.toLocaleTimeString()

    const now = Math.floor(Date.now() / 1000)
    const endTimestamp = timeRange.to !== null ? timeRange.to : now
    const rangeSeconds = endTimestamp - timeRange.from

    if (rangeSeconds <= 3600) { // <= 1 hour
      return date.toLocaleTimeString() // HH:MM:SS
    } else if (rangeSeconds <= 86400) { // <= 1 day
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) // HH:MM
    } else if (rangeSeconds <= 30 * 86400) { // <= 1 month
      return date.toLocaleDateString([], { month: '2-digit', day: '2-digit' }) // MM/DD
    } else { // > 1 month
      return date.toLocaleDateString([], { year: 'numeric', month: '2-digit' }) // YYYY-MM
    }
  }

  const chartData = useMemo(() => {
    if (!data || !data.buckets || data.buckets.length === 0) {
      return []
    }

    return data.buckets.map((bucket) => {
      // Use bucket.key (timestamp in milliseconds) for precise tooltip
      const date = new Date(bucket.key)
      const dateStr = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
      const hours = date.getHours().toString().padStart(2, '0')
      const minutes = date.getMinutes().toString().padStart(2, '0')
      const seconds = date.getSeconds().toString().padStart(2, '0')
      const ms = date.getMilliseconds().toString().padStart(3, '0')

      const tooltiptime = `${dateStr}, ${hours}:${minutes}:${seconds}.${ms}`

      return {
        timestamp: bucket.key,
        count: bucket.doc_count,
        formattedTime: formatTimestamp(date, timeRange),
        tooltiptime: tooltiptime,
        // Use timestamp as unique key for recharts
        id: bucket.key
      }
    })
  }, [data, timeRange])

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) {
      return null
    }

    // Only show the first item's tooltip
    const item = payload[0]

    return (
      <div className="histogram-tooltip">
        <p className="tooltip-time">{item.payload.tooltiptime}</p>
        <p className="tooltip-count">{item.value.toLocaleString()} documents</p>
      </div>
    )
  }

  const getChartDimensions = () => {
    if (!containerRef.current) return null
    const rect = containerRef.current.getBoundingClientRect()
    // Account for chart margins
    const margin = { left: 60, right: 10, top: 10, bottom: 40 }
    return {
      width: rect.width - margin.left - margin.right,
      height: rect.height - margin.top - margin.bottom,
      left: margin.left,
      top: margin.top
    }
  }

  const getDataIndexFromX = (x) => {
    const dims = getChartDimensions()
    if (!dims || !chartData || chartData.length === 0) return null

    const relativeX = x - dims.left
    const barWidth = dims.width / chartData.length
    const index = Math.floor(relativeX / barWidth)

    return Math.max(0, Math.min(index, chartData.length - 1))
  }

  const handleMouseDown = (e) => {
    if (!onTimeRangeChange) return

    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const index = getDataIndexFromX(x)

    if (index !== null) {
      setIsDragging(true)
      setDragStart(index)
      setDragEnd(index)
    }
  }

  const handleMouseMove = (e) => {
    if (!isDragging) return

    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const index = getDataIndexFromX(x)

    if (index !== null) {
      setDragEnd(index)
    }
  }

  const handleMouseUp = () => {
    if (!isDragging || dragStart === null || dragEnd === null) {
      setIsDragging(false)
      setDragStart(null)
      setDragEnd(null)
      return
    }

    // Get the start and end indices (in correct order)
    const startIdx = Math.min(dragStart, dragEnd)
    const endIdx = Math.max(dragStart, dragEnd)

    // Only apply selection if there's a meaningful range
    if (startIdx !== endIdx && onTimeRangeChange && chartData[startIdx] && chartData[endIdx]) {
      const startTimestamp = Math.floor(chartData[startIdx].timestamp / 1000)
      const endTimestamp = Math.floor(chartData[endIdx].timestamp / 1000)

      // Validate timestamps before creating time range
      if (!isNaN(startTimestamp) && !isNaN(endTimestamp)) {
        const newTimeRange = {
          from: startTimestamp,
          to: endTimestamp,
          label: `Custom: ${chartData[startIdx].formattedTime} → ${chartData[endIdx].formattedTime}`
        }

        onTimeRangeChange(newTimeRange)
      } else {
        console.error('Invalid timestamps:', startTimestamp, endTimestamp)
      }
    }

    setIsDragging(false)
    setDragStart(null)
    setDragEnd(null)
  }

  const handleMouseLeave = () => {
    if (isDragging) {
      handleMouseUp()
    }
  }

  // Calculate selection overlay position
  const getSelectionStyle = () => {
    if (!isDragging || dragStart === null || dragEnd === null) return null

    const dims = getChartDimensions()
    if (!dims || !chartData || chartData.length === 0) return null

    const barWidth = dims.width / chartData.length
    const startIdx = Math.min(dragStart, dragEnd)
    const endIdx = Math.max(dragStart, dragEnd)

    const left = dims.left + (startIdx * barWidth)
    const width = (endIdx - startIdx + 1) * barWidth

    return {
      position: 'absolute',
      left: `${left}px`,
      top: `${dims.top}px`,
      width: `${width}px`,
      height: `${dims.height}px`,
      backgroundColor: isDarkMode ? 'rgba(59, 130, 246, 0.2)' : 'rgba(0, 107, 180, 0.2)',
      border: isDarkMode ? '1px solid rgba(59, 130, 246, 0.6)' : '1px solid rgba(0, 107, 180, 0.6)',
      pointerEvents: 'none',
      zIndex: 10
    }
  }

  if (!data || !data.buckets || data.buckets.length === 0) {
    return null
  }

  // Colors that adapt to dark mode
  const colors = {
    grid: isDarkMode ? '#404040' : '#d3dae6',
    axis: isDarkMode ? '#9ca3af' : '#69707d',
    bar: isDarkMode ? '#3b82f6' : '#006bb4',
    cursorFill: isDarkMode ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0, 107, 180, 0.1)'
  }

  const selectionStyle = getSelectionStyle()

  // Don't render chart if there's no data
  if (!chartData || chartData.length === 0) {
    return null
  }

  return (
    <div
      className="histogram-container"
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      style={{ position: 'relative', cursor: onTimeRangeChange ? 'crosshair' : 'default', userSelect: 'none' }}
    >
      {selectionStyle && <div style={selectionStyle} />}
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={1}>
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: 60, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />

          <XAxis
            dataKey="id"
            tick={{ fontSize: 11, fill: colors.axis }}
            tickFormatter={(value) => {
              // Find the data item with this id and return its formattedTime
              const item = chartData.find(d => d.id === value)
              return item ? item.formattedTime : ''
            }}
            minTickGap={100}
            angle={0}
            textAnchor="middle"
            height={30}
          />
          <YAxis
            stroke={colors.axis}
            tick={{ fontSize: 11, fill: colors.axis }}
            tickLine={false}
            tickFormatter={(value) => value.toLocaleString()}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: colors.cursorFill }}
            isAnimationActive={false}
          />
          <Bar dataKey="count" fill={colors.bar} />
        </BarChart >
      </ResponsiveContainer >
    </div >
  )
}

export default Histogram
