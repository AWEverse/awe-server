# Optimized Authentication Module

Высокопроизводительный и безопасный модуль авторизации для production-ready приложений.

## 🚀 Особенности

### Безопасность
- **Строгая валидация паролей** с настраиваемыми требованиями
- **Rate limiting** для предотвращения brute-force атак  
- **Audit logging** всех событий безопасности
- **Session management** с поддержкой concurrent sessions
- **Blacklist токенов** для немедленной инвалидации
- **CSRF защита** и security headers
- **Input sanitization** против XSS атак

### Производительность
- **Кэширование пользователей** для быстрой валидации токенов
- **Оптимизированные Guard'ы** с минимальными DB запросами
- **Connection pooling** и batch операции
- **Компрессия токенов** и оптимальные алгоритмы

### Функциональность
- **JWT Authentication** с refresh токенами
- **Social Login** (Google, Twitter, Facebook, GitHub, Discord)
- **Password Reset** с безопасными токенами
- **Email Verification** 
- **Two-Factor Authentication** (готовность к внедрению)
- **Device Management** и session tracking

## 📦 Структура модуля

```
auth/
├── constants/
│   └── auth.constants.ts          # Константы конфигурации
├── dto/
│   ├── LoginDto.ts               # DTO для входа
│   ├── RegisterDto.ts            # DTO для регистрации
│   ├── RefreshTokenDto.ts        # DTO для обновления токена
│   ├── ForgotPasswordDto.ts      # DTO для сброса пароля
│   ├── ResetPasswordDto.ts       # DTO для установки нового пароля
│   ├── SocialLoginDto.ts         # DTO для social login
│   └── ChangePasswordDto.ts      # DTO для смены пароля
├── guards/
│   ├── optimized-jwt-auth.guard.ts    # Оптимизированный JWT guard
│   ├── throttled-auth.guard.ts        # Guard с кэшированием
│   └── rate-limit.guard.ts            # Rate limiting guard
├── middleware/
│   ├── security.middleware.ts         # Security headers и sanitization
│   └── session.middleware.ts          # Session management
├── services/
│   └── security-audit.service.ts      # Audit logging сервис
├── strategies/
│   ├── jwt.strategy.ts               # JWT strategy с кэшированием
│   └── supabase.strategy.ts          # Supabase OAuth strategy
├── types/
│   └── auth-response.types.ts        # Типы ответов API
├── utils/
│   └── validators.ts                 # Утилиты валидации
├── auth.controller.ts               # REST API контроллер
├── auth.service.ts                  # Основная бизнес-логика
├── auth.module.ts                   # NestJS модуль
└── index.ts                         # Экспорты модуля
```

## 🔧 Установка и настройка

### 1. Environment Variables

Добавьте в `.env`:

```env
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/database

# Security
BCRYPT_ROUNDS=12
CSRF_SECRET=your-csrf-secret

# Rate Limiting
REDIS_URL=redis://localhost:6379

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### 2. Database Migration

Добавьте таблицу audit logging в schema.prisma:

```prisma
model SecurityAuditLog {
  id          BigInt   @id @default(autoincrement())
  userId      BigInt?
  eventType   String   @db.VarChar(50)
  severity    String   @db.VarChar(20) // LOW, MEDIUM, HIGH, CRITICAL
  description String   @db.VarChar(500)
  ipAddress   String?  @db.Inet
  userAgent   String?  @db.VarChar(512)
  metadata    Json?
  timestamp   DateTime @default(now()) @db.Timestamptz(3)
  resolvedAt  DateTime? @db.Timestamptz(3)
  resolvedBy  BigInt?

  user     User? @relation("SecurityAudits", fields: [userId], references: [id])
  resolver User? @relation("SecurityResolver", fields: [resolvedBy], references: [id])

  @@index([userId, timestamp])
  @@index([eventType, timestamp])
  @@index([severity])
}
```

Запустите миграцию:
```bash
npx prisma db push
```

### 3. Использование в приложении

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module';
import { SecurityMiddleware } from './modules/auth/middleware/security.middleware';
import { SessionMiddleware } from './modules/auth/middleware/session.middleware';

@Module({
  imports: [AuthModule],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(SecurityMiddleware, SessionMiddleware)
      .forRoutes('*');
  }
}
```

## 🛡️ Security Features

### Password Policy

Настраиваемая политика паролей в `auth.constants.ts`:

```typescript
PASSWORD: {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_NUMBERS: true,
  REQUIRE_SPECIAL_CHARS: true,
  SPECIAL_CHARS: '@$!%*?&',
}
```

### Rate Limiting

Автоматическая защита от brute-force атак:

- **Login**: 5 попыток за 15 минут
- **Registration**: 3 попытки за час
- **Password Reset**: 3 попытки за час

### Session Management

- Максимум 3 одновременные сессии на пользователя
- Timeout бездействия: 30 минут
- Абсолютный timeout: 24 часа

### Audit Logging

Все события безопасности логируются:

```typescript
// Примеры событий
LOGIN_SUCCESS, LOGIN_FAILED, PASSWORD_CHANGED,
SUSPICIOUS_ACTIVITY, MULTIPLE_LOGIN_ATTEMPTS,
SESSION_HIJACK_ATTEMPT, etc.
```

## 📡 API Reference

### Регистрация

```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "StrongP@ss123",
  "username": "john_doe",
  "fullName": "John Doe"
}
```

### Вход

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "StrongP@ss123",
  "rememberMe": false
}
```

### Обновление токена

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "your-refresh-token"
}
```

### Выход

```http
POST /auth/logout
Authorization: Bearer your-jwt-token
```

### Профиль пользователя

```http
GET /auth/profile
Authorization: Bearer your-jwt-token
```

### Смена пароля

```http
POST /auth/change-password
Authorization: Bearer your-jwt-token
Content-Type: application/json

{
  "currentPassword": "CurrentP@ss123",
  "newPassword": "NewStrongP@ss123"
}
```

### Сброс пароля

```http
POST /auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

### Social Login

```http
POST /auth/social/google
Content-Type: application/json

{
  "provider": "google",
  "redirectUrl": "https://myapp.com/auth/callback"
}
```

## 🔍 Monitoring и Analytics

### Security Events

Получить события безопасности пользователя:

```typescript
const events = await securityAuditService.getUserSecurityEvents(userId, 50, 0);
```

### Security Report

Сгенерировать отчет безопасности:

```typescript
const report = await securityAuditService.generateSecurityReport(24); // за 24 часа
```

### Пример отчета:

```json
{
  "timeRange": { "hours": 24, "since": "2025-06-10T12:00:00Z" },
  "summary": {
    "totalEvents": 1250,
    "eventsBySeverity": {
      "LOW": 900,
      "MEDIUM": 300,
      "HIGH": 45,
      "CRITICAL": 5
    }
  },
  "topEventTypes": [
    { "eventType": "LOGIN_SUCCESS", "_count": 450 },
    { "eventType": "TOKEN_REFRESH", "_count": 320 }
  ],
  "topIPAddresses": [
    { "ipAddress": "192.168.1.100", "_count": 85 }
  ]
}
```

## ⚡ Performance Optimizations

### Кэширование

- **User Cache**: 5 минут TTL
- **Permissions Cache**: 10 минут TTL
- **Blocked Users Cache**: 30 минут TTL

### Database Optimizations

- Composite indexes для частых запросов
- Connection pooling
- Prepared statements
- Batch операции для bulk actions

### Memory Management

- Автоматическая очистка expired токенов
- LRU cache для session data
- Cleanup задачи для audit logs

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Coverage
npm run test:cov
```

## 🚀 Production Deployment

### Recommended Settings

```typescript
// Production config
AUTH_CONSTANTS.SECURITY.BCRYPT_ROUNDS = 14; // Увеличить для production
AUTH_CONSTANTS.RATE_LIMIT.LOGIN_ATTEMPTS = 3; // Строже rate limiting
AUTH_CONSTANTS.SESSION.MAX_CONCURRENT_SESSIONS = 2; // Меньше сессий
```

### Health Checks

```typescript
// Health check endpoint
@Get('auth/health')
async healthCheck() {
  return {
    status: 'ok',
    timestamp: new Date(),
    uptime: process.uptime(),
    activeUsers: this.getActiveUsersCount(),
    securityEvents: await this.getRecentSecurityEventsCount()
  };
}
```

### Monitoring

Рекомендуется настроить мониторинг для:

- Failed login attempts
- Unusual activity patterns  
- Response times
- Memory usage
- Database connection health

## 🤝 Contributing

1. Fork репозиторий
2. Создайте feature branch (`git checkout -b feature/amazing-feature`)
3. Commit изменения (`git commit -m 'Add amazing feature'`)
4. Push в branch (`git push origin feature/amazing-feature`)
5. Создайте Pull Request

## 📄 License

MIT License - см. LICENSE файл.

## 🆘 Support

Для поддержки создайте issue в GitHub репозитории или обратитесь к команде разработки.

---

**Создано для высоконагруженных production приложений с фокусом на безопасность и производительность.**
