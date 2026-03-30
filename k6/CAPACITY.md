# Rust Backend Capacity Analysis

## System Configuration

**Hardware/OS:**
- **CPU Cores**: 16
- **Memory**: 30GB total, ~20GB available
- **OS**: Linux (kernel with high limits)

**Software:**
- **Tokio Runtime**: Multi-threaded async runtime
  - Worker threads: 16 (one per CPU core)
  - Work-stealing scheduler
- **Axum/Hyper**: HTTP server with HTTP/2 support
- **Connection Pool**: 32 idle connections to Quickwit per host

**System Limits:**
- **File descriptors**: 524,288 (soft and hard)
- **Max processes**: 121,822
- **TCP backlog**: 4,096
- **Port range**: 32768-60999 (28,232 ephemeral ports)

## Theoretical Capacity

### 1. **Connection Limit**
- **File descriptors**: 524,288 connections
- **Practical limit**: ~500,000 concurrent connections
- **No bottleneck here** - your limits are very high

### 2. **CPU/Thread Limit**
- **Worker threads**: 16
- **Blocking operations**: Limited to 16 parallel CPU-bound tasks
- **Async operations**: Can handle thousands concurrently (waiting on I/O)

### 3. **Memory Limit**
- **Available**: ~20GB
- **Per connection**: ~4-8KB overhead
- **Theoretical**: 2.5-5 million connections before RAM exhaustion
- **Practical**: Much less due to request processing overhead

### 4. **Downstream Bottleneck**
- **Quickwit connection pool**: 32 concurrent requests to Quickwit
- **This is likely the bottleneck**
- Each request to your backend may wait for a Quickwit connection

## Expected Performance

### Best Case (I/O Bound)
If requests are waiting on Quickwit (I/O):
- **Concurrent connections**: 1,000 - 10,000+
- **Requests/second**: 500 - 5,000+ (depends on query latency)
- **Latency**: Primarily determined by Quickwit response time

### Worst Case (CPU Bound)
If requests require heavy processing:
- **Parallel processing**: Limited to 16 threads
- **Throughput**: ~100-1,000 req/s (depends on processing time)
- **Latency**: Increases with queue depth

### Realistic Scenario
Most requests are I/O bound (waiting on Quickwit):
- **Concurrent users**: 500-2,000 comfortable
- **Spike capacity**: Can handle 5,000+ for short bursts
- **Sustained**: 1,000-3,000 depending on query complexity

## Bottlenecks (in order of likelihood)

1. **Quickwit Backend** ⚠️ MOST LIKELY
   - Connection pool: 32 connections
   - Query execution time
   - Index size and complexity

2. **Network Bandwidth**
   - Result set size
   - Large aggregations

3. **Memory**
   - Large result sets
   - VRL transformations
   - Session storage

4. **CPU** (unlikely to be first bottleneck)
   - JSON parsing/serialization
   - VRL script execution
   - Only 16 parallel threads

## Recommendations

### To Increase Capacity:

1. **Increase Quickwit Connection Pool**
   ```rust
   // In main.rs, increase from 32:
   .pool_max_idle_per_host(100)  // Or higher
   ```

2. **Add Connection Pooling**
   - Consider connection pool limits per client
   - Implement request queuing/throttling

3. **Add Caching**
   - Cache frequent queries
   - Cache aggregation results
   - Use Redis for distributed caching

4. **Horizontal Scaling**
   - Run multiple backend instances
   - Load balancer in front
   - Each instance can handle 500-2000 users

5. **Query Optimization**
   - Limit result set sizes
   - Optimize aggregations
   - Use streaming for large responses

6. **Monitor Key Metrics**
   ```bash
   # Watch open connections
   watch -n1 'lsof -p $(pgrep qwui) | wc -l'

   # Watch thread count
   watch -n1 'ps -o nlwp -p $(pgrep qwui)'

   # Memory usage
   watch -n1 'ps -p $(pgrep qwui) -o rss,vsz'
   ```

## Testing Strategy

1. **Baseline** (load-test.js)
   - Establish normal performance with 20 users
   - Measure p50, p95, p99 latencies

2. **Find Breaking Point** (concurrency-test.js)
   - Gradually increase to 1000 users
   - Identify where errors start
   - Note latency degradation

3. **Stress Test** (stress-test.js)
   - Mix of query types
   - Realistic usage patterns
   - Sustained load

4. **Spike Test** (spike-test.js)
   - Sudden traffic increases
   - Recovery testing

## Expected Test Results

### With Current Configuration:

**Load Test (20 users):**
- ✅ Should pass easily
- Latency: <200ms average
- 0% errors

**Stress Test (100 users):**
- ✅ Should pass
- Latency: <500ms p95
- <5% errors

**Concurrency Test (up to 1000 users):**
- ⚠️ May see degradation at 300-500 users
- Errors likely due to Quickwit connection pool saturation
- Latency will increase as queue builds

**Spike Test (200 users):**
- ⚠️ May see temporary errors during spike
- Should recover quickly
- Watch for connection timeout errors

## Monitoring During Tests

Watch these metrics:
```bash
# In one terminal - system resources
./check-limits.sh

# In another - watch the process
watch -n1 'ps aux | grep qwui'

# Monitor logs
tail -f /path/to/qwui.log

# Network connections
watch -n1 'netstat -an | grep :9999 | wc -l'
```

## Summary

Your Rust backend is **well-configured** for high concurrency:

✅ **Strengths:**
- Very high file descriptor limits (524K)
- 16 CPU cores for parallel processing
- Async runtime can handle thousands of concurrent I/O operations
- 30GB RAM provides plenty of headroom

⚠️ **Bottlenecks:**
- Quickwit connection pool (32) is the likely first bottleneck
- Actual capacity depends on Quickwit backend performance
- Query complexity affects throughput

📊 **Expected Capacity:**
- **Conservative**: 500-1,000 concurrent users
- **Optimistic**: 2,000-5,000 concurrent users (with fast Quickwit)
- **Peak/Burst**: Can handle 10,000+ for short periods

The actual limit will be determined by **Quickwit's performance**, not the Rust backend itself.
