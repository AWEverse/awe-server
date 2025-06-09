import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  MaxLength,
  Min,
  Max,
  IsBoolean,
  IsEnum,
  IsDate,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateForumPostDto {
  @ApiProperty({
    description: 'Post title',
    maxLength: 200,
    example: 'How to implement authentication in NestJS',
  })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({
    description: 'Post content in markdown',
    example: 'I am trying to implement JWT authentication...',
  })
  @IsString()
  content: string;

  @ApiProperty({
    description: 'Category ID where the post will be created',
    example: '123',
  })
  @IsString()
  categoryId: string;

  @ApiPropertyOptional({
    description: 'Array of tag names',
    example: ['nestjs', 'authentication', 'jwt'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Pin the post to the top',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional({
    description: 'Mark as featured post',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  featured?: boolean;
}

export class UpdateForumPostDto {
  @ApiPropertyOptional({
    description: 'Post title',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    description: 'Post content in markdown',
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    description: 'Array of tag names',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Pin the post to the top',
  })
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional({
    description: 'Lock the post (prevent replies)',
  })
  @IsOptional()
  @IsBoolean()
  locked?: boolean;

  @ApiPropertyOptional({
    description: 'Mark as featured post',
  })
  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional({
    description: 'Mark as solved',
  })
  @IsOptional()
  @IsBoolean()
  solved?: boolean;
}

export class CreateForumReplyDto {
  @ApiProperty({
    description: 'Reply content in markdown',
    example: 'You can use @nestjs/passport with JWT strategy...',
  })
  @IsString()
  content: string;

  @ApiPropertyOptional({
    description: 'Parent reply ID for threaded replies',
    example: '456',
  })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({
    description: 'Mark this reply as the solution',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isSolution?: boolean;
}

export class UpdateForumReplyDto {
  @ApiPropertyOptional({
    description: 'Reply content in markdown',
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    description: 'Mark this reply as the solution',
  })
  @IsOptional()
  @IsBoolean()
  isSolution?: boolean;
}

export class CreateForumCategoryDto {
  @ApiProperty({
    description: 'Category name',
    maxLength: 64,
    example: 'Web Development',
  })
  @IsString()
  @MaxLength(64)
  name: string;

  @ApiProperty({
    description: 'Category slug for URLs',
    maxLength: 64,
    example: 'web-development',
  })
  @IsString()
  @MaxLength(64)
  slug: string;

  @ApiPropertyOptional({
    description: 'Category description',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({
    description: 'Category color in hex format',
    example: '#FF5733',
  })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({
    description: 'Category icon (emoji or icon class)',
    example: '💻',
  })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({
    description: 'Parent category ID for subcategories',
  })
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional({
    description: 'Category position in order',
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({
    description: 'Requires moderation',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  moderated?: boolean;

  @ApiPropertyOptional({
    description: 'Private category',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  private?: boolean;
  // Если forumId нужен и это строка:
  @ApiPropertyOptional({ description: 'Forum ID' })
  @IsOptional()
  @IsString()
  forumId?: string;
}

export class UpdateForumCategoryDto {
  @ApiPropertyOptional({
    description: 'Category name',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @ApiPropertyOptional({
    description: 'Category slug for URLs',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  slug?: string;

  @ApiPropertyOptional({
    description: 'Category description',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiPropertyOptional({
    description: 'Category color in hex format',
  })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({
    description: 'Category icon (emoji or icon class)',
  })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({
    description: 'Category position in order',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({
    description: 'Archive the category',
  })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @ApiPropertyOptional({
    description: 'Requires moderation',
  })
  @IsOptional()
  @IsBoolean()
  moderated?: boolean;

  @ApiPropertyOptional({
    description: 'Private category',
  })
  @IsOptional()
  @IsBoolean()
  private?: boolean;
}

export class ForumVoteDto {
  @ApiProperty({
    description: 'Vote value: 1 for upvote, -1 for downvote',
    enum: [1, -1],
    example: 1,
  })
  @IsInt()
  @Transform(({ value }) => parseInt(value))
  @Min(-1)
  @Max(1)
  value: number;
}

// Response DTOs
export class ForumUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  avatar?: string;

  @ApiProperty()
  reputation: number;

  @ApiProperty()
  postCount: number;

  @ApiProperty()
  createdAt: Date;
}

export class ForumCategoryResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  description?: string;

  @ApiProperty()
  color?: string;

  @ApiProperty()
  icon?: string;

  @ApiProperty()
  position: number;

  @ApiProperty()
  postCount: number;

  @ApiProperty()
  topicCount: number;

  @ApiProperty()
  lastActivity?: Date;

  @ApiProperty()
  archived: boolean;

  @ApiProperty()
  moderated: boolean;

  @ApiProperty()
  private: boolean;

  @ApiProperty()
  parentId?: string;

  @ApiProperty({ type: [ForumCategoryResponseDto] })
  children?: ForumCategoryResponseDto[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ForumTagDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  color?: string;

  @ApiProperty()
  usageCount: number;
}

export class ForumReplyResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  content: string;

  @ApiProperty()
  isSolution: boolean;

  @ApiProperty()
  upvotes: number;

  @ApiProperty()
  downvotes: number;

  @ApiProperty()
  netVotes: number;

  @ApiProperty()
  parentId?: string;

  @ApiProperty({ type: ForumUserDto })
  author: ForumUserDto;

  @ApiProperty({ type: [ForumReplyResponseDto] })
  children?: ForumReplyResponseDto[];

  @ApiProperty()
  userVote?: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ForumPostResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  content: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  views: number;

  @ApiProperty()
  upvotes: number;

  @ApiProperty()
  downvotes: number;

  @ApiProperty()
  netVotes: number;

  @ApiProperty()
  replyCount: number;

  @ApiProperty()
  pinned: boolean;

  @ApiProperty()
  locked: boolean;

  @ApiProperty()
  featured: boolean;

  @ApiProperty()
  solved: boolean;

  @ApiProperty()
  lastActivity?: Date;

  @ApiProperty({ type: ForumUserDto })
  author: ForumUserDto;

  @ApiProperty({ type: ForumCategoryResponseDto })
  category: ForumCategoryResponseDto;

  @ApiProperty({ type: [ForumTagDto] })
  tags: ForumTagDto[];

  @ApiProperty({ type: [ForumReplyResponseDto] })
  replies?: ForumReplyResponseDto[];

  @ApiProperty()
  userVote?: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

// Query DTOs
export class ForumPostQueryDto {
  @ApiPropertyOptional({
    description: 'Category ID to filter posts',
    example: '123',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Tag name to filter posts',
    example: 'nestjs',
  })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({
    description: 'Search query',
    example: 'authentication',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Sort by field',
    enum: ['latest', 'popular', 'hot', 'views', 'votes'],
    default: 'latest',
  })
  @IsOptional()
  @IsEnum(['latest', 'popular', 'hot', 'views', 'votes'])
  sortBy?: string = 'latest';

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: string = 'desc';

  @ApiPropertyOptional({
    description: 'Show only solved posts',
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  solved?: boolean;

  @ApiPropertyOptional({
    description: 'Show only featured posts',
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional({
    description: 'Page number',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class PaginationMetaDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;

  @ApiProperty()
  hasPrevious: boolean;

  @ApiProperty()
  hasNext: boolean;
}

export class PaginatedForumPostsDto {
  @ApiProperty({ type: [ForumPostResponseDto] })
  data: ForumPostResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class ForumStatsDto {
  @ApiProperty()
  totalPosts: number;

  @ApiProperty()
  totalReplies: number;

  @ApiProperty()
  totalUsers: number;

  @ApiProperty()
  totalCategories: number;

  @ApiProperty()
  todayPosts: number;

  @ApiProperty()
  todayReplies: number;

  @ApiProperty()
  activeUsers: number;
}

// Moderation DTOs
export class CreateForumReportDto {
  @ApiProperty({
    description: 'Reason for reporting',
    enum: ['SPAM', 'HARASSMENT', 'INAPPROPRIATE_CONTENT', 'COPYRIGHT', 'OTHER'],
  })
  @IsEnum(['SPAM', 'HARASSMENT', 'INAPPROPRIATE_CONTENT', 'COPYRIGHT', 'OTHER'])
  reason: string;

  @ApiPropertyOptional({
    description: 'Additional details about the report',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  details?: string;
}

export class ForumModerationActionDto {
  @ApiProperty({
    description: 'Moderation action',
    enum: ['WARN', 'DELETE', 'EDIT', 'LOCK', 'MOVE', 'FEATURE', 'PIN'],
  })
  @IsEnum(['WARN', 'DELETE', 'EDIT', 'LOCK', 'MOVE', 'FEATURE', 'PIN'])
  action: string;

  @ApiPropertyOptional({
    description: 'Reason for the action',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @ApiPropertyOptional({
    description: 'Additional notes',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
