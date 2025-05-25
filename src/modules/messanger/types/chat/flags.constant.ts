// Флаги для чатов (битовые маски)
export const ChatFlags = {
  ARCHIVED: 1 << 0, // 1 - архивированный
  PUBLIC: 1 << 1, // 2 - публичный
  VERIFIED: 1 << 2, // 4 - верифицированный
  PREMIUM: 1 << 3, // 8 - премиум
} as const;

// Флаги для участников чата
export const ChatParticipantFlags = {
  ADMIN: 1 << 0, // 1 - администратор
  OWNER: 1 << 1, // 2 - владелец
  MUTED: 1 << 2, // 4 - в муте
  BANNED: 1 << 3, // 8 - заблокирован
} as const;

// Флаги для сообщений
export const MessageFlags = {
  DELETED: 1 << 0, // 1 - удалено
  EDITED: 1 << 1, // 2 - отредактировано
  FORWARDED: 1 << 2, // 4 - переслано
  PINNED: 1 << 3, // 8 - закреплено
} as const;

// Флаги для стикер-паков
export const StickerPackFlags = {
  PREMIUM: 1 << 0, // 1 - премиум
  ANIMATED: 1 << 1, // 2 - анимированный
  OFFICIAL: 1 << 2, // 4 - официальный
  NSFW: 1 << 3, // 8 - не для всех
  DISABLED: 1 << 4, // 16 - отключен
} as const;

// Флаги для кастомных эмоджи
export const CustomEmojiFlags = {
  ANIMATED: 1 << 0, // 1 - анимированный
  PREMIUM: 1 << 1, // 2 - премиум
  VERIFIED: 1 << 2, // 4 - верифицированный
  DISABLED: 1 << 3, // 8 - отключен
} as const;

// Флаги для GIF
export const GifFlags = {
  TRENDING: 1 << 0, // 1 - в тренде
  FEATURED: 1 << 1, // 2 - рекомендуемый
  NSFW: 1 << 2, // 4 - не для всех
  VERIFIED: 1 << 3, // 8 - верифицированный
} as const;
