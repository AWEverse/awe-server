/**
 * Константы типов файлов и конфигураций
 * Централизованное хранение всех конфигураций файлов
 */

import { R2BucketType } from '../types';

export const FILE_SIZE_LIMITS = {
  AVATAR: 5 * 1024 * 1024, // 5MB
  BANNER: 10 * 1024 * 1024, // 10MB
  IMAGE_POST: 20 * 1024 * 1024, // 20MB
  VIDEO: 2 * 1024 * 1024 * 1024, // 2GB
  SHORT_VIDEO: 100 * 1024 * 1024, // 100MB
  DOCUMENT: 50 * 1024 * 1024, // 50MB
  ARCHIVE: 100 * 1024 * 1024, // 100MB
  EMOJI: 512 * 1024, // 512KB
  STICKER: 1024 * 1024, // 1MB
  GIF: 10 * 1024 * 1024, // 10MB
  VOICE: 10 * 1024 * 1024, // 10MB
  AUDIO: 50 * 1024 * 1024, // 50MB
  MESSAGE_ATTACHMENT: 50 * 1024 * 1024, // 50MB
  PROFILE_BACKGROUND: 10 * 1024 * 1024, // 10MB
} as const;

export const CACHE_CONTROL_SETTINGS = {
  PUBLIC_LONG: 'public, max-age=31536000', // 1 year
  PUBLIC_MEDIUM: 'public, max-age=604800', // 1 week
  PRIVATE_SHORT: 'private, max-age=86400', // 1 day
} as const;

export const MIME_TYPE_GROUPS = {
  IMAGES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/svg+xml'],
  VIDEOS: [
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/avi',
    'video/mov',
    'video/wmv',
    'video/flv',
    'video/mkv',
  ],
  AUDIO: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/mp3'],
  DOCUMENTS: [
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
  ARCHIVES: ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'],
} as const;

export interface FileTypeConfig {
  readonly bucket: R2BucketType;
  readonly allowedMimeTypes: readonly string[];
  readonly maxSize: number;
  readonly cacheControl: string;
}

export const FILE_TYPE_CONFIGS: Readonly<Record<string, FileTypeConfig>> = {
  avatar: {
    bucket: R2BucketType.IMAGES,
    allowedMimeTypes: MIME_TYPE_GROUPS.IMAGES.slice(0, 4), // jpeg, png, webp, gif
    maxSize: FILE_SIZE_LIMITS.AVATAR,
    cacheControl: CACHE_CONTROL_SETTINGS.PUBLIC_LONG,
  },
  banner: {
    bucket: R2BucketType.IMAGES,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: FILE_SIZE_LIMITS.BANNER,
    cacheControl: CACHE_CONTROL_SETTINGS.PUBLIC_LONG,
  },
  image_post: {
    bucket: R2BucketType.IMAGES,
    allowedMimeTypes: MIME_TYPE_GROUPS.IMAGES.slice(0, 4),
    maxSize: FILE_SIZE_LIMITS.IMAGE_POST,
    cacheControl: CACHE_CONTROL_SETTINGS.PUBLIC_MEDIUM,
  },
  video: {
    bucket: R2BucketType.VIDEOS,
    allowedMimeTypes: MIME_TYPE_GROUPS.VIDEOS,
    maxSize: FILE_SIZE_LIMITS.VIDEO,
    cacheControl: CACHE_CONTROL_SETTINGS.PUBLIC_MEDIUM,
  },
  short_video: {
    bucket: R2BucketType.VIDEOS,
    allowedMimeTypes: ['video/mp4', 'video/webm'],
    maxSize: FILE_SIZE_LIMITS.SHORT_VIDEO,
    cacheControl: CACHE_CONTROL_SETTINGS.PUBLIC_MEDIUM,
  },
  document: {
    bucket: R2BucketType.DOCUMENTS,
    allowedMimeTypes: MIME_TYPE_GROUPS.DOCUMENTS,
    maxSize: FILE_SIZE_LIMITS.DOCUMENT,
    cacheControl: CACHE_CONTROL_SETTINGS.PRIVATE_SHORT,
  },
  archive: {
    bucket: R2BucketType.DOCUMENTS,
    allowedMimeTypes: MIME_TYPE_GROUPS.ARCHIVES,
    maxSize: FILE_SIZE_LIMITS.ARCHIVE,
    cacheControl: CACHE_CONTROL_SETTINGS.PRIVATE_SHORT,
  },
  emoji: {
    bucket: R2BucketType.IMAGES,
    allowedMimeTypes: ['image/png', 'image/webp'],
    maxSize: FILE_SIZE_LIMITS.EMOJI,
    cacheControl: CACHE_CONTROL_SETTINGS.PUBLIC_LONG,
  },
  sticker: {
    bucket: R2BucketType.IMAGES,
    allowedMimeTypes: ['image/png', 'image/webp'],
    maxSize: FILE_SIZE_LIMITS.STICKER,
    cacheControl: CACHE_CONTROL_SETTINGS.PUBLIC_LONG,
  },
  gif: {
    bucket: R2BucketType.IMAGES,
    allowedMimeTypes: ['image/gif'],
    maxSize: FILE_SIZE_LIMITS.GIF,
    cacheControl: CACHE_CONTROL_SETTINGS.PUBLIC_LONG,
  },
  voice: {
    bucket: R2BucketType.DOCUMENTS,
    allowedMimeTypes: ['audio/ogg', 'audio/mpeg', 'audio/wav'],
    maxSize: FILE_SIZE_LIMITS.VOICE,
    cacheControl: CACHE_CONTROL_SETTINGS.PRIVATE_SHORT,
  },
  audio: {
    bucket: R2BucketType.DOCUMENTS,
    allowedMimeTypes: MIME_TYPE_GROUPS.AUDIO,
    maxSize: FILE_SIZE_LIMITS.AUDIO,
    cacheControl: CACHE_CONTROL_SETTINGS.PRIVATE_SHORT,
  },
  message_attachment: {
    bucket: R2BucketType.DOCUMENTS,
    allowedMimeTypes: [
      ...MIME_TYPE_GROUPS.IMAGES,
      ...MIME_TYPE_GROUPS.VIDEOS.slice(0, 3), // mp4, webm, ogg
      ...MIME_TYPE_GROUPS.AUDIO.slice(0, 3), // mpeg, wav, ogg
      ...MIME_TYPE_GROUPS.DOCUMENTS,
      ...MIME_TYPE_GROUPS.ARCHIVES.slice(0, 2), // zip, rar
    ],
    maxSize: FILE_SIZE_LIMITS.MESSAGE_ATTACHMENT,
    cacheControl: CACHE_CONTROL_SETTINGS.PRIVATE_SHORT,
  },
  profile_background: {
    bucket: R2BucketType.IMAGES,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: FILE_SIZE_LIMITS.PROFILE_BACKGROUND,
    cacheControl: CACHE_CONTROL_SETTINGS.PUBLIC_LONG,
  },
} as const;
