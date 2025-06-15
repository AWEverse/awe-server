import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// === Base Response Types ===

export interface PaginationMeta {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly pages: number;
  readonly hasNext: boolean;
  readonly hasPrev: boolean;
}

export interface ApiResponse<T> {
  readonly success: boolean;
  readonly data: T;
  readonly message?: string;
  readonly meta?: PaginationMeta;
}

export interface PaginatedResponse<T> {
  readonly items: readonly T[];
  readonly meta: PaginationMeta;
}

// === Media Asset Base Types ===

export interface MediaMetadata {
  readonly width: number;
  readonly height: number;
  readonly fileSize: number;
  readonly mimeType: string;
  readonly duration?: number; // For GIFs
}

export interface MediaFile {
  readonly url: string;
  readonly fileName: string;
  readonly metadata: MediaMetadata;
}

// === Sticker Types ===

export interface StickerPackInfo {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly description?: string;
  readonly authorId?: string;
  readonly thumbnailUrl: string;
  readonly flags: number;
  readonly price: number;
  readonly category?: string;
  readonly tags?: string;
  readonly downloadCount: number;
  readonly usageCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly author?: {
    readonly id: string;
    readonly username: string;
    readonly fullName?: string;
    readonly avatarUrl?: string;
  };
  readonly stickerCount: number;
  readonly isPremium: boolean;
  readonly isAnimated: boolean;
  readonly isOfficial: boolean;
  readonly isDisabled: boolean;
  readonly isPurchased?: boolean; // For user context
}

export interface StickerInfo {
  readonly id: string;
  readonly packId: string;
  readonly emoji: string;
  readonly fileUrl: string;
  readonly fileName: string;
  readonly metadata: MediaMetadata;
  readonly flags: number;
  readonly usageCount: number;
  readonly position: number;
  readonly createdAt: Date;
  readonly pack?: StickerPackInfo;
  readonly isAnimated: boolean;
  readonly isPremium: boolean;
}

export interface StickerUploadResult {
  readonly sticker: StickerInfo;
  readonly uploadInfo: {
    readonly originalSize: number;
    readonly compressedSize: number;
    readonly compressionRatio: number;
    readonly processingTime: number;
  };
}

// === Custom Emoji Types ===

export interface CustomEmojiInfo {
  readonly id: string;
  readonly chatId?: string;
  readonly authorId: string;
  readonly name: string;
  readonly fileUrl: string;
  readonly metadata: MediaMetadata;
  readonly flags: number;
  readonly usageCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly author: {
    readonly id: string;
    readonly username: string;
    readonly fullName?: string;
    readonly avatarUrl?: string;
  };
  readonly chat?: {
    readonly id: string;
    readonly name?: string;
    readonly type: string;
  };
  readonly isAnimated: boolean;
  readonly isPremium: boolean;
  readonly isVerified: boolean;
  readonly isDisabled: boolean;
  readonly isGlobal: boolean;
}

export interface EmojiUploadResult {
  readonly emoji: CustomEmojiInfo;
  readonly uploadInfo: {
    readonly originalSize: number;
    readonly optimizedSize: number;
    readonly processingTime: number;
    readonly previewGenerated: boolean;
  };
}

// === GIF Types ===

export interface GifCategoryInfo {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly iconUrl?: string;
  readonly flags: number;
  readonly position: number;
  readonly gifCount: number;
  readonly createdAt: Date;
  readonly isTrending: boolean;
  readonly isFeatured: boolean;
  readonly isNsfw: boolean;
}

export interface GifInfo {
  readonly id: string;
  readonly categoryId: string;
  readonly title: string;
  readonly url: string;
  readonly previewUrl: string;
  readonly metadata: MediaMetadata & { readonly duration?: number };
  readonly tags?: string;
  readonly searchText?: string;
  readonly flags: number;
  readonly usageCount: number;
  readonly createdAt: Date;
  readonly category: GifCategoryInfo;
  readonly isTrending: boolean;
  readonly isFeatured: boolean;
  readonly isNsfw: boolean;
  readonly isVerified: boolean;
}

export interface GifUploadResult {
  readonly gif: GifInfo;
  readonly uploadInfo: {
    readonly originalSize: number;
    readonly processedSize: number;
    readonly previewSize: number;
    readonly processingTime: number;
    readonly framesProcessed: number;
  };
}

// === Search and Filter Types ===

export interface SearchFilters {
  readonly query?: string;
  readonly tags?: readonly string[];
  readonly category?: string;
  readonly flags?: {
    readonly premium?: boolean;
    readonly animated?: boolean;
    readonly nsfw?: boolean;
    readonly trending?: boolean;
    readonly featured?: boolean;
  };
  readonly dateRange?: {
    readonly from?: Date;
    readonly to?: Date;
  };
  readonly sizeRange?: {
    readonly minSize?: number;
    readonly maxSize?: number;
  };
}

export interface SortOptions {
  readonly field: 'popular' | 'recent' | 'trending' | 'alphabetical' | 'usage';
  readonly direction: 'asc' | 'desc';
}

// === Bulk Operation Types ===

export interface BulkUploadResult<T> {
  readonly successful: readonly T[];
  readonly failed: readonly {
    readonly fileName: string;
    readonly error: string;
    readonly details?: any;
  }[];
  readonly summary: {
    readonly total: number;
    readonly successful: number;
    readonly failed: number;
    readonly totalSize: number;
    readonly processingTime: number;
  };
}

export interface BulkDeleteResult {
  readonly deleted: readonly string[];
  readonly failed: readonly {
    readonly id: string;
    readonly error: string;
  }[];
  readonly summary: {
    readonly total: number;
    readonly successful: number;
    readonly failed: number;
  };
}

// === Statistics Types ===

export interface MediaStatistics {
  readonly totalSize: number;
  readonly totalCount: number;
  readonly byType: {
    readonly stickers: number;
    readonly emojis: number;
    readonly gifs: number;
  };
  readonly byFlags: {
    readonly premium: number;
    readonly animated: number;
    readonly trending: number;
    readonly featured: number;
  };
  readonly popularItems: readonly {
    readonly id: string;
    readonly type: 'sticker' | 'emoji' | 'gif';
    readonly name: string;
    readonly usageCount: number;
  }[];
}

export interface UserMediaStats {
  readonly stickerPacks: number;
  readonly customEmojis: number;
  readonly recentUploads: number;
  readonly totalUploads: number;
  readonly storageUsed: number;
  readonly storageLimit: number;
}

// === Error Types ===

export interface MediaValidationError {
  readonly field: string;
  readonly message: string;
  readonly code: string;
  readonly value?: any;
}

export interface MediaUploadError {
  readonly type: 'validation' | 'storage' | 'processing' | 'quota';
  readonly message: string;
  readonly details?: MediaValidationError[];
  readonly fileName?: string;
}

// === Configuration Types ===

export interface MediaLimits {
  readonly maxFileSize: {
    readonly sticker: number;
    readonly emoji: number;
    readonly gif: number;
  };
  readonly maxDimensions: {
    readonly width: number;
    readonly height: number;
  };
  readonly allowedFormats: {
    readonly sticker: readonly string[];
    readonly emoji: readonly string[];
    readonly gif: readonly string[];
  };
  readonly maxUploadsPerHour: number;
  readonly maxStoragePerUser: number;
}

export interface ProcessingOptions {
  readonly compression: {
    readonly enabled: boolean;
    readonly quality: number;
    readonly maxSize: number;
  };
  readonly preview: {
    readonly generate: boolean;
    readonly dimensions: {
      readonly width: number;
      readonly height: number;
    };
  };
  readonly optimization: {
    readonly enabled: boolean;
    readonly stripMetadata: boolean;
    readonly progressive: boolean;
  };
}
