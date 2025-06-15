export const TOKEN_CONFIG = {
  ACCESS_TOKEN: {
    // Default: 15 minutes, can be overridden by env
    DEFAULT_LIFETIME_MS: 15 * 60 * 1000,
    ENV_KEY: 'JWT_ACCESS_TOKEN_LIFETIME_MINUTES',
  },
  REFRESH_TOKEN: {
    // Default: 30 days, can be overridden by env
    DEFAULT_LIFETIME_DAYS: 30,
    ENV_KEY: 'JWT_REFRESH_TOKEN_LIFETIME_DAYS',
  },
  SESSION: {
    // Default: 24 hours, can be overridden by env
    DEFAULT_LIFETIME_HOURS: 24,
    ENV_KEY: 'SESSION_LIFETIME_HOURS',
  },
} as const;

export interface TokenLifetimes {
  accessTokenMs: number;
  refreshTokenMs: number;
  sessionMs: number;
}
