import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ForumSearchService } from '../services/forum-search.service';
import { OptionalAuthGuard } from '../../auth/guards/optional-auth.guard';

@ApiTags('Forum Search')
@Controller('forum/search')
export class ForumSearchController {
  constructor(private readonly forumSearchService: ForumSearchService) {}

  @Get()
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'Global forum search' })
  @ApiQuery({ name: 'q', description: 'Search query' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category ID' })
  @ApiQuery({ name: 'tags', required: false, description: 'Filter by tags (comma-separated)' })
  @ApiQuery({ name: 'author', required: false, description: 'Filter by author ID' })
  @ApiQuery({
    name: 'solved',
    required: false,
    type: Boolean,
    description: 'Filter by solved status',
  })
  @ApiQuery({
    name: 'featured',
    required: false,
    type: Boolean,
    description: 'Filter by featured status',
  })
  @ApiQuery({ name: 'minVotes', required: false, type: Number, description: 'Minimum vote count' })
  @ApiQuery({
    name: 'hasReplies',
    required: false,
    type: Boolean,
    description: 'Has replies filter',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiResponse({
    status: 200,
    description: 'Search results',
    schema: {
      type: 'object',
      properties: {
        posts: { type: 'array' },
        replies: { type: 'array' },
        categories: { type: 'array' },
        tags: { type: 'array' },
        total: { type: 'number' },
      },
    },
  })
  async globalSearch(
    @Request() req: any,
    @Query('q') query: string,
    @Query('category') categoryId?: string,
    @Query('tags') tags?: string,
    @Query('author') authorId?: string,
    @Query('solved') solved?: boolean,
    @Query('featured') featured?: boolean,
    @Query('minVotes', new DefaultValuePipe(0), ParseIntPipe) minVotes?: number,
    @Query('hasReplies') hasReplies?: boolean,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    const filters = {
      categoryId,
      tags: tags ? tags.split(',').map(t => t.trim()) : undefined,
      authorId,
      solved,
      featured,
      minVotes,
      hasReplies,
    };

    return this.forumSearchService.globalSearch(query, filters, page, limit, req.user?.id);
  }

  @Get('posts')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'Search forum posts' })
  @ApiQuery({ name: 'q', description: 'Search query' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category ID' })
  @ApiQuery({ name: 'tags', required: false, description: 'Filter by tags (comma-separated)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiResponse({
    status: 200,
    description: 'Post search results',
    type: 'array',
  })
  async searchPosts(
    @Request() req: any,
    @Query('q') query: string,
    @Query('category') categoryId?: string,
    @Query('tags') tags?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    const filters = {
      categoryId,
      tags: tags ? tags.split(',').map(t => t.trim()) : undefined,
    };

    const skip = (page - 1) * limit;
    return this.forumSearchService.searchPosts(query, filters, skip, limit, req.user?.id);
  }

  @Get('trending')
  @ApiOperation({ summary: 'Get trending posts' })
  @ApiQuery({
    name: 'timeFrame',
    required: false,
    enum: ['day', 'week', 'month'],
    description: 'Time frame for trending calculation',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of posts to return',
  })
  @ApiResponse({
    status: 200,
    description: 'Trending posts',
    type: 'array',
  })
  async getTrendingPosts(
    @Query('timeFrame') timeFrame: 'day' | 'week' | 'month' = 'week',
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit?: number,
  ) {
    return this.forumSearchService.getTrendingPosts(limit, timeFrame);
  }

  @Get('hot')
  @ApiOperation({ summary: 'Get hot topics' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of posts to return',
  })
  @ApiResponse({
    status: 200,
    description: 'Hot topics',
    type: 'array',
  })
  async getHotTopics(@Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit?: number) {
    return this.forumSearchService.getHotTopics(limit);
  }

  @Get('similar/:postId')
  @ApiOperation({ summary: 'Get similar posts' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of posts to return',
  })
  @ApiResponse({
    status: 200,
    description: 'Similar posts',
    type: 'array',
  })
  async getSimilarPosts(
    @Query('postId') postId: string,
    @Query('limit', new DefaultValuePipe(5), ParseIntPipe) limit?: number,
  ) {
    return this.forumSearchService.getSimilarPosts(postId, limit);
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'Get search suggestions' })
  @ApiQuery({ name: 'q', description: 'Search query' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of suggestions per category',
  })
  @ApiResponse({
    status: 200,
    description: 'Search suggestions',
    schema: {
      type: 'object',
      properties: {
        posts: { type: 'array', items: { type: 'string' } },
        tags: { type: 'array', items: { type: 'string' } },
        categories: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  async getSearchSuggestions(
    @Query('q') query: string,
    @Query('limit', new DefaultValuePipe(5), ParseIntPipe) limit?: number,
  ) {
    return this.forumSearchService.getSearchSuggestions(query, limit);
  }

  @Get('tags/popular')
  @ApiOperation({ summary: 'Get popular tags' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of tags to return',
  })
  @ApiResponse({
    status: 200,
    description: 'Popular tags',
    type: 'array',
  })
  async getPopularTags(@Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number) {
    return this.forumSearchService.getPopularTags(limit);
  }
}
