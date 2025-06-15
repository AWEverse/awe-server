import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { CloudflareR2Module } from '../../libs/cloudflare-r2/cloudflare-r2.module';
import { MediaAssetModule } from '../media-assets/media-assets.module';
import {
  AnalyticsService,
  ChannelController,
  ChannelService,
  PlaylistController,
  PlaylistService,
  RecommendationService,
  VideoController,
  VideoProcessingService,
  VideoService,
} from '.';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => CommonModule),
    forwardRef(() => CloudflareR2Module),
    forwardRef(() => MediaAssetModule),
  ],
  controllers: [VideoController, ChannelController, PlaylistController],
  providers: [
    VideoService,
    ChannelService,
    PlaylistService,
    RecommendationService,
    VideoProcessingService,
    AnalyticsService,
  ],
  exports: [
    VideoService,
    ChannelService,
    PlaylistService,
    RecommendationService,
    VideoProcessingService,
    AnalyticsService,
  ],
})
export class VideoHostingModule {}
