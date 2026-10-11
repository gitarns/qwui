// The search on screen, as URL query parameters.
//
// The address bar is kept in step with the search (see App.jsx), the way
// Kibana's is, so it is always a link to what is on screen: copy it, send it,
// and the other person lands on the same index, query, filters and time range.
//
//   ?index=logs&query=level:error&from=now-15m&to=now&columns=host,message
//
// Relative ranges stay relative (from=now-15m&to=now), so a link to "the last
// 15 minutes" still means the last 15 minutes when it is opened tomorrow, as in
// Kibana and Grafana. Absolute instants are ISO 8601 in UTC, so a link means
// the same moment in every timezone.

const MATH_UNITS = { s: 'second', m: 'minute', h: 'hour', d: 'day', w: 'week', M: 'month', y: 'year' }
const UNIT_TO_MATH = Object.fromEntries(Object.entries(MATH_UNITS).map(([math, unit]) => [unit, math]))
// Months and years are approximated the same way as everywhere else in qwui.
const UNIT_SECONDS = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 }

// How the time picker labels a relative range: "Last 15 minutes", "Last 1 hour".
const RELATIVE_LABEL = /^Last (\d+) (second|minute|hour|day|week|month|year)s?$/
const DATE_MATH = /^now(?:-(\d+)([smhdwMy]))?$/
const INTERVAL = /^(auto|\d+[smhdwMy])$/
const FILTER_TYPES = ['include', 'exclude', 'exists', 'not_exists']
const PARAMS = ['index', 'query', 'from', 'to', 'filters', 'columns', 'interval', 'sort', 'vrl']

// Same format as the time picker's labels, so a range read from a link looks
// like one picked by hand.
export const formatRangeDate = (epochSeconds) =>
  new Date(epochSeconds * 1000).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })

export const relativeRangeLabel = (amount, unit) => `Last ${amount} ${unit}${amount === 1 ? '' : 's'}`

const toIso = (epochSeconds) => new Date(epochSeconds * 1000).toISOString().replace('.000Z', 'Z')

const timeRangeToParams = (timeRange) => {
  const relative = timeRange.label?.match(RELATIVE_LABEL)
  if (relative && timeRange.toIsNow !== false) {
    return { from: `now-${relative[1]}${UNIT_TO_MATH[relative[2]]}`, to: 'now' }
  }
  return {
    from: toIso(timeRange.from),
    to: timeRange.toIsNow ? 'now' : toIso(timeRange.to)
  }
}

// One end of the range: `now`, `now-15m`, an ISO 8601 string, or a Unix
// timestamp in seconds or milliseconds.
const parseInstant = (value, now) => {
  const math = value.match(DATE_MATH)
  if (math) {
    if (!math[1]) return { epoch: now, isNow: true }
    const amount = Number(math[1])
    const unit = MATH_UNITS[math[2]]
    return { epoch: now - amount * UNIT_SECONDS[unit], ago: { amount, unit } }
  }
  if (/^\d{10}$/.test(value)) return { epoch: Number(value) }
  if (/^\d{13}$/.test(value)) return { epoch: Math.floor(Number(value) / 1000) }
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : { epoch: Math.floor(ms / 1000) }
}

const paramsToTimeRange = (fromValue, toValue) => {
  const now = Math.floor(Date.now() / 1000)
  const from = parseInstant(fromValue, now)
  const to = parseInstant(toValue || 'now', now)
  if (!from || !to || from.epoch >= to.epoch) return null

  if (from.ago && to.isNow) {
    return {
      from: from.epoch,
      to: now,
      label: relativeRangeLabel(from.ago.amount, from.ago.unit),
      fromIsNow: false,
      toIsNow: true
    }
  }
  return {
    from: from.epoch,
    to: to.epoch,
    label: `${formatRangeDate(from.epoch)} → ${to.isNow ? 'Now' : formatRangeDate(to.epoch)}`,
    fromIsNow: false,
    toIsNow: Boolean(to.isNow)
  }
}

const cleanFilters = (filters) =>
  filters
    .filter(f => f && typeof f.field === 'string' && f.field !== '' && FILTER_TYPES.includes(f.type))
    .map(({ field, value, type, disabled }) => ({
      field,
      value: value === undefined ? null : value,
      type,
      ...(disabled ? { disabled: true } : {})
    }))

// Links made before the address bar was kept in step carried the whole state
// as one JSON blob in `q`. Still read, so links already sent keep working.
const parseLegacy = (raw) => {
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    // The old writer encoded the JSON once more than it needed to.
    try {
      data = JSON.parse(decodeURIComponent(raw))
    } catch {
      return null
    }
  }
  if (!data || typeof data !== 'object') return null

  const state = {}
  if (typeof data.index === 'string' && data.index) state.index = data.index
  if (typeof data.search_query === 'string') state.query = data.search_query
  if (Array.isArray(data.filters)) state.filters = cleanFilters(data.filters)
  if (data.time_range && typeof data.time_range.from === 'number') state.timeRange = data.time_range
  if (Array.isArray(data.selected_columns)) state.columns = data.selected_columns.filter(c => typeof c === 'string')
  if (typeof data.histogram_interval === 'string' && INTERVAL.test(data.histogram_interval)) {
    state.interval = data.histogram_interval
  }
  return state
}

// Returns null when the URL carries no search, otherwise only the parts it
// does carry: anything absent keeps qwui's default.
export function parseUrlState(search) {
  const params = new URLSearchParams(search)

  const legacy = params.get('q')
  if (legacy && /^\s*(\{|%7B)/i.test(legacy)) return parseLegacy(legacy)

  if (!PARAMS.some(name => params.has(name))) return null

  const state = {}
  const index = params.get('index')
  if (index) state.index = index
  if (params.has('query')) state.query = params.get('query')

  const from = params.get('from')
  if (from) {
    const timeRange = paramsToTimeRange(from, params.get('to'))
    if (timeRange) state.timeRange = timeRange
  }

  const filters = params.get('filters')
  if (filters) {
    try {
      const parsed = JSON.parse(filters)
      if (Array.isArray(parsed)) state.filters = cleanFilters(parsed)
    } catch {
      // A mangled filters parameter drops the filters, not the whole link.
    }
  }

  const columns = params.get('columns')
  if (columns) state.columns = columns.split(',').filter(Boolean)

  const interval = params.get('interval')
  if (interval && INTERVAL.test(interval)) state.interval = interval

  const sort = params.get('sort')
  if (sort === 'oldest' || sort === 'newest') state.sort = sort

  if (params.has('vrl')) state.vrl = params.get('vrl')

  return state
}

// The query string for a search, '' for an empty one. Defaults are left out
// to keep links short.
export function buildUrlSearch({ index, query, timeRange, filters, columns, interval, sort, vrl }) {
  const params = new URLSearchParams()
  if (index) params.set('index', index)
  if (query && query.trim() !== '' && query !== '*') params.set('query', query)
  if (timeRange && typeof timeRange.from === 'number') {
    const range = timeRangeToParams(timeRange)
    params.set('from', range.from)
    params.set('to', range.to)
  }
  if (filters?.length) params.set('filters', JSON.stringify(cleanFilters(filters)))
  if (columns?.length) params.set('columns', columns.join(','))
  if (interval && interval !== 'auto') params.set('interval', interval)
  if (sort === 'oldest') params.set('sort', sort)
  if (vrl && vrl.trim() !== '') params.set('vrl', vrl)

  // URLSearchParams escapes everything outside [A-Za-z0-9*-._]. Colons,
  // commas, slashes and @ are legal as-is in a query string (RFC 3986), and
  // leaving them alone keeps `query=level:error` and the ISO timestamps
  // readable in the address bar.
  const search = params
    .toString()
    .replace(/%3A/gi, ':')
    .replace(/%2C/gi, ',')
    .replace(/%2F/gi, '/')
    .replace(/%40/gi, '@')
  return search ? `?${search}` : ''
}
