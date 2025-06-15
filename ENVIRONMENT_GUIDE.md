# Environment Configuration Guide

## 📁 Environment Files Structure

```
├── .env                           # Active environment (current)
├── .env.development.template      # Development template
├── .env.staging.template         # Staging template  
├── .env.production.template      # Production template
├── .env.security.example         # Security configuration reference
└── .env.local                    # Local overrides (gitignored)
```

## 🔄 Environment Management

### Quick Setup for Different Environments

```bash
# Development
cp .env.development.template .env

# Staging
cp .env.staging.template .env

# Production  
cp .env.production.template .env
```

### Environment-Specific Commands

```bash
# Load specific environment
npm run dev --env=development
npm run start:staging --env=staging
npm run start:prod --env=production
```

## 🛡️ Security Configuration Matrix

| Feature | Development | Staging | Production |
|---------|-------------|---------|------------|
| **JWT Algorithm** | HS256 | RS256 | RS256 |
| **Access Token Life** | 60min | 15min | 10min |
| **Refresh Token Life** | 30 days | 21 days | 14 days |
| **Session Life** | 24hrs | 18hrs | 12hrs |
| **Fingerprint Validation** | ❌ | ✅ | ✅ |
| **Device Tracking** | ✅ | ✅ | ✅ |
| **Token Reuse Detection** | ✅ | ✅ | ✅ |
| **Risk-Based Tokens** | ❌ | ✅ | ✅ |
| **Hash-Only Storage** | ❌ | ✅ | ✅ |
| **Max Login Attempts** | 10 | 4 | 3 |
| **Lockout Duration** | 5min | 20min | 30min |
| **Security Log Level** | debug | info | warn |

## 🔧 Configuration Categories

### 1. 🚀 Server Configuration
- `NODE_ENV`: Environment type
- `PORT`: Server port  
- `FRONTEND_URL`: Client application URL

### 2. 🗄️ Database Configuration
- `DATABASE_URL`: Main database connection
- `DIRECT_URL`: Direct database access (migrations)

### 3. 🔑 Authentication & JWT
- `JWT_SECRET`: Token signing secret
- `JWT_ALGORITHM`: Signing algorithm (HS256/RS256)
- `JWT_ACCESS_TOKEN_LIFETIME_MINUTES`: Access token duration
- `JWT_REFRESH_TOKEN_LIFETIME_DAYS`: Refresh token duration
- `SESSION_LIFETIME_HOURS`: Session duration

### 4. 🛡️ Security Features
- `ENABLE_FINGERPRINT_VALIDATION`: Browser fingerprint check
- `ENABLE_DEVICE_TRACKING`: Device management
- `ENABLE_TOKEN_REUSE_DETECTION`: Anti-replay protection
- `ENABLE_RISK_BASED_TOKENS`: Dynamic token lifetimes
- `HASH_ONLY_TOKEN_STORAGE`: Secure token storage

### 5. 🚨 Rate Limiting
- `MAX_LOGIN_ATTEMPTS`: Failed login limit
- `ACCOUNT_LOCKOUT_MINUTES`: Lockout duration
- `RATE_LIMIT_WINDOW_MINUTES`: Rate limit window

### 6. ☁️ Storage Configuration
- `R2_ACCESS_KEY_ID`: Cloudflare R2 access key
- `R2_SECRET_ACCESS_KEY`: Cloudflare R2 secret
- `R2_ENDPOINT`: R2 endpoint URL
- `R2_BUCKET_*`: Bucket names for different content types

### 7. 📊 Monitoring & Debugging
- `ENABLE_SECURITY_AUDIT`: Security event logging
- `SECURITY_LOG_LEVEL`: Log verbosity
- `ENABLE_DEBUG_LOGGING`: Debug information

## 🔒 Security Best Practices

### Development Environment
```bash
# ✅ Safe for development
JWT_SECRET=development_jwt_secret_key_not_for_production
ENABLE_FINGERPRINT_VALIDATION=false  # Easier testing
SECURITY_LOG_LEVEL=debug              # Detailed logs
```

### Staging Environment
```bash
# ✅ Production-like testing
JWT_SECRET=$(openssl rand -base64 64)  # Unique secret
ENABLE_FINGERPRINT_VALIDATION=true    # Test all features
HASH_ONLY_TOKEN_STORAGE=true         # Test production security
```

### Production Environment
```bash
# ✅ Maximum security
JWT_SECRET=$(openssl rand -base64 64)  # Strong unique secret
JWT_ALGORITHM=RS256                    # Asymmetric signing
HASH_ONLY_TOKEN_STORAGE=true          # Never store plain tokens
ENABLE_RISK_BASED_TOKENS=true         # Dynamic security
```

## 🚀 Deployment Workflow

### 1. Development → Staging
```bash
# Copy and update environment
cp .env.development.template .env.staging
# Update secrets and endpoints
# Test all features in staging
```

### 2. Staging → Production
```bash
# Copy and secure environment  
cp .env.staging.template .env.production
# Generate new production secrets
# Enable maximum security features
# Deploy with zero downtime
```

## 🔧 Environment Validation

### Automated Validation Script
```bash
# Check environment configuration
npm run validate:env

# Check security configuration
npm run security:audit

# Test token configuration
npm run test:tokens
```

### Manual Validation Checklist
- [ ] All required variables are set
- [ ] Database connection works
- [ ] JWT secret is secure (64+ chars)
- [ ] R2 storage is accessible
- [ ] Security features are enabled
- [ ] Rate limiting is configured
- [ ] Monitoring is active

## 🚨 Security Migration Path

### Phase 1: Deploy Enhanced Security
1. Deploy current code with new security features
2. Keep mixed token storage (plain + hash)
3. Monitor for issues

### Phase 2: Validate Token Hashes
1. Run migration to validate all token hashes
2. Fix any hash mismatches
3. Monitor token reuse detection

### Phase 3: Enable Hash-Only Storage
1. Set `HASH_ONLY_TOKEN_STORAGE=true`
2. Deploy update that uses only hash validation
3. Monitor security logs

### Phase 4: Complete Migration
1. Update schema to make token field nullable
2. Deploy final version without plain token storage
3. Complete security audit

## 📞 Support & Troubleshooting

### Common Issues
1. **JWT Secret Too Short**: Must be 64+ characters for production
2. **Database Connection**: Check network and credentials
3. **R2 Access**: Verify access keys and bucket permissions
4. **Token Validation**: Check hash generation consistency

### Debug Commands
```bash
# Test database connection
npm run db:test

# Validate JWT configuration  
npm run jwt:test

# Check R2 storage access
npm run storage:test

# Run security audit
npm run security:check
```

---

**Environment Status**: 🟢 **Optimized & Structured**  
**Security Level**: 🔒 **Production-Ready**  
**Documentation**: 📚 **Complete**
