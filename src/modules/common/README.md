# Common Module

## Overview

The Common Module provides shared utilities, services, and infrastructure components used across all modules in the AWE platform. It includes database connections, caching, error handling, validation pipes, guards, interceptors, decorators, and other foundational components that ensure consistency and reusability throughout the application.

## Features

### Database Management
- **Prisma Integration**: Centralized database connection and configuration
- **Connection Pooling**: Optimized database connection management
- **Transaction Management**: Database transaction utilities
- **Migration Support**: Database schema migration helpers
- **Query Optimization**: Common query patterns and optimizations
- **Health Checks**: Database connectivity monitoring

### Caching Infrastructure
- **Redis Integration**: Centralized caching with Redis
- **Cache Strategies**: Multiple caching patterns (TTL, LRU, etc.)
- **Cache Invalidation**: Smart cache invalidation mechanisms
- **Distributed Caching**: Multi-node cache synchronization
- **Cache Monitoring**: Performance metrics and health monitoring
- **Cache Warming**: Preload frequently accessed data

### Error Handling
- **Global Exception Filter**: Centralized error handling
- **Custom Exceptions**: Domain-specific exception classes
- **Error Logging**: Structured error logging and monitoring
- **Error Response Formatting**: Consistent error response format
- **Validation Errors**: Comprehensive validation error handling
- **Stack Trace Management**: Secure error information exposure

### Validation & Pipes
- **Custom Validation Pipes**: Reusable validation logic
- **DTO Validation**: Automatic DTO validation with class-validator
- **Transform Pipes**: Data transformation utilities
- **Sanitization Pipes**: Input sanitization for security
- **File Validation**: File upload validation pipes
- **Pagination Pipes**: Standardized pagination handling

### Guards & Security
- **Authentication Guards**: JWT and session-based auth guards
- **Authorization Guards**: Role and permission-based guards
- **Rate Limiting Guards**: Request rate limiting protection
- **IP Filtering Guards**: Geographic and IP-based access control
- **CORS Configuration**: Cross-origin resource sharing setup
- **Security Headers**: HTTP security headers middleware

### Interceptors
- **Logging Interceptor**: Request/response logging
- **Transform Interceptor**: Response data transformation
- **Cache Interceptor**: Response caching logic
- **Compression Interceptor**: Response compression
- **Timeout Interceptor**: Request timeout handling
- **Metrics Interceptor**: Performance metrics collection

### Decorators
- **Custom Decorators**: Parameter and method decorators
- **User Decorator**: Extract user information from requests
- **Pagination Decorator**: Standardized pagination parameters
- **Validation Decorators**: Custom validation rules
- **Cache Decorators**: Method-level caching
- **Rate Limit Decorators**: Method-level rate limiting

### Utilities & Helpers
- **Date Utilities**: Date formatting and manipulation
- **String Utilities**: String processing and validation
- **Crypto Utilities**: Encryption and hashing functions
- **File Utilities**: File processing and validation
- **URL Utilities**: URL parsing and validation
- **Math Utilities**: Mathematical operations and calculations

## Module Structure

```
common/
├── cache/
│   ├── cache.service.ts              # Redis caching service
│   ├── cache.module.ts               # Cache module configuration
│   └── cache.interfaces.ts           # Cache-related interfaces
├── database/
│   ├── prisma.service.ts             # Prisma database service
│   ├── transaction.service.ts        # Transaction management
│   └── migration.service.ts          # Migration utilities
├── decorators/
│   ├── get-user.decorator.ts         # Extract user from request
│   ├── pagination.decorator.ts       # Pagination parameters
│   ├── rate-limit.decorator.ts       # Rate limiting decorator
│   └── cache.decorator.ts            # Caching decorator
├── filters/
│   ├── global-exception.filter.ts    # Global error handling
│   ├── validation-exception.filter.ts # Validation error handling
│   └── http-exception.filter.ts      # HTTP error handling
├── guards/
│   ├── jwt-auth.guard.ts             # JWT authentication
│   ├── roles.guard.ts                # Role-based authorization
│   ├── rate-limit.guard.ts           # Rate limiting protection
│   └── ip-filter.guard.ts            # IP filtering
├── interceptors/
│   ├── logging.interceptor.ts        # Request logging
│   ├── transform.interceptor.ts      # Response transformation
│   ├── cache.interceptor.ts          # Response caching
│   └── timeout.interceptor.ts        # Request timeout
├── pipes/
│   ├── validation.pipe.ts            # Enhanced validation pipe
│   ├── transform.pipe.ts             # Data transformation
│   ├── sanitization.pipe.ts          # Input sanitization
│   └── pagination.pipe.ts            # Pagination handling
├── services/
│   ├── logger.service.ts             # Enhanced logging service
│   ├── config.service.ts             # Configuration management
│   ├── health.service.ts             # Health check service
│   └── metrics.service.ts            # Metrics collection
├── helpers/
│   ├── date.helper.ts                # Date utilities
│   ├── string.helper.ts              # String utilities
│   ├── crypto.helper.ts              # Cryptographic utilities
│   ├── file.helper.ts                # File utilities
│   └── validation.helper.ts          # Validation utilities
└── common.module.ts                  # Main common module
```

## Core Services

### Cache Service

```typescript
@Injectable()
export class CacheService {
  async get<T>(key: string): Promise<T | null>;
  async set<T>(key: string, value: T, ttl?: number): Promise<void>;
  async del(key: string): Promise<void>;
  async invalidatePattern(pattern: string): Promise<void>;
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T>;
}
```

### Database Service

```typescript
@Injectable()
export class DatabaseService extends PrismaService {
  async executeInTransaction<T>(
    operations: (tx: PrismaTransactionClient) => Promise<T>
  ): Promise<T>;
  
  async healthCheck(): Promise<boolean>;
  async getConnectionInfo(): Promise<ConnectionInfo>;
}
```

### Logger Service

```typescript
@Injectable()
export class LoggerService {
  log(message: string, context?: string): void;
  error(message: string, trace?: string, context?: string): void;
  warn(message: string, context?: string): void;
  debug(message: string, context?: string): void;
  verbose(message: string, context?: string): void;
}
```

## Usage Examples

### Using Cache Service

```typescript
@Injectable()
export class UserService {
  constructor(private readonly cacheService: CacheService) {}

  async getUserProfile(userId: string) {
    const cacheKey = `user:profile:${userId}`;
    
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.fetchUserFromDatabase(userId),
      3600 // 1 hour TTL
    );
  }

  async updateUserProfile(userId: string, data: UpdateUserDto) {
    const user = await this.updateUserInDatabase(userId, data);
    
    // Invalidate cache
    await this.cacheService.del(`user:profile:${userId}`);
    
    return user;
  }
}
```

### Using Custom Decorators

```typescript
@Controller('users')
export class UsersController {
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@GetUser() user: User) {
    return user;
  }

  @Get()
  async getUsers(
    @Pagination() pagination: PaginationDto,
    @Query() filters: UserFiltersDto
  ) {
    return this.usersService.findMany(pagination, filters);
  }
}
```

### Using Transaction Service

```typescript
@Injectable()
export class OrderService {
  constructor(private readonly databaseService: DatabaseService) {}

  async createOrder(orderData: CreateOrderDto) {
    return this.databaseService.executeInTransaction(async (tx) => {
      const order = await tx.order.create({ data: orderData });
      
      await tx.inventory.update({
        where: { productId: orderData.productId },
        data: { quantity: { decrement: orderData.quantity } }
      });
      
      await tx.user.update({
        where: { id: orderData.userId },
        data: { balance: { decrement: orderData.total } }
      });
      
      return order;
    });
  }
}
```

### Global Exception Handling

```typescript
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = this.getStatus(exception);
    const message = this.getMessage(exception);

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: message,
      error: this.getErrorType(exception)
    };

    this.logError(exception, request);
    response.status(status).json(errorResponse);
  }
}
```

## Configuration

### Cache Configuration

```typescript
const cacheConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB) || 0,
    keyPrefix: 'awe:',
    retryAttempts: 3,
    retryDelay: 1000
  },
  defaultTTL: 3600, // 1 hour
  maxMemoryUsage: '2gb'
};
```

### Database Configuration

```typescript
const databaseConfig = {
  url: process.env.DATABASE_URL,
  shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  connectTimeout: 10000,
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 60000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000
  }
};
```

### Logging Configuration

```typescript
const loggingConfig = {
  level: process.env.LOG_LEVEL || 'info',
  format: 'json',
  transports: [
    'console',
    'file',
    'elasticsearch'
  ],
  file: {
    filename: 'logs/app.log',
    maxSize: '10m',
    maxFiles: 5
  }
};
```

## Security Features

### Input Validation
- **DTO Validation**: Automatic validation using class-validator
- **Sanitization**: XSS and injection prevention
- **Type Safety**: Strong typing for all inputs
- **Custom Validators**: Domain-specific validation rules
- **File Validation**: Secure file upload validation

### Rate Limiting
- **Request Rate Limiting**: Prevent API abuse
- **User-specific Limits**: Per-user rate limiting
- **IP-based Limits**: Geographic rate limiting
- **Adaptive Limits**: Dynamic rate limit adjustment
- **Bypass Rules**: Whitelist trusted sources

### Security Headers
- **CORS Configuration**: Cross-origin resource sharing
- **CSP Headers**: Content Security Policy
- **HSTS**: HTTP Strict Transport Security
- **X-Frame-Options**: Clickjacking prevention
- **X-Content-Type-Options**: MIME type sniffing prevention

## Performance Features

### Caching Strategies
- **Memory Caching**: In-memory caching for frequently accessed data
- **Distributed Caching**: Redis-based distributed caching
- **Cache Warming**: Preload cache with expected data
- **Cache Invalidation**: Smart cache invalidation patterns
- **Cache Monitoring**: Performance metrics and alerts

### Database Optimization
- **Connection Pooling**: Efficient database connection management
- **Query Optimization**: Optimized database queries
- **Read Replicas**: Separate read and write operations
- **Indexing**: Proper database indexing strategies
- **Monitoring**: Database performance monitoring

### Response Optimization
- **Compression**: Response compression with gzip/brotli
- **Pagination**: Efficient pagination for large datasets
- **Field Selection**: Selective field responses
- **Batch Operations**: Batch multiple operations
- **CDN Integration**: Static asset delivery via CDN

## Monitoring & Health Checks

### Health Checks
- **Database Health**: Monitor database connectivity
- **Cache Health**: Monitor Redis connectivity
- **External Services**: Monitor third-party service health
- **Memory Usage**: Monitor application memory usage
- **CPU Usage**: Monitor CPU utilization

### Metrics Collection
- **Request Metrics**: Track API request performance
- **Error Metrics**: Monitor error rates and types
- **Cache Metrics**: Track cache hit/miss ratios
- **Database Metrics**: Monitor query performance
- **Business Metrics**: Track business-specific KPIs

### Alerting
- **Error Rate Alerts**: Alert on high error rates
- **Performance Alerts**: Alert on performance degradation
- **Resource Alerts**: Alert on resource exhaustion
- **Security Alerts**: Alert on security violations
- **Custom Alerts**: Configurable business alerts

## Integration

The Common Module is automatically imported by all other modules:

```typescript
@Module({
  imports: [CommonModule],
  // ... other module configuration
})
export class SomeFeatureModule {}
```

## Dependencies

- `@nestjs/common` - Core NestJS functionality
- `@nestjs/config` - Configuration management
- `@prisma/client` - Database ORM
- `redis` - Caching infrastructure
- `class-validator` - Input validation
- `class-transformer` - Data transformation
- `winston` - Advanced logging
- `compression` - Response compression
- `helmet` - Security headers

## Best Practices

### Error Handling
- Always use specific exception types
- Include relevant context in error messages
- Log errors with appropriate severity levels
- Don't expose sensitive information in error responses
- Implement proper error recovery mechanisms

### Caching
- Use appropriate cache TTL values
- Implement cache warming for critical data
- Monitor cache hit ratios and adjust strategies
- Use cache tags for efficient invalidation
- Consider cache memory usage in capacity planning

### Performance
- Use database transactions judiciously
- Implement proper connection pooling
- Monitor and optimize slow queries
- Use appropriate indexing strategies
- Implement response pagination for large datasets

### Security
- Validate all inputs at the boundary
- Sanitize user-generated content
- Use rate limiting to prevent abuse
- Implement proper authentication and authorization
- Regular security audits and updates

## Future Enhancements

- [ ] Advanced metrics and observability platform
- [ ] Machine learning-based anomaly detection
- [ ] Advanced caching strategies with ML optimization
- [ ] Distributed tracing and APM integration
- [ ] Advanced security monitoring and threat detection
- [ ] Automated performance optimization
- [ ] Cloud-native scaling and auto-tuning
- [ ] Advanced A/B testing framework
