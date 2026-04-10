import { useState, useRef, useEffect } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import './TimeRangePicker.css'

const QUICK_RANGES = [
  { label: 'Last 5 minutes', value: 5, unit: 'minutes' },
  { label: 'Last 15 minutes', value: 15, unit: 'minutes' },
  { label: 'Last 30 minutes', value: 30, unit: 'minutes' },
  { label: 'Last 1 hour', value: 1, unit: 'hours' },
  { label: 'Last 6 hours', value: 6, unit: 'hours' },
  { label: 'Last 12 hours', value: 12, unit: 'hours' },
  { label: 'Last 24 hours', value: 24, unit: 'hours' },
  { label: 'Last 7 days', value: 7, unit: 'days' },
  { label: 'Last 30 days', value: 30, unit: 'days' },
  { label: 'Last 90 days', value: 90, unit: 'days' },
  { label: 'Last 1 year', value: 1, unit: 'years' },
]

const RELATIVE_UNITS = [
  { value: 'seconds', label: 'Seconds' },
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
  { value: 'years', label: 'Years' },
]

function TimeRangePicker({ onTimeRangeChange, value }) {
  const [quickSelectOpen, setQuickSelectOpen] = useState(false)
  const [fromPopupOpen, setFromPopupOpen] = useState(false)
  const [toPopupOpen, setToPopupOpen] = useState(false)

  const [fromTab, setFromTab] = useState('relative')
  const [toTab, setToTab] = useState('now')

  const [fromDate, setFromDate] = useState(new Date(Date.now() - 15 * 60 * 1000))
  const [toDate, setToDate] = useState(new Date())

  const [fromIsNow, setFromIsNow] = useState(false)
  const [toIsNow, setToIsNow] = useState(true)

  const [relativeFromValue, setRelativeFromValue] = useState('15')
  const [relativeFromUnit, setRelativeFromUnit] = useState('minutes')
  const [relativeFromDirection, setRelativeFromDirection] = useState('ago')

  const [relativeToValue, setRelativeToValue] = useState('0')
  const [relativeToUnit, setRelativeToUnit] = useState('seconds')
  const [relativeToDirection, setRelativeToDirection] = useState('ago')

  const [displayLabel, setDisplayLabel] = useState('Last 15 minutes')
  const [activeRelativeRange, setActiveRelativeRange] = useState('Last 15 minutes')
  const [showExpandedView, setShowExpandedView] = useState(false)

  const [customQuickValue, setCustomQuickValue] = useState('15')
  const [customQuickUnit, setCustomQuickUnit] = useState('minutes')

  const [fromDateInput, setFromDateInput] = useState('')
  const [toDateInput, setToDateInput] = useState('')

  const quickSelectRef = useRef(null)
  const fromPopupRef = useRef(null)
  const toPopupRef = useRef(null)

  // Initialize with default range on mount
  useEffect(() => {
    const now = Date.now()
    const from = now - 15 * 60 * 1000

    onTimeRangeChange({
      from: Math.floor(from / 1000),
      to: Math.floor(now / 1000),
      label: 'Last 15 minutes',
      fromIsNow: false,
      toIsNow: true
    })
  }, []) // Run only once on mount

  // Sync with external value prop changes (e.g., from histogram selection)
  useEffect(() => {
    if (value && value.from !== undefined && value.to !== undefined) {
      setFromDate(new Date(value.from * 1000))
      setToDate(new Date(value.to * 1000))
      setFromIsNow(value.fromIsNow || false)
      setToIsNow(value.toIsNow || false)

      // Update UI state based on the label
      if (value.label) {
        if (value.label.startsWith('Custom:')) {
          // Custom range (e.g. from histogram selection)
          // Switch to absolute view to show the specific dates
          setActiveRelativeRange(null)
          setFromTab('absolute')
          setToTab('absolute')
          setDisplayLabel(value.label)
        } else {
          // Standard or relative range
          setActiveRelativeRange(value.label)
          setDisplayLabel(value.label)

          // Parse the label to set the tabs and relative values
          // Format: "Last <value> <unit>"
          const match = value.label.match(/^Last (\d+) (.+)$/)
          if (match) {
            const val = match[1]
            let unit = match[2]
            // Normalize unit to plural if needed (e.g., "hour" -> "hours")
            if (!unit.endsWith('s')) {
              unit += 's'
            }

            setFromTab('relative')
            setToTab('now')
            setRelativeFromValue(val)
            setRelativeFromUnit(unit)
            setRelativeFromDirection('ago')
          } else {
            // Fallback if label doesn't match "Last X Y" pattern
            // but we want to default to relative/now if it looks like a quick range
            // For now, just keep existing tabs or default behavior
          }
        }
      }
    }
  }, [value])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (quickSelectRef.current && !quickSelectRef.current.contains(event.target)) {
        setQuickSelectOpen(false)
      }
      if (fromPopupRef.current && !fromPopupRef.current.contains(event.target)) {
        setFromPopupOpen(false)
      }
      if (toPopupRef.current && !toPopupRef.current.contains(event.target)) {
        setToPopupOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const getMillisecondsFromUnit = (value, unit) => {
    const num = parseFloat(value)
    switch (unit) {
      case 'seconds': return num * 1000
      case 'minutes': return num * 60 * 1000
      case 'hours': return num * 60 * 60 * 1000
      case 'days': return num * 24 * 60 * 60 * 1000
      case 'weeks': return num * 7 * 24 * 60 * 60 * 1000
      case 'months': return num * 30 * 24 * 60 * 60 * 1000
      case 'years': return num * 365 * 24 * 60 * 60 * 1000
      default: return 0
    }
  }

  const applyQuickRange = (range) => {
    const now = Date.now()
    const ms = getMillisecondsFromUnit(range.value, range.unit)
    const from = now - ms
    const to = now

    setFromDate(new Date(from))
    setToDate(new Date(to))
    setFromIsNow(false)
    setToIsNow(true)
    setFromTab('relative')
    setToTab('now')
    setRelativeFromValue(String(range.value))
    setRelativeFromUnit(range.unit)
    setRelativeFromDirection('ago')
    setDisplayLabel(range.label)
    setActiveRelativeRange(range.label)
    setShowExpandedView(false)
    setQuickSelectOpen(false)

    onTimeRangeChange({
      from: Math.floor(from / 1000), // Convert to seconds for Quickwit
      to: Math.floor(to / 1000), // Convert to seconds for Quickwit
      label: range.label,
      fromIsNow: false,
      toIsNow: true
    })
  }

  const applyCustomQuickRange = () => {
    if (!customQuickValue || parseFloat(customQuickValue) <= 0) return

    const value = parseFloat(customQuickValue)
    const label = `Last ${value} ${customQuickUnit}`

    applyQuickRange({
      label,
      value,
      unit: customQuickUnit
    })
  }

  const applyFromTime = () => {
    let from
    const now = Date.now()

    if (fromTab === 'relative') {
      const ms = getMillisecondsFromUnit(relativeFromValue, relativeFromUnit)
      from = relativeFromDirection === 'ago' ? now - ms : now + ms
      setFromDate(new Date(from))
      setFromIsNow(false)

      // Check if this matches a relative range pattern (from relative ago + to now)
      if (relativeFromDirection === 'ago' && toIsNow) {
        const rangeLabel = generateRelativeRangeLabel(relativeFromValue, relativeFromUnit)
        setActiveRelativeRange(rangeLabel)
        setShowExpandedView(false)
      } else {
        setActiveRelativeRange(null)
        setShowExpandedView(false)
      }
    } else {
      from = fromDate.getTime()
      setFromIsNow(false)
      setActiveRelativeRange(null)
      setShowExpandedView(false)
    }

    setFromPopupOpen(false)

    let labelToUse = null
    if (fromTab === 'relative' && relativeFromDirection === 'ago' && toIsNow) {
      labelToUse = generateRelativeRangeLabel(relativeFromValue, relativeFromUnit)
    }

    updateTimeRange(from, toDate.getTime(), false, toIsNow, labelToUse)
  }

  const applyToTime = () => {
    let to
    const now = Date.now()
    const isNow = toTab === 'now'

    if (toTab === 'now') {
      to = now
      setToDate(new Date(now))
      setToIsNow(true)

      // Check if from is relative ago, then we have a relative range
      if (fromTab === 'relative' && relativeFromDirection === 'ago') {
        const rangeLabel = generateRelativeRangeLabel(relativeFromValue, relativeFromUnit)
        setActiveRelativeRange(rangeLabel)
        setShowExpandedView(false)
      }
    } else if (toTab === 'relative') {
      const ms = getMillisecondsFromUnit(relativeToValue, relativeToUnit)
      to = relativeToDirection === 'ago' ? now - ms : now + ms
      setToDate(new Date(to))
      setToIsNow(false)
      setActiveRelativeRange(null)
      setShowExpandedView(false)
    } else {
      to = toDate.getTime()
      setToIsNow(false)
      setActiveRelativeRange(null)
      setShowExpandedView(false)
    }

    setToPopupOpen(false)

    let labelToUse = null
    if (fromTab === 'relative' && relativeFromDirection === 'ago' && toTab === 'now') {
      labelToUse = generateRelativeRangeLabel(relativeFromValue, relativeFromUnit)
    }

    updateTimeRange(fromDate.getTime(), to, fromIsNow, isNow, labelToUse)
  }

  const generateRelativeRangeLabel = (value, unit) => {
    const val = parseFloat(value)
    const unitSingular = unit.replace(/s$/, '') // Remove trailing 's'

    if (val === 1) {
      return `Last 1 ${unitSingular}`
    }
    return `Last ${val} ${unit}`
  }

  const updateTimeRange = (from, to, fromNow, toNow, specificLabel = null) => {
    const fromLabel = fromNow ? 'Now' : new Date(from).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
    const toLabel = toNow ? 'Now' : new Date(to).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })

    // Use specific label if provided, otherwise generate timestamp label
    const label = specificLabel || `${fromLabel} → ${toLabel}`

    // Always update display label to match what we send
    setDisplayLabel(label)

    onTimeRangeChange({
      from: Math.floor(from / 1000), // Convert to seconds for Quickwit
      to: Math.floor(to / 1000), // Convert to seconds for Quickwit
      label,
      fromIsNow: fromNow,
      toIsNow: toNow
    })
  }

  const formatDateDisplay = (date) => {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  }

  const formatDateForInput = (date) => {
    // Format: YYYY-MM-DD HH:mm:ss
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  }

  const parseManualDate = (input) => {
    // Accept formats: YYYY-MM-DD HH:mm:ss, YYYY-MM-DD HH:mm, or ISO formats
    try {
      const date = new Date(input)
      if (isNaN(date.getTime())) {
        return null
      }
      return date
    } catch (e) {
      return null
    }
  }

  const handleFromDateInputChange = (value) => {
    setFromDateInput(value)
    const parsed = parseManualDate(value)
    if (parsed) {
      setFromDate(parsed)
    }
  }

  const handleToDateInputChange = (value) => {
    setToDateInput(value)
    const parsed = parseManualDate(value)
    if (parsed) {
      setToDate(parsed)
    }
  }

  // Update input fields only when tab changes to absolute
  useEffect(() => {
    if (fromTab === 'absolute') {
      setFromDateInput(formatDateForInput(fromDate))
    }
  }, [fromTab])

  useEffect(() => {
    if (toTab === 'absolute') {
      setToDateInput(formatDateForInput(toDate))
    }
  }, [toTab])

  return (
    <div className="time-range-picker">
      <div className="time-display">
        <button
          className="calendar-quick-select-btn"
          onClick={() => setQuickSelectOpen(!quickSelectOpen)}
          title="Commonly used time ranges"
        >
          📅
        </button>
        {activeRelativeRange && !showExpandedView ? (
          <button
            className="relative-range-display"
            onClick={() => setShowExpandedView(true)}
          >
            {activeRelativeRange}
          </button>
        ) : (
          <>
            <button
              className="time-part from-part"
              onClick={() => setFromPopupOpen(!fromPopupOpen)}
            >
              {fromTab === 'relative'
                ? `${relativeFromValue} ${relativeFromUnit} ${relativeFromDirection}`
                : (fromIsNow ? 'Now' : formatDateDisplay(fromDate))
              }
            </button>
            <span className="time-separator">→</span>
            <button
              className="time-part to-part"
              onClick={() => setToPopupOpen(!toPopupOpen)}
            >
              {toTab === 'relative'
                ? `${relativeToValue} ${relativeToUnit} ${relativeToDirection}`
                : (toIsNow ? 'Now' : formatDateDisplay(toDate))
              }
            </button>
          </>
        )}
      </div>

      {/* Quick Select Dropdown */}
      {quickSelectOpen && (
        <div className="time-dropdown quick-select-dropdown" ref={quickSelectRef}>
          <div className="quick-select-title">Quick Select</div>

          {/* Custom Quick Range Input */}
          <div className="custom-quick-range">
            <span className="custom-quick-label">Last</span>
            <input
              type="number"
              min="1"
              value={customQuickValue}
              onChange={(e) => setCustomQuickValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  applyCustomQuickRange()
                }
              }}
              className="custom-quick-input"
              placeholder="15"
            />
            <select
              value={customQuickUnit}
              onChange={(e) => setCustomQuickUnit(e.target.value)}
              className="custom-quick-select"
            >
              <option value="seconds">seconds</option>
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
              <option value="days">days</option>
              <option value="weeks">weeks</option>
              <option value="months">months</option>
              <option value="years">years</option>
            </select>
            <button
              className="custom-quick-apply-btn"
              onClick={applyCustomQuickRange}
              disabled={!customQuickValue || parseFloat(customQuickValue) <= 0}
            >
              Apply
            </button>
          </div>

          <div className="quick-select-divider"></div>

          <div className="quick-select-grid">
            {QUICK_RANGES.map((range) => (
              <button
                key={range.label}
                className="quick-range-btn"
                onClick={() => applyQuickRange(range)}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* From Time Popup */}
      {fromPopupOpen && (
        <div className="time-popup from-popup" ref={fromPopupRef}>
          <div className="time-tabs">
            <button
              className={`time-tab ${fromTab === 'absolute' ? 'active' : ''}`}
              onClick={() => setFromTab('absolute')}
            >
              Absolute
            </button>
            <button
              className={`time-tab ${fromTab === 'relative' ? 'active' : ''}`}
              onClick={() => setFromTab('relative')}
            >
              Relative
            </button>
          </div>

          <div className="time-tab-content">
            {fromTab === 'absolute' && (
              <div className="absolute-tab">
                <DatePicker
                  selected={fromDate}
                  onChange={(date) => setFromDate(date)}
                  showTimeSelect
                  timeFormat="HH:mm:ss"
                  timeIntervals={1}
                  dateFormat="MMMM d, yyyy HH:mm:ss"
                  inline
                />
                <div className="manual-date-input-container">
                  <label>Manual input:</label>
                  <input
                    type="text"
                    value={fromDateInput}
                    onChange={(e) => handleFromDateInputChange(e.target.value)}
                    placeholder="YYYY-MM-DD HH:mm:ss"
                    className="manual-date-input"
                  />
                </div>
              </div>
            )}

            {fromTab === 'relative' && (
              <div className="relative-tab">
                <div className="relative-inputs">
                  <input
                    type="number"
                    value={relativeFromValue}
                    onChange={(e) => setRelativeFromValue(e.target.value)}
                    min="0"
                    className="relative-value"
                  />
                  <select
                    value={relativeFromUnit}
                    onChange={(e) => setRelativeFromUnit(e.target.value)}
                    className="relative-unit"
                  >
                    {RELATIVE_UNITS.map((unit) => (
                      <option key={unit.value} value={unit.value}>
                        {unit.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={relativeFromDirection}
                    onChange={(e) => setRelativeFromDirection(e.target.value)}
                    className="relative-direction"
                  >
                    <option value="ago">ago</option>
                    <option value="from now">from now</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="time-popup-footer">
            <button className="apply-btn" onClick={applyFromTime}>
              Apply
            </button>
          </div>
        </div>
      )}

      {/* To Time Popup */}
      {toPopupOpen && (
        <div className="time-popup to-popup" ref={toPopupRef}>
          <div className="time-tabs">
            <button
              className={`time-tab ${toTab === 'absolute' ? 'active' : ''}`}
              onClick={() => setToTab('absolute')}
            >
              Absolute
            </button>
            <button
              className={`time-tab ${toTab === 'relative' ? 'active' : ''}`}
              onClick={() => setToTab('relative')}
            >
              Relative
            </button>
            <button
              className={`time-tab ${toTab === 'now' ? 'active' : ''}`}
              onClick={() => setToTab('now')}
            >
              Now
            </button>
          </div>

          <div className="time-tab-content">
            {toTab === 'absolute' && (
              <div className="absolute-tab">
                <DatePicker
                  selected={toDate}
                  onChange={(date) => setToDate(date)}
                  showTimeSelect
                  timeFormat="HH:mm:ss"
                  timeIntervals={1}
                  dateFormat="MMMM d, yyyy HH:mm:ss"
                  inline
                />
                <div className="manual-date-input-container">
                  <label>Manual input:</label>
                  <input
                    type="text"
                    value={toDateInput}
                    onChange={(e) => handleToDateInputChange(e.target.value)}
                    placeholder="YYYY-MM-DD HH:mm:ss"
                    className="manual-date-input"
                  />
                </div>
              </div>
            )}

            {toTab === 'relative' && (
              <div className="relative-tab">
                <div className="relative-inputs">
                  <input
                    type="number"
                    value={relativeToValue}
                    onChange={(e) => setRelativeToValue(e.target.value)}
                    min="0"
                    className="relative-value"
                  />
                  <select
                    value={relativeToUnit}
                    onChange={(e) => setRelativeToUnit(e.target.value)}
                    className="relative-unit"
                  >
                    {RELATIVE_UNITS.map((unit) => (
                      <option key={unit.value} value={unit.value}>
                        {unit.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={relativeToDirection}
                    onChange={(e) => setRelativeToDirection(e.target.value)}
                    className="relative-direction"
                  >
                    <option value="ago">ago</option>
                    <option value="from now">from now</option>
                  </select>
                </div>
              </div>
            )}

            {toTab === 'now' && (
              <div className="now-tab">
                <p>Setting the end time to "now" means it will be set to the current moment when you click Apply.</p>
              </div>
            )}
          </div>

          <div className="time-popup-footer">
            <button className="apply-btn" onClick={applyToTime}>
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default TimeRangePicker
