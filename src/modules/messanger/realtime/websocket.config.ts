export const WEBSOCKET_CONFIG = {
  // Connection limits
  MAX_CONNECTIONS_PER_USER: 3,
  MAX_CONNECTIONS_TOTAL: 10000,

  // Performance timers (milliseconds)
  PING_TIMEOUT: 60000, // 1 minute
  PING_INTERVAL: 25000, // 25 seconds

  // Cleanup intervals
  CLEANUP_INTERVAL: 60000, // 1 minute
  TYPING_CLEANUP_INTERVAL: 5000, // 5 seconds
  STALE_CONNECTION_THRESHOLD: 5 * 60 * 1000, // 5 minutes

  // Message limits
  MAX_MESSAGE_LENGTH: 10000, // characters
  MAX_ATTACHMENTS: 10,
  MAX_HTTP_BUFFER_SIZE: 1e6, // 1MB

  // Auto-join limits
  MAX_AUTO_JOIN_CHATS: 50,

  // Typing indicator auto-cleanup
  TYPING_INDICATOR_TIMEOUT: 5000, // 5 seconds

  // Memory optimization
  ENABLE_COMPRESSION: true,
  WEBSOCKET_ONLY: true, // Disable polling for better performance

  // Rate limiting
  MESSAGES_PER_MINUTE: 30,
  REACTIONS_PER_MINUTE: 60,
  TYPING_EVENTS_PER_MINUTE: 120,
} as const;
