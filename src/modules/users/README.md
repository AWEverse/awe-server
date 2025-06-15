# Users Module

## Overview

The Users Module provides comprehensive user management functionality for the AWE platform. It handles user profiles, settings, preferences, security features, and user-related operations including profile management, privacy controls, account security, and user analytics.

## Features

### User Profile Management
- **Profile Creation**: Create and setup user profiles
- **Profile Updates**: Edit profile information and preferences
- **Avatar Management**: Profile picture upload and management
- **Banner/Cover Images**: Customizable profile banners
- **Bio and About**: Rich text biography and about sections
- **Social Links**: Integration with external social platforms
- **Contact Information**: Manage contact details and visibility

### User Settings
- **Privacy Settings**: Control profile and data visibility
- **Notification Preferences**: Customize notification delivery
- **Theme Preferences**: Dark/light mode and custom themes
- **Language Settings**: Multi-language support
- **Timezone Configuration**: Automatic and manual timezone settings
- **Accessibility Options**: Screen reader and accessibility preferences
- **Display Preferences**: Layout and UI customization options

### Security & Authentication
- **Password Management**: Change password with security validation
- **Two-Factor Authentication**: TOTP and SMS-based 2FA
- **Session Management**: Active session tracking and control
- **Login History**: Track login attempts and device history
- **Security Alerts**: Notifications for suspicious activities
- **Account Recovery**: Secure account recovery mechanisms
- **Device Management**: Manage trusted devices and browsers

### Cryptographic Features
- **Key Generation**: Generate cryptographic keys for users
- **Key Management**: Secure storage and rotation of user keys
- **Encryption/Decryption**: User data encryption services
- **Digital Signatures**: Sign and verify user documents
- **Certificate Management**: Handle user certificates
- **Secure Communication**: End-to-end encryption setup

### User Analytics
- **Activity Tracking**: Track user engagement and activity
- **Usage Statistics**: Monitor feature usage and preferences
- **Behavioral Analytics**: Understand user behavior patterns
- **Performance Metrics**: Track user experience metrics
- **Retention Analysis**: Monitor user retention and churn
- **A/B Testing**: Support for user-based experiments

## API Endpoints

### Profile Management

```
GET    /users/profile                  - Get current user profile
PUT    /users/profile                  - Update user profile
POST   /users/profile/avatar           - Upload profile avatar
DELETE /users/profile/avatar           - Remove profile avatar
POST   /users/profile/banner           - Upload profile banner
DELETE /users/profile/banner           - Remove profile banner
GET    /users/:id/profile              - Get public user profile
```

### User Settings

```
GET    /users/settings                 - Get all user settings
PUT    /users/settings                 - Update user settings
GET    /users/settings/privacy         - Get privacy settings
PUT    /users/settings/privacy         - Update privacy settings
GET    /users/settings/notifications   - Get notification preferences
PUT    /users/settings/notifications   - Update notification preferences
GET    /users/settings/theme           - Get theme preferences
PUT    /users/settings/theme           - Update theme preferences
```

### Security Management

```
POST   /users/security/password        - Change password
POST   /users/security/2fa/enable      - Enable 2FA
POST   /users/security/2fa/disable     - Disable 2FA
POST   /users/security/2fa/verify      - Verify 2FA code
GET    /users/security/sessions        - Get active sessions
DELETE /users/security/sessions/:id    - Terminate session
GET    /users/security/login-history   - Get login history
POST   /users/security/recovery        - Initiate account recovery
```

### Cryptographic Operations

```
POST   /users/crypto/keys/generate     - Generate new key pair
GET    /users/crypto/keys              - Get user public keys
POST   /users/crypto/keys/rotate       - Rotate encryption keys
POST   /users/crypto/encrypt           - Encrypt data for user
POST   /users/crypto/decrypt           - Decrypt user data
POST   /users/crypto/sign              - Sign data with user key
POST   /users/crypto/verify            - Verify signature
```

### User Analytics

```
GET    /users/analytics/activity       - Get user activity data
GET    /users/analytics/usage          - Get feature usage statistics
GET    /users/analytics/engagement     - Get engagement metrics
POST   /users/analytics/event          - Track custom user event
GET    /users/analytics/export         - Export user data (GDPR)
```

### Administrative

```
GET    /users                          - List users (admin)
GET    /users/:id                      - Get user details (admin)
PUT    /users/:id/status               - Update user status (admin)
POST   /users/:id/ban                  - Ban user (admin)
POST   /users/:id/unban                - Unban user (admin)
GET    /users/stats                    - Get platform user statistics
```

## Usage Examples

### Update User Profile

```typescript
const profileUpdate = await usersService.updateProfile({
  userId: 'user123',
  updates: {
    fullName: 'John Doe',
    bio: 'Software developer passionate about technology',
    location: 'San Francisco, CA',
    website: 'https://johndoe.dev',
    socialLinks: {
      twitter: '@johndoe',
      linkedin: 'linkedin.com/in/johndoe',
      github: 'github.com/johndoe'
    },
    interests: ['programming', 'technology', 'gaming'],
    isPublic: true
  }
});
```

### Configure Privacy Settings

```typescript
const privacySettings = await usersService.updatePrivacySettings({
  userId: 'user123',
  settings: {
    profileVisibility: 'public',        // public, friends, private
    emailVisibility: 'private',
    phoneVisibility: 'private',
    activityVisibility: 'friends',
    allowMessagesFrom: 'friends',       // anyone, friends, nobody
    allowFriendRequests: true,
    showOnlineStatus: true,
    indexInSearchEngines: false
  }
});
```

### Enable Two-Factor Authentication

```typescript
// Generate 2FA secret
const twoFASetup = await usersService.setup2FA({
  userId: 'user123'
});

console.log('2FA Setup:', twoFASetup);
// {
//   secret: 'JBSWY3DPEHPK3PXP',
//   qrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
//   backupCodes: ['123456', '789012', ...]
// }

// Verify and enable 2FA
const verification = await usersService.verify2FA({
  userId: 'user123',
  code: '123456',
  secret: twoFASetup.secret
});

if (verification.success) {
  await usersService.enable2FA({ userId: 'user123' });
}
```

### Manage User Sessions

```typescript
// Get active sessions
const sessions = await usersService.getActiveSessions({
  userId: 'user123'
});

console.log('Active sessions:', sessions);
// [
//   {
//     id: 'session123',
//     device: 'Chrome on Windows',
//     location: 'San Francisco, CA',
//     ipAddress: '192.168.1.1',
//     lastActivity: '2025-06-13T10:30:00Z',
//     isCurrent: true
//   },
//   ...
// ]

// Terminate specific session
await usersService.terminateSession({
  userId: 'user123',
  sessionId: 'session456'
});
```

### Cryptographic Operations

```typescript
// Generate key pair for user
const keyPair = await usersService.generateKeyPair({
  userId: 'user123',
  keyType: 'RSA',
  keySize: 2048,
  purpose: 'encryption'
});

// Encrypt sensitive data
const encryptedData = await usersService.encryptData({
  userId: 'user123',
  data: 'sensitive information',
  keyId: keyPair.keyId
});

// Decrypt data
const decryptedData = await usersService.decryptData({
  userId: 'user123',
  encryptedData: encryptedData.ciphertext,
  keyId: keyPair.keyId
});
```

## Configuration

### Profile Settings

```typescript
const profileConfig = {
  avatar: {
    maxSize: 2 * 1024 * 1024,         // 2MB
    allowedFormats: ['jpeg', 'png', 'webp'],
    dimensions: { width: 512, height: 512 }
  },
  banner: {
    maxSize: 5 * 1024 * 1024,         // 5MB
    allowedFormats: ['jpeg', 'png', 'webp'],
    dimensions: { width: 1920, height: 480 }
  },
  bio: {
    maxLength: 500,
    allowMarkdown: true,
    allowedTags: ['b', 'i', 'u', 'a']
  }
};
```

### Security Configuration

```typescript
const securityConfig = {
  passwords: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSymbols: true,
    blacklistedPasswords: ['password', '123456', 'qwerty']
  },
  twoFactor: {
    issuerName: 'AWE Platform',
    windowSize: 1,                    // TOTP window tolerance
    backupCodesCount: 10
  },
  sessions: {
    maxConcurrentSessions: 5,
    sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
    rememberMeDuration: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
};
```

### Privacy Defaults

```typescript
const privacyDefaults = {
  profileVisibility: 'public',
  emailVisibility: 'private',
  phoneVisibility: 'private',
  activityVisibility: 'friends',
  allowMessagesFrom: 'friends',
  allowFriendRequests: true,
  showOnlineStatus: true,
  indexInSearchEngines: false
};
```

## Database Schema

The module uses the following Prisma models:

- `User` - Core user information and profile data
- `UserSettings` - User preferences and configuration
- `UserSecurity` - Security-related information (2FA, etc.)
- `UserSession` - Active user sessions
- `UserKey` - Cryptographic keys for users
- `UserActivity` - User activity and analytics data
- `UserDevice` - Trusted devices and browsers
- `LoginHistory` - Historical login records

## Security Features

### Profile Security
- **Data Validation**: Strict validation of all profile data
- **XSS Prevention**: Sanitization of user-generated content
- **Privacy Controls**: Granular privacy setting controls
- **Content Moderation**: Automated detection of inappropriate content
- **Spam Prevention**: Rate limiting and spam detection

### Authentication Security
- **Password Hashing**: Argon2 password hashing
- **Brute Force Protection**: Account lockout after failed attempts
- **Session Security**: Secure session management and tokens
- **Device Fingerprinting**: Detect suspicious login patterns
- **Geographic Validation**: Alert for logins from unusual locations

### Data Protection
- **Encryption at Rest**: Sensitive data encryption in database
- **Encryption in Transit**: TLS encryption for all communications
- **Key Management**: Secure storage and rotation of encryption keys
- **Data Anonymization**: Remove PII from analytics data
- **GDPR Compliance**: Data export and deletion capabilities

## Performance Optimizations

### Caching Strategy
- **Profile Caching**: Cache frequently accessed profile data
- **Settings Caching**: Cache user settings and preferences
- **Session Caching**: Fast session validation with Redis
- **Analytics Caching**: Cache computed analytics data
- **Search Indexing**: Optimize user search and discovery

### Database Optimizations
- **Query Optimization**: Efficient database queries with proper indexing
- **Connection Pooling**: Optimize database connection usage
- **Read Replicas**: Use read replicas for analytics queries
- **Partitioning**: Partition large tables by user or date
- **Archival Strategy**: Archive old activity data

### API Performance
- **Response Compression**: Compress API responses
- **Pagination**: Efficient pagination for large datasets
- **Field Selection**: Allow clients to specify required fields
- **Batch Operations**: Support batch updates for efficiency
- **CDN Integration**: Serve static profile assets from CDN

## Privacy & Compliance

### GDPR Compliance
- **Data Portability**: Export user data in machine-readable format
- **Right to Erasure**: Complete user data deletion
- **Consent Management**: Track and manage user consent
- **Data Processing Records**: Log all data processing activities
- **Privacy by Design**: Privacy-first architecture and defaults

### Data Minimization
- **Purpose Limitation**: Collect only necessary data
- **Retention Policies**: Automatic deletion of old data
- **Anonymization**: Remove PII from analytics and logs
- **Consent Granularity**: Fine-grained consent controls
- **Transparency Reports**: Regular privacy and security reports

## Integration

To use this module in your application:

```typescript
import { UsersModule } from './modules/users';

@Module({
  imports: [
    UsersModule,
    // other modules...
  ],
})
export class AppModule {}
```

## Dependencies

- `@nestjs/common` - Core NestJS functionality
- `prisma` - Database ORM
- `argon2` - Password hashing
- `speakeasy` - TOTP implementation for 2FA
- `qrcode` - QR code generation for 2FA setup
- `sharp` - Image processing for avatars/banners
- `crypto` - Cryptographic operations
- `geoip-lite` - Geographic IP detection
- `class-validator` - Input validation

## Monitoring & Analytics

### User Metrics
- **Registration Rates**: Track new user sign-ups
- **Engagement Metrics**: Monitor user activity and engagement
- **Retention Analysis**: Analyze user retention over time
- **Feature Usage**: Track which features are most used
- **Geographic Distribution**: Understand user geographic spread

### Security Monitoring
- **Failed Login Attempts**: Monitor suspicious login activity
- **Account Takeover Detection**: Identify potential account compromises
- **Unusual Activity Alerts**: Alert on abnormal user behavior
- **Security Incident Tracking**: Log and track security events
- **Compliance Auditing**: Generate compliance and audit reports

### Performance Monitoring
- **API Response Times**: Monitor user API performance
- **Database Query Performance**: Track slow user-related queries
- **Cache Hit Rates**: Monitor caching effectiveness
- **Error Rates**: Track user-related errors and failures
- **System Resource Usage**: Monitor resource consumption patterns

## Future Enhancements

- [ ] AI-powered profile recommendations
- [ ] Advanced user verification and identity proofing
- [ ] Biometric authentication support
- [ ] Social graph analysis and friend suggestions
- [ ] Advanced privacy controls with zero-knowledge proofs
- [ ] Decentralized identity integration
- [ ] Machine learning-based fraud detection
- [ ] Advanced user segmentation and personalization
