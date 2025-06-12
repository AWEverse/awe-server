# Продвинутые методы авторизации Supabase

Этот документ описывает продвинутые методы авторизации, реализованные в `SupabaseAuthService`.

## Многофакторная аутентификация (MFA)

### `enableMFA(jwt: string)`
Включает многофакторную аутентификацию для пользователя.
```typescript
const mfaData = await supabaseAuthService.enableMFA(userJWT);
// Возвращает QR код и секретный ключ для настройки authenticator приложения
```

### `verifyMFA(jwt: string, factorId: string, code: string)`
Верифицирует MFA код и завершает настройку.
```typescript
const result = await supabaseAuthService.verifyMFA(userJWT, factorId, '123456');
```

### `getMFAFactors(jwt: string)`
Получает список всех MFA факторов пользователя.
```typescript
const factors = await supabaseAuthService.getMFAFactors(userJWT);
```

### `removeMFAFactor(jwt: string, factorId: string)`
Удаляет MFA фактор.
```typescript
await supabaseAuthService.removeMFAFactor(userJWT, factorId);
```

### `signInWithMFA(email: string, password: string, mfaCode?: string)`
Вход с поддержкой MFA.
```typescript
const result = await supabaseAuthService.signInWithMFA(email, password, '123456');
```

## Админские функции

### `importUsers(users: UserImportData[])`
Массовый импорт пользователей.
```typescript
const users = [
  { email: 'user1@example.com', password: 'password123' },
  { email: 'user2@example.com', password: 'password456' }
];
const results = await supabaseAuthService.importUsers(users);
```

### `getAllUsers(page?: number, perPage?: number)`
Получение всех пользователей с пагинацией.
```typescript
const users = await supabaseAuthService.getAllUsers(1, 50);
```

### `searchUsersByEmail(email: string)`
Поиск пользователей по email.
```typescript
const results = await supabaseAuthService.searchUsersByEmail('john');
```

### `deleteUser(userId: string)`
Удаление пользователя.
```typescript
await supabaseAuthService.deleteUser(userId);
```

### `bulkDeleteUsers(userIds: string[])`
Массовое удаление пользователей.
```typescript
const results = await supabaseAuthService.bulkDeleteUsers(['user1', 'user2']);
```

### `adminUpdateUser(userId: string, updates: AdminUserUpdate)`
Принудительное обновление данных пользователя.
```typescript
await supabaseAuthService.adminUpdateUser(userId, {
  email: 'newemail@example.com',
  email_confirm: true
});
```

### `createUserWithPassword(email: string, password: string, userData?: UserCreationData)`
Создание пользователя с предустановленным паролем.
```typescript
const user = await supabaseAuthService.createUserWithPassword(
  'user@example.com',
  'password123',
  { email_confirm: true }
);
```

## Управление блокировками

### `banUser(userId: string, duration?: string, reason?: string)`
Блокировка пользователя.
```typescript
// Постоянная блокировка
await supabaseAuthService.banUser(userId, undefined, 'Violation of terms');

// Временная блокировка
await supabaseAuthService.banUser(userId, '7d', 'Spam activity');
```

Поддерживаемые форматы длительности:
- `30m` - 30 минут
- `2h` - 2 часа  
- `1d` - 1 день
- `1w` - 1 неделя

### `unbanUser(userId: string)`
Разблокировка пользователя.
```typescript
await supabaseAuthService.unbanUser(userId);
```

## Magic Link и альтернативные методы входа

### `generateMagicLink(email: string, redirectTo?: string)`
Генерация magic link для входа (админская функция).
```typescript
const link = await supabaseAuthService.generateMagicLink('user@example.com');
```

### `signInWithMagicLink(email: string, redirectTo?: string)`
Отправка magic link пользователю.
```typescript
await supabaseAuthService.signInWithMagicLink('user@example.com');
```

### `signInWithPhone(phone: string)`
Вход через SMS OTP.
```typescript
await supabaseAuthService.signInWithPhone('+1234567890');
```

### `verifyPhoneOtp(phone: string, token: string)`
Верификация SMS OTP.
```typescript
const result = await supabaseAuthService.verifyPhoneOtp('+1234567890', '123456');
```

## Управление сессиями

### `signOutEverywhere(jwt: string)`
Выход из всех устройств.
```typescript
await supabaseAuthService.signOutEverywhere(userJWT);
```

### `getActiveSessions(jwt: string)`
Получение информации об активных сессиях.
```typescript
const sessions = await supabaseAuthService.getActiveSessions(userJWT);
```

### `invalidateAllRefreshTokens(userId: string)`
Принудительная инвалидация всех refresh токенов.
```typescript
await supabaseAuthService.invalidateAllRefreshTokens(userId);
```

## Безопасность и мониторинг

### `validatePasswordStrength(password: string)`
Проверка силы пароля.
```typescript
const validation = supabaseAuthService.validatePasswordStrength('mypassword123');
console.log(validation.isValid); // boolean
console.log(validation.score); // 0-6
console.log(validation.suggestions); // массив рекомендаций
```

### `checkAccountStatus(jwt: string)`
Проверка статуса аккаунта.
```typescript
const status = await supabaseAuthService.checkAccountStatus(userJWT);
console.log(status.is_banned);
console.log(status.has_mfa);
console.log(status.is_email_confirmed);
```

### `logUserAction(jwt: string, action: string, details?: any)`
Логирование действий пользователя.
```typescript
await supabaseAuthService.logUserAction(userJWT, 'password_change', {
  ip_address: '192.168.1.1',
  user_agent: 'Mozilla/5.0...'
});
```

### `getUserActionLogs(jwt: string, limit?: number)`
Получение логов действий пользователя.
```typescript
const logs = await supabaseAuthService.getUserActionLogs(userJWT, 100);
```

### `checkSuspiciousActivity(jwt: string)`
Проверка подозрительной активности.
```typescript
const check = await supabaseAuthService.checkSuspiciousActivity(userJWT);
if (check.is_suspicious) {
  console.log('Обнаружена подозрительная активность:', check.indicators);
}
```

## Управление ролями и разрешениями

### `setUserRole(userId: string, role: string, permissions?: string[])`
Установка роли пользователя.
```typescript
await supabaseAuthService.setUserRole(userId, 'moderator', [
  'read_posts',
  'moderate_comments',
  'ban_users'
]);
```

## Настройки и уведомления

### `configureAuthNotifications(jwt: string, settings: AuthNotificationSettings)`
Настройка уведомлений.
```typescript
await supabaseAuthService.configureAuthNotifications(userJWT, {
  emailOnSignIn: true,
  emailOnPasswordChange: true,
  emailOnMFAEnabled: true,
  emailOnSuspiciousActivity: true
});
```

### `updateUserMetadata(jwt: string, metadata: any)`
Обновление пользовательских метаданных.
```typescript
await supabaseAuthService.updateUserMetadata(userJWT, {
  preferences: { theme: 'dark', language: 'ru' },
  profile: { bio: 'Software developer' }
});
```

### `updateUserEmail(jwt: string, newEmail: string)`
Обновление email пользователя.
```typescript
await supabaseAuthService.updateUserEmail(userJWT, 'newemail@example.com');
```

### `updateUserPhone(jwt: string, newPhone: string)`
Обновление телефона пользователя.
```typescript
await supabaseAuthService.updateUserPhone(userJWT, '+1234567890');
```

## Статистика

### `getSessionStats(jwt: string)`
Получение статистики сессий.
```typescript
const stats = await supabaseAuthService.getSessionStats(userJWT);
console.log(stats.mfa_enabled);
console.log(stats.last_sign_in_at);
```

## Обработка ошибок

Все методы используют централизованную обработку ошибок через `handleAuthError`. В случае ошибки выбрасываются исключения:

- `UnauthorizedException` - для ошибок аутентификации
- `BadRequestException` - для общих ошибок

## Примеры использования

### Полный цикл настройки MFA
```typescript
// 1. Включение MFA
const mfaData = await supabaseAuthService.enableMFA(userJWT);
// Показать QR код пользователю

// 2. Верификация и завершение настройки
const verified = await supabaseAuthService.verifyMFA(userJWT, mfaData.id, '123456');

// 3. Вход с MFA
const loginResult = await supabaseAuthService.signInWithMFA(email, password, '123456');
```

### Мониторинг безопасности
```typescript
// Проверка статуса аккаунта
const status = await supabaseAuthService.checkAccountStatus(userJWT);

// Проверка подозрительной активности
const activity = await supabaseAuthService.checkSuspiciousActivity(userJWT);

// Логирование важного действия
await supabaseAuthService.logUserAction(userJWT, 'sensitive_data_access', {
  resource: 'user_data',
  ip_address: req.ip
});
```

### Административное управление
```typescript
// Массовый импорт пользователей
const importResults = await supabaseAuthService.importUsers(userList);

// Поиск и модерация
const suspiciousUsers = await supabaseAuthService.searchUsersByEmail('spam');
for (const user of suspiciousUsers.users) {
  await supabaseAuthService.banUser(user.id, '7d', 'Spam activity detected');
}
```
