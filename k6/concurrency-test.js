import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Custom metrics
const concurrentRequests = new Counter('concurrent_requests');
const successfulRequests = new Counter('successful_requests');
const failedRequests = new Counter('failed_requests');
const requestDuration = new Trend('request_duration');

// Concurrency test - find the breaking point
export const options = {
  scenarios: {
    // Scenario 1: Gradual ramp to find capacity
    gradual_ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '30s', target: 100 },
        { duration: '30s', target: 200 },
        { duration: '30s', target: 300 },
        { duration: '30s', target: 500 },
        { duration: '1m', target: 500 },   // Hold at 500
        { duration: '30s', target: 1000 }, // Try 1000
        { duration: '1m', target: 1000 },  // Hold at 1000
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<10000'], // 95% under 10s (lenient for high load)
    'http_req_failed': ['rate<0.3'],      // Accept 30% errors at peak
    'concurrent_requests': ['count>0'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:9999';
const INDEX_NAME = __ENV.INDEX_NAME || 'demo';

export default function () {
  concurrentRequests.add(1);

  const now = Math.floor(Date.now() / 1000);
  const oneHourAgo = now - 3600;

  const payload = JSON.stringify({
    query: '*',
    max_hits: 10, // Small result set for faster response
    start_timestamp: oneHourAgo,
    end_timestamp: now,
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
    timeout: '30s', // 30 second timeout
  };

  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/quickwit/api/v1/${INDEX_NAME}/search`,
    payload,
    params
  );
  const duration = Date.now() - start;

  requestDuration.add(duration);

  const success = check(res, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300,
  });

  if (success) {
    successfulRequests.add(1);
  } else {
    failedRequests.add(1);
    console.log(`Failed request: status=${res.status}, error=${res.error}`);
  }

  // No sleep - maximum concurrency
}

export function handleSummary(data) {
  const totalRequests = data.metrics.http_reqs.values.count;
  const failedReqs = data.metrics.http_req_failed.values.rate * totalRequests;
  const successReqs = totalRequests - failedReqs;
  const maxVUs = data.metrics.vus_max.values.value;

  console.log('\n========== Concurrency Test Results ==========');
  console.log(`Maximum VUs reached: ${maxVUs}`);
  console.log(`Total requests: ${totalRequests}`);
  console.log(`Successful: ${successReqs.toFixed(0)} (${(successReqs/totalRequests*100).toFixed(2)}%)`);
  console.log(`Failed: ${failedReqs.toFixed(0)} (${(failedReqs/totalRequests*100).toFixed(2)}%)`);
  console.log(`\nRequest Duration:`);
  console.log(`  avg: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms`);
  console.log(`  p50: ${data.metrics.http_req_duration.values['p(50)'].toFixed(2)}ms`);
  console.log(`  p95: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms`);
  console.log(`  p99: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms`);
  console.log(`  max: ${data.metrics.http_req_duration.values.max.toFixed(2)}ms`);
  console.log('==============================================\n');

  return {
    'stdout': JSON.stringify(data, null, 2),
  };
}
