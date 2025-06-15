import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsBoolean,
  Min,
  Max,
  IsArray,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

// === Base DTOs ===

export class PaginationDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value))
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value))
  limit?: number = 20;
}

export class SearchDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Search query' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ description: 'Tags to filter by' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

// === Sticker DTOs ===

export class CreateStickerPackDto {
  @ApiProperty({ description: 'Pack name (unique identifier)' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Display title' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Pack description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Price in cents (0 for free)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number = 0;

  @ApiPropertyOptional({ description: 'Category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Tags (comma-separated)' })
  @IsOptional()
  @IsString()
  tags?: string;

  @ApiPropertyOptional({ description: 'Is premium pack' })
  @IsOptional()
  @IsBoolean()
  isPremium?: boolean = false;

  @ApiPropertyOptional({ description: 'Is animated pack' })
  @IsOptional()
  @IsBoolean()
  isAnimated?: boolean = false;

  @ApiPropertyOptional({ description: 'Is official pack' })
  @IsOptional()
  @IsBoolean()
  isOfficial?: boolean = false;
}

export class UpdateStickerPackDto {
  @ApiPropertyOptional({ description: 'Display title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Pack description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Price in cents' })
  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: 'Category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Tags (comma-separated)' })
  @IsOptional()
  @IsString()
  tags?: string;

  @ApiPropertyOptional({ description: 'Is premium pack' })
  @IsOptional()
  @IsBoolean()
  isPremium?: boolean;

  @ApiPropertyOptional({ description: 'Is disabled' })
  @IsOptional()
  @IsBoolean()
  isDisabled?: boolean;
}

export class CreateStickerDto {
  @ApiProperty({ description: 'Pack ID' })
  @IsString()
  packId: string;

  @ApiProperty({ description: 'Associated emoji' })
  @IsString()
  emoji: string;

  @ApiProperty({ description: 'File name' })
  @IsString()
  fileName: string;

  @ApiPropertyOptional({ description: 'Position in pack' })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number = 0;

  @ApiPropertyOptional({ description: 'Is animated sticker' })
  @IsOptional()
  @IsBoolean()
  isAnimated?: boolean = false;

  @ApiPropertyOptional({ description: 'Is premium sticker' })
  @IsOptional()
  @IsBoolean()
  isPremium?: boolean = false;
}

export class UpdateStickerDto {
  @ApiPropertyOptional({ description: 'Associated emoji' })
  @IsOptional()
  @IsString()
  emoji?: string;

  @ApiPropertyOptional({ description: 'Position in pack' })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({ description: 'Is animated sticker' })
  @IsOptional()
  @IsBoolean()
  isAnimated?: boolean;

  @ApiPropertyOptional({ description: 'Is premium sticker' })
  @IsOptional()
  @IsBoolean()
  isPremium?: boolean;
}

export class StickerPackQueryDto extends SearchDto {
  @ApiPropertyOptional({ description: 'Filter by category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Filter by price type', enum: ['free', 'paid', 'all'] })
  @IsOptional()
  @IsEnum(['free', 'paid', 'all'])
  priceType?: 'free' | 'paid' | 'all' = 'all';

  @ApiPropertyOptional({ description: 'Include premium packs' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  includePremium?: boolean = true;

  @ApiPropertyOptional({ description: 'Sort by', enum: ['popular', 'recent', 'alphabetical'] })
  @IsOptional()
  @IsEnum(['popular', 'recent', 'alphabetical'])
  sortBy?: 'popular' | 'recent' | 'alphabetical' = 'popular';
}

// === Emoji DTOs ===

export class CreateCustomEmojiDto {
  @ApiProperty({ description: 'Emoji name (without colons)' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'File name' })
  @IsString()
  fileName: string;

  @ApiPropertyOptional({ description: 'Chat ID (null for global emoji)' })
  @IsOptional()
  @IsString()
  chatId?: string;

  @ApiPropertyOptional({ description: 'Is animated emoji' })
  @IsOptional()
  @IsBoolean()
  isAnimated?: boolean = false;

  @ApiPropertyOptional({ description: 'Is premium emoji' })
  @IsOptional()
  @IsBoolean()
  isPremium?: boolean = false;
}

export class UpdateCustomEmojiDto {
  @ApiPropertyOptional({ description: 'Emoji name (without colons)' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Is disabled' })
  @IsOptional()
  @IsBoolean()
  isDisabled?: boolean;
}

export class CustomEmojiQueryDto extends SearchDto {
  @ApiPropertyOptional({ description: 'Chat ID to filter by' })
  @IsOptional()
  @IsString()
  chatId?: string;

  @ApiPropertyOptional({ description: 'Include global emojis' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  includeGlobal?: boolean = true;

  @ApiPropertyOptional({ description: 'Include animated emojis' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  includeAnimated?: boolean = true;

  @ApiPropertyOptional({ description: 'Sort by', enum: ['popular', 'recent', 'alphabetical'] })
  @IsOptional()
  @IsEnum(['popular', 'recent', 'alphabetical'])
  sortBy?: 'popular' | 'recent' | 'alphabetical' = 'popular';
}

// === GIF DTOs ===

export class CreateGifCategoryDto {
  @ApiProperty({ description: 'Category name (unique)' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Category description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Category icon URL' })
  @IsOptional()
  @IsString()
  iconUrl?: string;

  @ApiPropertyOptional({ description: 'Display position' })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number = 0;

  @ApiPropertyOptional({ description: 'Is trending category' })
  @IsOptional()
  @IsBoolean()
  isTrending?: boolean = false;

  @ApiPropertyOptional({ description: 'Is featured category' })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean = false;
}

export class CreateGifDto {
  @ApiProperty({ description: 'Category ID' })
  @IsString()
  categoryId: string;

  @ApiProperty({ description: 'GIF title' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'File name' })
  @IsString()
  fileName: string;

  @ApiPropertyOptional({ description: 'Duration in seconds' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  duration?: number;

  @ApiPropertyOptional({ description: 'Tags (comma-separated)' })
  @IsOptional()
  @IsString()
  tags?: string;

  @ApiPropertyOptional({ description: 'Search text for indexing' })
  @IsOptional()
  @IsString()
  searchText?: string;

  @ApiPropertyOptional({ description: 'Is trending GIF' })
  @IsOptional()
  @IsBoolean()
  isTrending?: boolean = false;

  @ApiPropertyOptional({ description: 'Is featured GIF' })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean = false;

  @ApiPropertyOptional({ description: 'Is NSFW content' })
  @IsOptional()
  @IsBoolean()
  isNsfw?: boolean = false;
}

export class UpdateGifDto {
  @ApiPropertyOptional({ description: 'GIF title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Category ID' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Tags (comma-separated)' })
  @IsOptional()
  @IsString()
  tags?: string;

  @ApiPropertyOptional({ description: 'Search text for indexing' })
  @IsOptional()
  @IsString()
  searchText?: string;

  @ApiPropertyOptional({ description: 'Is trending GIF' })
  @IsOptional()
  @IsBoolean()
  isTrending?: boolean;

  @ApiPropertyOptional({ description: 'Is featured GIF' })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ description: 'Is NSFW content' })
  @IsOptional()
  @IsBoolean()
  isNsfw?: boolean;
}

export class GifQueryDto extends SearchDto {
  @ApiPropertyOptional({ description: 'Filter by category ID' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Include trending GIFs only' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  trendingOnly?: boolean = false;

  @ApiPropertyOptional({ description: 'Include featured GIFs only' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  featuredOnly?: boolean = false;

  @ApiPropertyOptional({ description: 'Exclude NSFW content' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  safeMode?: boolean = true;

  @ApiPropertyOptional({
    description: 'Sort by',
    enum: ['popular', 'recent', 'trending', 'alphabetical'],
  })
  @IsOptional()
  @IsEnum(['popular', 'recent', 'trending', 'alphabetical'])
  sortBy?: 'popular' | 'recent' | 'trending' | 'alphabetical' = 'popular';
}

// === Upload DTOs ===

export class MediaUploadDto {
  @ApiProperty({ description: 'Media type', enum: ['sticker', 'emoji', 'gif'] })
  @IsEnum(['sticker', 'emoji', 'gif'])
  mediaType: 'sticker' | 'emoji' | 'gif';

  @ApiProperty({ description: 'File name' })
  @IsString()
  fileName: string;

  @ApiPropertyOptional({ description: 'Generate preview image' })
  @IsOptional()
  @IsBoolean()
  generatePreview?: boolean = true;

  @ApiPropertyOptional({ description: 'Optimize file size' })
  @IsOptional()
  @IsBoolean()
  optimize?: boolean = true;
}

export class BulkUploadDto {
  @ApiProperty({ description: 'Pack or category ID' })
  @IsString()
  parentId: string;

  @ApiProperty({ description: 'Media type', enum: ['sticker', 'gif'] })
  @IsEnum(['sticker', 'gif'])
  mediaType: 'sticker' | 'gif';

  @ApiPropertyOptional({ description: 'Auto-generate metadata' })
  @IsOptional()
  @IsBoolean()
  autoGenerateMetadata?: boolean = true;
}
