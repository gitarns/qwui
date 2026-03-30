import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const searchErrorRate = new Rate('search_errors');
const aggregationErrorRate = new Rate('aggregation_errors');
const searchDuration = new Trend('search_duration');
const aggregationDuration = new Trend('aggregation_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 50 },   // Ramp up to 50 users
    { duration: '2m', target: 50 },   // Stay at 50 users for 2 minutes
    { duration: '30s', target: 100 }, // Spike to 100 users
    { duration: '1m', target: 100 },  // Stay at 100 users
    { duration: '30s', target: 0 },   // Ramp down to 0
  ],
  thresholds: {
    'http_req_duration': ['p(95)<2000'], // 95% of requests should be below 2s
    'search_errors': ['rate<0.1'],        // Error rate should be below 10%
    'aggregation_errors': ['rate<0.1'],   // Error rate should be below 10%
  },
};

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const INDEX_NAME = __ENV.INDEX_NAME || 'demo';

// Test data
const queries = [
  '*',
  'status:active',
  'level:error',
  'timestamp:[now-1h TO now]',
  'message:failed',
];

const aggregationFunctions = ['sum', 'avg', 'min', 'max', 'count'];
const intervals = ['1m', '5m', '15m', '1h'];

// Helper function to generate random time range
function getTimeRange() {
  const now = Math.floor(Date.now() / 1000);
  const hoursAgo = Math.floor(Math.random() * 24) + 1; // 1-24 hours ago
  const from = now - (hoursAgo * 3600);
  return { from, to: now };
}

// Helper function to get random element from array
function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function () {
  const timeRange = getTimeRange();

  // Test 1: List indexes
  {
    const res = http.get(`${BASE_URL}/quickwit/api/v1/indexes`);
    check(res, {
      'list indexes status 200': (r) => r.status === 200,
      'list indexes has body': (r) => r.body.length > 0,
    });
  }

  sleep(1);

  // Test 2: Simple search query
  {
    const query = randomElement(queries);
    const payload = JSON.stringify({
      query: query,
      max_hits: 100,
      start_timestamp: timeRange.from,
      end_timestamp: timeRange.to,
    });

    const params = {
      headers: { 'Content-Type': 'application/json' },
    };

    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/quickwit/api/v1/${INDEX_NAME}/search`,
      payload,
      params
    );
    const duration = Date.now() - start;

    searchDuration.add(duration);
    const success = check(res, {
      'search status 200': (r) => r.status === 200,
      'search has hits': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.hasOwnProperty('num_hits');
        } catch (e) {
          return false;
        }
      },
    });
    searchErrorRate.add(!success);
  }

  sleep(1);

  // Test 3: Aggregation query (histogram)
  {
    const interval = randomElement(intervals);
    const payload = JSON.stringify({
      query: '*',
      max_hits: 0,
      start_timestamp: timeRange.from,
      end_timestamp: timeRange.to,
      aggs: {
        by_time: {
          histogram: {
            field: 'current_time',
            interval: interval,
            min_doc_count: 0,
          },
        },
      },
    });

    const params = {
      headers: { 'Content-Type': 'application/json' },
    };

    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/quickwit/api/v1/${INDEX_NAME}/search`,
      payload,
      params
    );
    const duration = Date.now() - start;

    aggregationDuration.add(duration);
    const success = check(res, {
      'aggregation status 200': (r) => r.status === 200,
      'aggregation has results': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.hasOwnProperty('aggregations');
        } catch (e) {
          return false;
        }
      },
    });
    aggregationErrorRate.add(!success);
  }

  sleep(1);

  // Test 4: Terms aggregation (group by field)
  {
    const payload = JSON.stringify({
      query: '*',
      max_hits: 0,
      start_timestamp: timeRange.from,
      end_timestamp: timeRange.to,
      aggs: {
        by_time: {
          histogram: {
            field: 'current_time',
            interval: '5m',
            min_doc_count: 0,
          },
          aggs: {
            by_group: {
              terms: {
                field: 'user',
                size: 100,
              },
            },
          },
        },
      },
    });

    const params = {
      headers: { 'Content-Type': 'application/json' },
    };

    const res = http.post(
      `${BASE_URL}/quickwit/api/v1/${INDEX_NAME}/search`,
      payload,
      params
    );

    check(res, {
      'terms aggregation status 200': (r) => r.status === 200,
    });
  }

  sleep(1);

  // Test 5: Search with filters
  {
    const payload = JSON.stringify({
      query: '(AND user:wister)',
      max_hits: 50,
      start_timestamp: timeRange.from,
      end_timestamp: timeRange.to,
    });

    const params = {
      headers: { 'Content-Type': 'application/json' },
    };

    const res = http.post(
      `${BASE_URL}/quickwit/api/v1/${INDEX_NAME}/search`,
      payload,
      params
    );

    check(res, {
      'filtered search status 200': (r) => r.status === 200,
    });
  }

  sleep(2);
}

// Setup function - runs once before the test
export function setup() {
  console.log('Starting stress test...');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Index: ${INDEX_NAME}`);

  // Verify the API is accessible
  const res = http.get(`${BASE_URL}/quickwit/api/v1/indexes`);
  if (res.status !== 200) {
    throw new Error(`API not accessible: ${res.status}`);
  }

  return { startTime: Date.now() };
}

// Teardown function - runs once after the test
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Test completed in ${duration.toFixed(2)} seconds`);
}
