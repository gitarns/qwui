import http from 'k6/http';
import { check } from 'k6';

// Quick smoke test - verify backend is working
export const options = {
  vus: 1,
  iterations: 1,
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:9999';
const INDEX_NAME = __ENV.INDEX_NAME || 'demo';

export default function () {
  console.log('Testing backend at:', BASE_URL);

  // Test 1: List indexes
  const indexRes = http.get(`${BASE_URL}/quickwit/api/v1/indexes`);
  const indexOk = check(indexRes, {
    '✓ List indexes returns 200': (r) => r.status === 200,
  });

  if (!indexOk) {
    console.error('❌ Failed to list indexes:', indexRes.status, indexRes.body);
    return;
  }

  console.log('✓ Backend is accessible');

  // Test 2: Simple search
  const now = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    query: '*',
    max_hits: 1,
    start_timestamp: now - 3600,
    end_timestamp: now,
  });

  const searchRes = http.post(
    `${BASE_URL}/quickwit/api/v1/${INDEX_NAME}/search`,
    payload,
    { headers: { 'Content-Type': 'application/json' } }
  );

  const searchOk = check(searchRes, {
    '✓ Search query returns 200': (r) => r.status === 200,
    '✓ Search has results': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.hasOwnProperty('num_hits');
      } catch (e) {
        return false;
      }
    },
  });

  if (searchOk) {
    const body = JSON.parse(searchRes.body);
    console.log(`✓ Search returned ${body.num_hits} hits`);
    console.log(`✓ Response time: ${searchRes.timings.duration.toFixed(2)}ms`);
  } else {
    console.error('❌ Search failed:', searchRes.status, searchRes.body);
  }

  console.log('\n✅ Backend is ready for load testing!');
}
