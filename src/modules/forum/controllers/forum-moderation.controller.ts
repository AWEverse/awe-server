import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Request,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ForumModerationService } from '../services/forum-moderation.service';
import { CreateForumReportDto, ForumModerationActionDto } from '../dto/forum.dto';
import {
  BaseForumController,
  AuthenticatedEndpoint,
  ModeratorEndpoint,
  AdminEndpoint,
  StandardErrorResponses,
  PaginatedResponse,
} from './base-forum.controller';

@ApiTags('Forum Moderation')
@Controller('forum/moderation')
export class ForumModerationController extends BaseForumController {
  constructor(private readonly forumModerationService: ForumModerationService) {
    super();
  }
  @Post('reports')
  @AuthenticatedEndpoint()
  @StandardErrorResponses()
  @ApiOperation({ summary: 'Report forum content' })
  @ApiResponse({ status: 201, description: 'Report submitted successfully' })
  @ApiResponse({ status: 400, description: 'Already reported or invalid content' })
  @ApiResponse({ status: 404, description: 'Target content not found' })
  async reportContent(
    @Body() reportDto: CreateForumReportDto,
    @Query('targetId') targetId: string,
    @Query('targetType') targetType: 'POST' | 'REPLY',
    @Request() req: any,
  ): Promise<{ success: boolean; reportId: string }> {
    const userId = this.getUserId(req);
    return this.forumModerationService.reportContent(userId, targetId, targetType, reportDto);
  }
  @Get('reports')
  @ModeratorEndpoint()
  @StandardErrorResponses()
  @ApiOperation({ summary: 'Get moderation reports' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'RESOLVED', 'DISMISSED'] })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20)',
  })
  @ApiResponse({ status: 200, description: 'Reports retrieved successfully' })
  async getReports(
    @Query('status') status?: 'PENDING' | 'RESOLVED' | 'DISMISSED',
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ): Promise<PaginatedResponse<any>> {
    const result = await this.forumModerationService.getReports(status, page, limit);
    return {
      data: result.reports,
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
      hasNext: result.page < result.totalPages,
      hasPrev: result.page > 1,
    };
  }
  @Post('reports/:reportId/moderate')
  @ModeratorEndpoint()
  @StandardErrorResponses()
  @ApiOperation({ summary: 'Take moderation action on reported content' })
  @ApiParam({ name: 'reportId', description: 'Report ID' })
  @ApiResponse({ status: 200, description: 'Moderation action completed successfully' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  @ApiResponse({ status: 400, description: 'Report already processed' })
  async moderateContent(
    @Param('reportId') reportId: string,
    @Body() actionDto: ForumModerationActionDto,
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    const moderatorId = this.getUserId(req);
    return this.forumModerationService.moderateContent(reportId, moderatorId, actionDto);
  }

  @Put('reports/:reportId/dismiss')
  @ModeratorEndpoint()
  @StandardErrorResponses()
  @ApiOperation({ summary: 'Dismiss a report without taking action' })
  @ApiParam({ name: 'reportId', description: 'Report ID' })
  @ApiResponse({ status: 200, description: 'Report dismissed successfully' })
  @ApiResponse({ status: 404, description: 'Report not found' })
  async dismissReport(
    @Param('reportId') reportId: string,
    @Body('reason') reason?: string,
    @Request() req?: any,
  ): Promise<{ success: boolean }> {
    const moderatorId = this.getUserId(req);
    return this.forumModerationService.dismissReport(reportId, moderatorId, reason);
  }
  @Get('logs')
  @ModeratorEndpoint()
  @StandardErrorResponses()
  @ApiOperation({ summary: 'Get moderation logs' })
  @ApiQuery({ name: 'targetId', required: false, description: 'Filter by target content ID' })
  @ApiQuery({ name: 'moderatorId', required: false, description: 'Filter by moderator ID' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20)',
  })
  @ApiResponse({ status: 200, description: 'Moderation logs retrieved successfully' })
  async getModerationLogs(
    @Query('targetId') targetId?: string,
    @Query('moderatorId') moderatorId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ): Promise<PaginatedResponse<any>> {
    const result = await this.forumModerationService.getModerationLogs(
      targetId,
      moderatorId,
      page,
      limit,
    );
    return {
      data: result.logs,
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
      hasNext: result.page < result.totalPages,
      hasPrev: result.page > 1,
    };
  }
  // Post moderation methods
  @Put('posts/:postId/lock')
  @ModeratorEndpoint()
  @StandardErrorResponses()
  @ApiOperation({ summary: 'Lock a forum post' })
  @ApiParam({ name: 'postId', description: 'Post ID' })
  @ApiResponse({ status: 200, description: 'Post locked successfully' })
  async lockPost(
    @Param('postId') postId: string,
    @Body('reason') reason?: string,
    @Request() req?: any,
  ): Promise<{ success: boolean }> {
    const moderatorId = this.getUserId(req);
    return this.forumModerationService.lockPost(postId, moderatorId, reason);
  }

  @Put('posts/:postId/unlock')
  @ModeratorEndpoint()
  @StandardErrorResponses()
  @ApiOperation({ summary: 'Unlock a forum post' })
  @ApiParam({ name: 'postId', description: 'Post ID' })
  @ApiResponse({ status: 200, description: 'Post unlocked successfully' })
  async unlockPost(
    @Param('postId') postId: string,
    @Body('reason') reason?: string,
    @Request() req?: any,
  ): Promise<{ success: boolean }> {
    const moderatorId = this.getUserId(req);
    return this.forumModerationService.unlockPost(postId, moderatorId, reason);
  }

  @Put('posts/:postId/pin')
  @ModeratorEndpoint()
  @StandardErrorResponses()
  @ApiOperation({ summary: 'Pin a forum post' })
  @ApiParam({ name: 'postId', description: 'Post ID' })
  @ApiResponse({ status: 200, description: 'Post pinned successfully' })
  async pinPost(
    @Param('postId') postId: string,
    @Body('reason') reason?: string,
    @Request() req?: any,
  ): Promise<{ success: boolean }> {
    const moderatorId = this.getUserId(req);
    return this.forumModerationService.pinPost(postId, moderatorId, reason);
  }

  @Put('posts/:postId/unpin')
  @ModeratorEndpoint()
  @StandardErrorResponses()
  @ApiOperation({ summary: 'Unpin a forum post' })
  @ApiParam({ name: 'postId', description: 'Post ID' })
  @ApiResponse({ status: 200, description: 'Post unpinned successfully' })
  async unpinPost(
    @Param('postId') postId: string,
    @Body('reason') reason?: string,
    @Request() req?: any,
  ): Promise<{ success: boolean }> {
    const moderatorId = this.getUserId(req);
    return this.forumModerationService.unpinPost(postId, moderatorId, reason);
  }

  @Put('posts/:postId/feature')
  @AdminEndpoint()
  @StandardErrorResponses()
  @ApiOperation({ summary: 'Feature a forum post' })
  @ApiParam({ name: 'postId', description: 'Post ID' })
  @ApiResponse({ status: 200, description: 'Post featured successfully' })
  async featurePost(
    @Param('postId') postId: string,
    @Body('reason') reason?: string,
    @Request() req?: any,
  ): Promise<{ success: boolean }> {
    const moderatorId = this.getUserId(req);
    return this.forumModerationService.featurePost(postId, moderatorId, reason);
  }

  @Put('posts/:postId/unfeature')
  @AdminEndpoint()
  @StandardErrorResponses()
  @ApiOperation({ summary: 'Unfeature a forum post' })
  @ApiParam({ name: 'postId', description: 'Post ID' })
  @ApiResponse({ status: 200, description: 'Post unfeatured successfully' })
  async unfeaturePost(
    @Param('postId') postId: string,
    @Body('reason') reason?: string,
    @Request() req?: any,
  ): Promise<{ success: boolean }> {
    const moderatorId = this.getUserId(req);
    return this.forumModerationService.unfeaturePost(postId, moderatorId, reason);
  }

  @Put('posts/:postId/move')
  @ModeratorEndpoint()
  @StandardErrorResponses()
  @ApiOperation({ summary: 'Move a post to different category' })
  @ApiParam({ name: 'postId', description: 'Post ID' })
  @ApiResponse({ status: 200, description: 'Post moved successfully' })
  @ApiResponse({ status: 404, description: 'Post or target category not found' })
  async movePost(
    @Param('postId') postId: string,
    @Body('newCategoryId') newCategoryId: string,
    @Body('reason') reason?: string,
    @Request() req?: any,
  ): Promise<{ success: boolean }> {
    const moderatorId = this.getUserId(req);
    return this.forumModerationService.movePost(postId, newCategoryId, moderatorId, reason);
  }

  @Delete('content/:targetType/:targetId')
  @ModeratorEndpoint()
  @StandardErrorResponses()
  @ApiOperation({ summary: 'Delete forum content' })
  @ApiParam({
    name: 'targetType',
    enum: ['POST', 'REPLY'],
    description: 'Type of content to delete',
  })
  @ApiParam({ name: 'targetId', description: 'Content ID' })
  @ApiResponse({ status: 200, description: 'Content deleted successfully' })
  @ApiResponse({ status: 404, description: 'Content not found' })
  async deleteContent(
    @Param('targetType') targetType: 'POST' | 'REPLY',
    @Param('targetId') targetId: string,
    @Body('reason') reason?: string,
    @Request() req?: any,
  ): Promise<{ success: boolean }> {
    const moderatorId = this.getUserId(req);
    return this.forumModerationService.deleteContent(targetId, targetType, moderatorId, reason);
  }
}
