# K6 Load Testing for QWUI

This directory contains k6 load testing scripts for the QWUI (Quickwit UI) application.

## Prerequisites

Install k6:

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Windows
choco install k6

# Or using Docker
docker pull grafana/k6
```

## Backend Capacity

Based on your system configuration:

**Current Limits:**
- **File descriptors**: 524,288 (very high - no connection limit issues)
- **CPU cores**: 16 (Tokio uses 16 worker threads)
- **Connection pool**: 32 idle connections to Quickwit per host
- **TCP listen backlog**: 4,096 connections
- **Available memory**: ~20GB

**Theoretical Capacity:**
- Can handle **500K+ concurrent connections** (file descriptor limit)
- CPU-bound at ~**16 parallel requests** (worker threads)
- Async I/O allows thousands of concurrent requests waiting on I/O
- Actual limit will be determined by:
  - Quickwit backend performance
  - Query complexity
  - Available memory

**Check Your System:**
```bash
./check-limits.sh
```

## Test Scripts

### 1. Stress Test (`stress-test.js`)
Gradually increases load to find breaking points.

- Ramps up from 10 to 100 users
- Tests multiple query types (search, aggregations, filters)
- Custom metrics for search and aggregation performance
- Duration: ~6 minutes

**Run:**
```bash
k6 run stress-test.js
```

**With custom parameters:**
```bash
k6 run -e BASE_URL=http://localhost:3000 -e INDEX_NAME=dcbprotect stress-test.js
```

### 2. Load Test (`load-test.js`)
Constant load over time to test stability.

- 20 virtual users
- Duration: 5 minutes
- Simple search queries

**Run:**
```bash
k6 run load-test.js
```

### 3. Spike Test (`spike-test.js`)
Tests system behavior during sudden traffic spikes.

- Sudden spike from 10 to 200 users
- Tests recovery after spike
- Duration: ~3 minutes

**Run:**
```bash
k6 run spike-test.js
```

### 4. Concurrency Test (`concurrency-test.js`)
**NEW** - Finds the maximum concurrent connections the backend can handle.

- Gradually ramps from 50 to 1000 virtual users
- No sleep between requests (maximum concurrency)
- Identifies breaking point
- Duration: ~6 minutes

**Run:**
```bash
k6 run concurrency-test.js
```

**Expected Results:**
- Your system should handle 500-1000+ concurrent connections
- Performance degradation will depend on Quickwit backend
- Watch for memory usage and CPU saturation

## Environment Variables

- `BASE_URL`: Base URL of the application (default: `http://localhost:3000`)
- `INDEX_NAME`: Quickwit index name to test against (default: `dcbprotect`)

Example:
```bash
k6 run -e BASE_URL=https://my-qwui.example.com -e INDEX_NAME=logs stress-test.js
```

## Running with Docker

```bash
docker run --rm -i --network=host \
  -e BASE_URL=http://localhost:3000 \
  -e INDEX_NAME=dcbprotect \
  grafana/k6 run - <stress-test.js
```

## Grafana Cloud Integration

To send results to Grafana Cloud:

1. Sign up for Grafana Cloud (free tier available)
2. Get your k6 Cloud token
3. Run with cloud output:

```bash
k6 run --out cloud stress-test.js
```

Or export to InfluxDB/Prometheus:

```bash
# InfluxDB
k6 run --out influxdb=http://localhost:8086/k6 stress-test.js

# JSON output
k6 run --out json=results.json stress-test.js
```

## Interpreting Results

### Key Metrics

- **http_req_duration**: How long requests take (p95, p99 percentiles are important)
- **http_req_failed**: Rate of failed requests
- **search_errors**: Custom metric tracking search query failures
- **aggregation_errors**: Custom metric tracking aggregation failures
- **iterations**: Number of complete test runs

### Thresholds

Tests will PASS/FAIL based on defined thresholds:

- **Stress Test**:
  - 95% of requests under 2s
  - Error rate below 10%

- **Load Test**:
  - 99% of requests under 3s
  - Error rate below 5%

- **Spike Test**:
  - 95% of requests under 5s (during spike)
  - Error rate below 20% (acceptable during extreme spike)

### Example Output

```
     ✓ search status 200
     ✓ search has hits
     ✓ aggregation status 200

     checks.........................: 100.00% ✓ 4500      ✗ 0
     data_received..................: 45 MB   150 kB/s
     data_sent......................: 2.3 MB  7.6 kB/s
     http_req_duration..............: avg=245ms  min=89ms  med=198ms  max=1.2s   p(95)=512ms  p(99)=890ms
     http_req_failed................: 0.00%   ✓ 0        ✗ 4500
     http_reqs......................: 4500    15/s
     iteration_duration.............: avg=5.2s   min=4.1s  med=5s     max=8.4s   p(95)=6.1s   p(99)=7.2s
     iterations.....................: 900     3/s
     search_duration................: avg=234ms  min=89ms  med=190ms  max=950ms  p(95)=498ms  p(99)=812ms
     search_errors..................: 0.00%   ✓ 0        ✗ 1500
     vus............................: 1       min=1      max=100
     vus_max........................: 100     min=100    max=100
```

## Customizing Tests

### Modify Load Profile

Edit the `stages` in `options`:

```javascript
export const options = {
  stages: [
    { duration: '1m', target: 50 },  // Ramp to 50 users over 1 min
    { duration: '5m', target: 50 },  // Stay at 50 for 5 min
    { duration: '1m', target: 0 },   // Ramp down
  ],
};
```

### Add Custom Queries

Edit the `queries` array in `stress-test.js`:

```javascript
const queries = [
  '*',
  'status:active',
  'level:error',
  'your_field:your_value',
];
```

### Adjust Thresholds

```javascript
thresholds: {
  'http_req_duration': ['p(95)<1000'],  // Stricter: 95% under 1s
  'http_req_failed': ['rate<0.01'],     // Stricter: 1% error rate
}
```

## Tips

1. **Start small**: Run load test first before stress test
2. **Monitor backend**: Watch Quickwit and Rust backend metrics during tests
3. **Check logs**: Look for errors in application logs
4. **Baseline**: Establish baseline performance before optimization
5. **Consistent env**: Run tests in consistent environment for comparison

## Troubleshooting

**Connection errors:**
- Ensure the application is running
- Check BASE_URL is correct
- Verify network connectivity

**High error rates:**
- Check if Quickwit is running
- Verify index exists
- Check backend logs for errors

**Timeouts:**
- Increase threshold limits
- Check system resources (CPU, memory)
- Optimize queries or add caching
