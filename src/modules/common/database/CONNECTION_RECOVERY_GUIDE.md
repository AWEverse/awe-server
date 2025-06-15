# Database Connection Recovery Improvements

## Overview

The `OptimizedDatabasePool` service has been enhanced to handle `ECONNRESET` errors and other connection issues more gracefully. This document outlines the improvements and how to use them.

## Key Improvements

### 1. Automatic Retry Logic
- **Connection Error Handling**: Automatically retries queries when connection errors occur (ECONNRESET, ENOTFOUND, ECONNREFUSED, ETIMEDOUT, EPIPE)
- **Exponential Backoff**: Uses exponential delay between retry attempts (1s, 2s, 4s)
- **Maximum Retries**: Configurable maximum retry attempts (default: 3)

### 2. Circuit Breaker Pattern
- **Failure Threshold**: Opens circuit after 5 consecutive failures
- **Recovery Time**: 30-second recovery period before attempting new connections
- **Automatic Reset**: Resets on successful operations

### 3. Enhanced Pool Configuration
- **Reduced Pool Sizes**: Optimized for Supabase Pooler limitations
  - Main pool: 2-20 connections
  - Read pool: 3-25 connections  
  - Write pool: 1-8 connections
- **SSL Support**: Automatic SSL configuration for cloud databases
- **Application Name**: Sets application_name for better monitoring

### 4. Connection Recovery
- **Manual Recovery**: `forceConnectionRecovery()` method for manual intervention
- **Health Checks**: Individual pool health monitoring
- **Automatic Cleanup**: Removes problematic idle connections

## Usage Examples

### Basic Query Execution
```typescript
// Automatically retries on connection errors
const users = await databasePool.query('SELECT * FROM users WHERE active = $1', [true]);
```

### Transaction with Retry
```typescript
// Transactions also have automatic retry logic
const result = await databasePool.transaction(async (client) => {
  await client.query('UPDATE users SET last_login = NOW() WHERE id = $1', [userId]);
  await client.query('INSERT INTO user_logs (user_id, action) VALUES ($1, $2)', [userId, 'login']);
  return { success: true };
});
```

### Manual Recovery (Emergency)
```typescript
// Force connection recovery if issues persist
try {
  await databasePool.forceConnectionRecovery();
  console.log('Database connections recovered');
} catch (error) {
  console.error('Recovery failed:', error);
}
```

### Monitoring Circuit Breaker
```typescript
// Check circuit breaker status
const status = databasePool.getCircuitBreakerStatus();
console.log('Circuit breaker status:', status);
// Output: { isOpen: false, failureCount: 0, lastFailureTime: 0, timeUntilRecovery: 0 }
```

### Health Monitoring
```typescript
// Check specific pool health
const isHealthy = await databasePool.checkPoolHealth('read');
console.log('Read pool healthy:', isHealthy);

// Get connection statistics
const stats = databasePool.getConnectionStats();
console.log('Connection stats:', stats);
```

## Configuration

Add these environment variables for optimal configuration:

```env
# Database connection
DATABASE_URL=postgresql://user:pass@host:port/db
READ_DATABASE_URL=postgresql://user:pass@read-host:port/db  # Optional read replica

# SSL configuration (set to 'false' to disable SSL)
DATABASE_SSL=true

# Pool tuning (optional, uses defaults if not set)
DB_POOL_MIN=2
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT=600000
```

## Error Handling Strategy

### Connection Errors (Auto-Retry)
- `ECONNRESET`: Connection reset by peer
- `ENOTFOUND`: DNS lookup failed
- `ECONNREFUSED`: Connection refused
- `ETIMEDOUT`: Connection timeout
- `EPIPE`: Broken pipe

### Non-Connection Errors (No Retry)
- SQL syntax errors
- Constraint violations
- Permission errors
- Data type errors

## Monitoring and Alerts

The service emits events that can be monitored:

```typescript
// Listen for circuit breaker events
eventEmitter.on('db.circuit.breaker.opened', (data) => {
  console.warn('Database circuit breaker opened:', data);
  // Send alert to monitoring system
});

eventEmitter.on('db.circuit.breaker.closed', () => {
  console.log('Database circuit breaker closed - connections restored');
});

// Monitor connection events
eventEmitter.on('db.connection.error', (data) => {
  if (data.isRecoverable) {
    console.warn('Recoverable connection error:', data.code);
  } else {
    console.error('Non-recoverable database error:', data.error);
  }
});
```

## Best Practices

1. **Use Appropriate Pool**: Use `query()` for SELECT operations and `execute()` for modifications
2. **Handle Circuit Breaker**: Check circuit breaker status in critical paths
3. **Monitor Metrics**: Regularly check connection stats and slow queries
4. **Graceful Degradation**: Implement fallbacks when database is unavailable
5. **Logging**: Monitor logs for connection patterns and issues

## Troubleshooting

### High Connection Reset Frequency
- Check network stability between app and database
- Verify Supabase connection limits
- Consider adjusting pool sizes
- Monitor connection idle time

### Circuit Breaker Opening Frequently
- Investigate underlying connection issues
- Check database server health
- Verify network connectivity
- Consider increasing failure threshold

### Performance Issues
- Monitor slow query metrics
- Check connection pool utilization
- Verify proper query indexing
- Consider read/write pool distribution

## Migration Notes

The enhanced service is backward-compatible. Existing code will automatically benefit from:
- Automatic retry logic
- Circuit breaker protection
- Improved error handling
- Better connection management

No code changes are required for basic functionality.
