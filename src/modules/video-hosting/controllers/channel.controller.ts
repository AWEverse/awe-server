import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ChannelService } from '../services/channel.service';
import { AnalyticsService } from '../services/analytics.service';
import { AnalyticsData, TopVideoData } from '../types';

@ApiTags('Channels')
@Controller('channels')
export class ChannelController {
  constructor(
    private readonly channelService: ChannelService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get channel information' })
  @ApiResponse({ status: 200, description: 'Channel information returned successfully' })
  @ApiResponse({ status: 404, description: 'Channel not found' })
  async getChannel(@Param('id') id: string) {
    const channelId = BigInt(id);
    return this.channelService.getChannelById(channelId);
  }

  @Get(':id/videos')
  @ApiOperation({ summary: 'Get channel videos' })
  @ApiResponse({ status: 200, description: 'Channel videos returned successfully' })
  async getChannelVideos(
    @Param('id') id: string,
    @Query('page', ParseIntPipe) page: number = 1,
    @Query('limit', ParseIntPipe) limit: number = 20,
  ) {
    const channelId = BigInt(id);
    return this.channelService.getChannelVideos(channelId, page, limit);
  }

  @Get(':id/playlists')
  @ApiOperation({ summary: 'Get channel playlists' })
  @ApiResponse({ status: 200, description: 'Channel playlists returned successfully' })
  async getChannelPlaylists(
    @Param('id') id: string,
    @Query('page', ParseIntPipe) page: number = 1,
    @Query('limit', ParseIntPipe) limit: number = 20,
  ) {
    const channelId = BigInt(id);
    return this.channelService.getChannelPlaylists(channelId, page, limit);
  }

  @Post(':id/subscribe')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Subscribe to channel' })
  @ApiResponse({ status: 200, description: 'Successfully subscribed to channel' })
  @ApiResponse({ status: 403, description: 'Cannot subscribe to yourself' })
  async subscribeToChannel(@Param('id') id: string, @Request() req) {
    const channelId = BigInt(id);
    const userId = BigInt(req.user.sub);
    await this.channelService.subscribeToChannel(userId, channelId);
    return { message: 'Successfully subscribed to channel' };
  }

  @Delete(':id/subscribe')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Unsubscribe from channel' })
  @ApiResponse({ status: 200, description: 'Successfully unsubscribed from channel' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async unsubscribeFromChannel(@Param('id') id: string, @Request() req) {
    const channelId = BigInt(id);
    const userId = BigInt(req.user.sub);
    await this.channelService.unsubscribeFromChannel(userId, channelId);
    return { message: 'Successfully unsubscribed from channel' };
  }

  @Get(':id/subscription-status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Check if user is subscribed to channel' })
  @ApiResponse({ status: 200, description: 'Subscription status returned successfully' })
  async getSubscriptionStatus(@Param('id') id: string, @Request() req) {
    const channelId = BigInt(id);
    const userId = BigInt(req.user.sub);
    const isSubscribed = await this.channelService.isSubscribed(userId, channelId);
    return { isSubscribed };
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get channel statistics' })
  @ApiResponse({ status: 200, description: 'Channel stats returned successfully' })
  async getChannelStats(@Param('id') id: string) {
    const channelId = BigInt(id);
    return this.channelService.getChannelStats(channelId);
  }

  @Get(':id/analytics')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get channel analytics (owner only)' })
  @ApiResponse({ status: 200, description: 'Channel analytics returned successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async getChannelAnalytics(
    @Param('id') id: string,
    @Request() req,
    @Query('days', ParseIntPipe) days: number = 30,
  ) {
    const channelId = BigInt(id);
    const userId = BigInt(req.user.sub);

    // Проверяем, что пользователь запрашивает аналитику своего канала
    if (channelId !== userId) {
      throw new ForbiddenException('You can only view analytics for your own channel');
    }

    return this.analyticsService.getChannelAnalytics(channelId, days);
  }

  @Get(':id/overview')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get channel overview (owner only)' })
  @ApiResponse({ status: 200, description: 'Channel overview returned successfully' })
  async getChannelOverview(@Param('id') id: string, @Request() req) {
    const channelId = BigInt(id);
    const userId = BigInt(req.user.sub);

    if (channelId !== userId) {
      throw new ForbiddenException('You can only view overview for your own channel');
    }

    return this.analyticsService.getChannelOverview(channelId);
  }

  @Get(':id/top-videos')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get channel top videos (owner only)' })
  @ApiResponse({ status: 200, description: 'Top videos returned successfully' })
  async getTopVideos(
    @Param('id') id: string,
    @Request() req,
    @Query('limit', ParseIntPipe) limit: number = 10,
  ) {
    const channelId = BigInt(id);
    const userId = BigInt(req.user.sub);

    if (channelId !== userId) {
      throw new ForbiddenException('You can only view top videos for your own channel');
    }

    return this.analyticsService.getTopVideos(channelId, limit);
  }

  @Get('me/subscriptions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get user subscriptions' })
  @ApiResponse({ status: 200, description: 'User subscriptions returned successfully' })
  async getUserSubscriptions(
    @Request() req,
    @Query('page', ParseIntPipe) page: number = 1,
    @Query('limit', ParseIntPipe) limit: number = 20,
  ) {
    const userId = BigInt(req.user.sub);
    return this.channelService.getSubscriptions(userId, page, limit);
  }

  @Get('me/feed')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get subscription feed' })
  @ApiResponse({ status: 200, description: 'Subscription feed returned successfully' })
  async getSubscriptionFeed(
    @Request() req,
    @Query('page', ParseIntPipe) page: number = 1,
    @Query('limit', ParseIntPipe) limit: number = 20,
  ) {
    const userId = BigInt(req.user.sub);
    return this.channelService.getSubscriptionFeed(userId, page, limit);
  }
}
