export const AUTH_CONSTANTS = {
  // JWT Configuration
  JWT: {
    ACCESS_TOKEN_EXPIRES_IN: '15m',
    REFRESH_TOKEN_EXPIRES_IN: '30d',
    ALGORITHM: 'HS256',
  },

  // Password Policy
  PASSWORD: {
    MIN_LENGTH: 8,
    MAX_LENGTH: 128,
    REQUIRE_UPPERCASE: true,
    REQUIRE_LOWERCASE: true,
    REQUIRE_NUMBERS: true,
    REQUIRE_SPECIAL_CHARS: true,
    SPECIAL_CHARS: '@$!%*?&',
  },

  // Username Policy
  USERNAME: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 30,
    ALLOWED_PATTERN: /^[a-zA-Z0-9_]+$/,
  },

  // Rate Limiting
  RATE_LIMIT: {
    LOGIN_ATTEMPTS: 5,
    LOGIN_WINDOW_MINUTES: 15,
    REGISTRATION_ATTEMPTS: 3,
    REGISTRATION_WINDOW_MINUTES: 60,
    PASSWORD_RESET_ATTEMPTS: 3,
    PASSWORD_RESET_WINDOW_MINUTES: 60,
  },

  // Session Management
  SESSION: {
    MAX_CONCURRENT_SESSIONS: 3,
    IDLE_TIMEOUT_MINUTES: 30,
    ABSOLUTE_TIMEOUT_HOURS: 24,
  },

  // OAuth Providers
  OAUTH_PROVIDERS: ['google', 'twitter', 'facebook', 'github', 'discord'] as const,

  // Security
  SECURITY: {
    BCRYPT_ROUNDS: 12,
    CSRF_TOKEN_LENGTH: 32,
    SESSION_TOKEN_LENGTH: 64,
  },

  // Cache TTL (in seconds)
  CACHE_TTL: {
    USER_PROFILE: 300, // 5 minutes
    USER_PERMISSIONS: 600, // 10 minutes
    BLOCKED_USERS: 1800, // 30 minutes
  },
} as const;

export type OAuthProvider = (typeof AUTH_CONSTANTS.OAUTH_PROVIDERS)[number];
