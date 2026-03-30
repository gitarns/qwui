import http from 'k6/http';
import { check, sleep } from 'k6';

// Spike test - sudden traffic increase
export const options = {
  stages: [
    { duration: '10s', target: 10 },   // Ramp up to 10 users
    { duration: '30s', target: 10 },   // Stay at 10
    { duration: '10s', target: 200 },  // Spike to 200 users
    { duration: '1m', target: 200 },   // Stay at spike
    { duration: '10s', target: 10 },   // Drop back down
    { duration: '30s', target: 10 },   // Recover
    { duration: '10s', target: 0 },    // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<5000'], // 95% under 5s during spike
    'http_req_failed': ['rate<0.2'],     // Accept up to 20% errors during spike
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const INDEX_NAME = __ENV.INDEX_NAME || 'demo';

export default function () {
  const now = Math.floor(Date.now() / 1000);
  const oneHourAgo = now - 3600;

  const payload = JSON.stringify({
    query: '*',
    max_hits: 50,
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
  });

  sleep(0.5);
}
