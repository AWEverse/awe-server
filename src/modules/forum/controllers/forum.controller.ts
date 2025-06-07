import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Request,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import {
  BaseForumController,
  AuthenticatedEndpoint,
  OptionalAuthEndpoint,
  StandardErrorResponses,
  PaginatedResponse,
} from './base-forum.controller';
import { ForumService } from '../services/forum.service';
import { ForumReplyService } from '../services/forum-reply.service';
import {
  CreateForumPostDto,
  UpdateForumPostDto,
  CreateForumReplyDto,
  UpdateForumReplyDto,
  ForumPostQueryDto,
  ForumPostResponseDto,
  ForumReplyResponseDto,
  PaginatedForumPostsDto,
  ForumVoteDto,
  ForumStatsDto,
} from '../dto/forum.dto';

@ApiTags('Forum')
@Controller('forum')
export class ForumController extends BaseForumController {
  constructor(
    private readonly forumService: ForumService,
    private readonly forumReplyService: ForumReplyService,
  ) {
    super();
  }

  @UseGuards(OptionalAuthEndpoint)
  @Get('forum/:id')
  @ApiOperation({ summary: 'Get forum overview' })
  @ApiResponse({
    status: 200,
    description: 'Forum overview retrieved successfully',
    type: ForumStatsDto,
  })

  // Posts endpoints
  @Post('posts')
  @AuthenticatedEndpoint()
  @ApiOperation({ summary: 'Create a new forum post' })
  @ApiResponse({
    status: 201,
    description: 'Post created successfully',
    type: ForumPostResponseDto,
  })
  @StandardErrorResponses()
  async createPost(
    @Request() req: any,
    @Body() createPostDto: CreateForumPostDto,
  ): Promise<ForumPostResponseDto> {
    return this.forumService.createPost(this.getUserId(req), createPostDto);
  }
  @Get('posts')
  @OptionalAuthEndpoint()
  @ApiOperation({ summary: 'Get forum posts with filtering and pagination' })
  @ApiResponse({
    status: 200,
    description: 'Posts retrieved successfully',
    type: PaginatedForumPostsDto,
  })
  @ApiQuery({ name: 'categoryId', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'tag', required: false, description: 'Filter by tag' })
  @ApiQuery({ name: 'search', required: false, description: 'Search query' })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['latest', 'popular', 'hot', 'views', 'votes'],
    description: 'Sort by field',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort order',
  })
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
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  async findPosts(
    @Request() req: any,
    @Query() query: ForumPostQueryDto,
  ): Promise<PaginatedForumPostsDto> {
    return this.forumService.findPosts(query, this.getOptionalUserId(req));
  }
  @Get('posts/:id')
  @OptionalAuthEndpoint()
  @ApiOperation({ summary: 'Get a forum post by ID' })
  @ApiParam({ name: 'id', description: 'Post ID' })
  @ApiResponse({
    status: 200,
    description: 'Post retrieved successfully',
    type: ForumPostResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Post not found' })
  async findPostById(@Request() req: any, @Param('id') id: string): Promise<ForumPostResponseDto> {
    return this.forumService.findPostById(id, this.getOptionalUserId(req));
  }

  @Patch('posts/:id')
  @AuthenticatedEndpoint()
  @ApiOperation({ summary: 'Update a forum post' })
  @ApiParam({ name: 'id', description: 'Post ID' })
  @ApiResponse({
    status: 200,
    description: 'Post updated successfully',
    type: ForumPostResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - not post author' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  async updatePost(
    @Request() req: any,
    @Param('id') id: string,
    @Body() updatePostDto: UpdateForumPostDto,
  ): Promise<ForumPostResponseDto> {
    return this.forumService.updatePost(id, this.getUserId(req), updatePostDto);
  }

  @Delete('posts/:id')
  @AuthenticatedEndpoint()
  @ApiOperation({ summary: 'Delete a forum post' })
  @ApiParam({ name: 'id', description: 'Post ID' })
  @ApiResponse({ status: 200, description: 'Post deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - not post author' })
  @ApiResponse({ status: 404, description: 'Post not found' })
  async deletePost(@Request() req: any, @Param('id') id: string): Promise<{ message: string }> {
    await this.forumService.deletePost(id, this.getUserId(req));
    return { message: 'Post deleted successfully' };
  }

  @Post('posts/:id/vote')
  @AuthenticatedEndpoint()
  @ApiOperation({ summary: 'Vote on a forum post' })
  @ApiParam({ name: 'id', description: 'Post ID' })
  @ApiResponse({
    status: 200,
    description: 'Vote recorded successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        netVotes: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Post not found' })
  async votePost(
    @Request() req: any,
    @Param('id') id: string,
    @Body() voteDto: ForumVoteDto,
  ): Promise<{ success: boolean; netVotes: number }> {
    return this.forumService.votePost(id, this.getUserId(req), voteDto.value);
  }
  // Replies endpoints
  @Post('posts/:postId/replies')
  @AuthenticatedEndpoint()
  @ApiOperation({ summary: 'Create a reply to a forum post' })
  @ApiParam({ name: 'postId', description: 'Post ID' })
  @ApiResponse({
    status: 201,
    description: 'Reply created successfully',
    type: ForumReplyResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Post not found' })
  async createReply(
    @Request() req: any,
    @Param('postId') postId: string,
    @Body() createReplyDto: CreateForumReplyDto,
  ): Promise<ForumReplyResponseDto> {
    return this.forumReplyService.createReply(postId, this.getUserId(req), createReplyDto);
  }

  @Get('posts/:postId/replies')
  @OptionalAuthEndpoint()
  @ApiOperation({ summary: 'Get replies for a forum post' })
  @ApiParam({ name: 'postId', description: 'Post ID' })
  @ApiResponse({
    status: 200,
    description: 'Replies retrieved successfully',
    type: [ForumReplyResponseDto],
  })
  @ApiResponse({ status: 404, description: 'Post not found' })
  async findRepliesByPost(
    @Request() req: any,
    @Param('postId') postId: string,
  ): Promise<ForumReplyResponseDto[]> {
    return this.forumReplyService.findRepliesByPost(postId, this.getOptionalUserId(req));
  }

  @Get('replies/:id')
  @OptionalAuthEndpoint()
  @ApiOperation({ summary: 'Get a reply by ID' })
  @ApiParam({ name: 'id', description: 'Reply ID' })
  @ApiResponse({
    status: 200,
    description: 'Reply retrieved successfully',
    type: ForumReplyResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Reply not found' })
  async findReplyById(
    @Request() req: any,
    @Param('id') id: string,
  ): Promise<ForumReplyResponseDto> {
    return this.forumReplyService.findReplyById(id, this.getOptionalUserId(req));
  }

  @Patch('replies/:id')
  @AuthenticatedEndpoint()
  @ApiOperation({ summary: 'Update a reply' })
  @ApiParam({ name: 'id', description: 'Reply ID' })
  @ApiResponse({
    status: 200,
    description: 'Reply updated successfully',
    type: ForumReplyResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - not reply author' })
  @ApiResponse({ status: 404, description: 'Reply not found' })
  async updateReply(
    @Request() req: any,
    @Param('id') id: string,
    @Body() updateReplyDto: UpdateForumReplyDto,
  ): Promise<ForumReplyResponseDto> {
    return this.forumReplyService.updateReply(id, this.getUserId(req), updateReplyDto);
  }

  @Delete('replies/:id')
  @AuthenticatedEndpoint()
  @ApiOperation({ summary: 'Delete a reply' })
  @ApiParam({ name: 'id', description: 'Reply ID' })
  @ApiResponse({ status: 200, description: 'Reply deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - not reply author' })
  @ApiResponse({ status: 404, description: 'Reply not found' })
  async deleteReply(@Request() req: any, @Param('id') id: string): Promise<{ message: string }> {
    await this.forumReplyService.deleteReply(id, this.getUserId(req));
    return { message: 'Reply deleted successfully' };
  }

  @Post('replies/:id/vote')
  @AuthenticatedEndpoint()
  @ApiOperation({ summary: 'Vote on a reply' })
  @ApiParam({ name: 'id', description: 'Reply ID' })
  @ApiResponse({
    status: 200,
    description: 'Vote recorded successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        netVotes: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Reply not found' })
  async voteReply(
    @Request() req: any,
    @Param('id') id: string,
    @Body() voteDto: ForumVoteDto,
  ): Promise<{ success: boolean; netVotes: number }> {
    return this.forumReplyService.voteReply(id, this.getUserId(req), voteDto.value);
  }

  @Post('replies/:id/mark-solution')
  @AuthenticatedEndpoint()
  @ApiOperation({ summary: 'Mark a reply as solution' })
  @ApiParam({ name: 'id', description: 'Reply ID' })
  @ApiResponse({
    status: 200,
    description: 'Reply marked as solution successfully',
    type: ForumReplyResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden - not post author' })
  @ApiResponse({ status: 404, description: 'Reply not found' })
  async markReplyAsSolution(
    @Request() req: any,
    @Param('id') id: string,
  ): Promise<ForumReplyResponseDto> {
    return this.forumReplyService.markAsSolution(id, this.getUserId(req));
  }

  // Stats endpoint
  @Get('stats')
  @ApiOperation({ summary: 'Get forum statistics' })
  @ApiResponse({
    status: 200,
    description: 'Forum statistics retrieved successfully',
    type: ForumStatsDto,
  })
  async getForumStats(): Promise<ForumStatsDto> {
    return this.forumService.getForumStats();
  }
}
