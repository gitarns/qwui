import http from 'k6/http';
import { check, sleep } from 'k6';

// Simple load test - constant load over time
export const options = {
  vus: 20, // 20 virtual users
  duration: '5m', // Run for 5 minutes
  thresholds: {
    'http_req_duration': ['p(99)<3000'], // 99% of requests should be below 3s
    'http_req_failed': ['rate<0.05'],     // Error rate should be below 5%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:9999';
const INDEX_NAME = __ENV.INDEX_NAME || 'dcbprotect';

export default function () {
  const now = Math.floor(Date.now() / 1000);
  const oneHourAgo = now - 3600;

  // Search query
  const payload = JSON.stringify({
    query: '*',
    max_hits: 100,
    start_timestamp: oneHourAgo,
    end_timestamp: now,
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
    'status is 200': (r) => r.status === 200,
    'response time < 2000ms': (r) => r.timings.duration < 2000,
  });

  sleep(1);
}
