import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { StickerController, EmojiController, GifController } from './controllers';
import { StickerService, EmojiService, GifService, MediaUploadService } from './services';
import { MediaPermissionGuard, MediaOwnershipGuard, MediaModerationGuard } from './guards';
import { MediaValidationMiddleware, MediaRateLimitMiddleware } from './middleware';
import { CloudflareR2Module } from '../../libs/cloudflare-r2/cloudflare-r2.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CloudflareR2Module, CommonModule],
  controllers: [StickerController, EmojiController, GifController],
  providers: [
    StickerService,
    EmojiService,
    GifService,
    MediaUploadService,
    MediaPermissionGuard,
    MediaOwnershipGuard,
    MediaModerationGuard,
  ],
  exports: [
    StickerService,
    EmojiService,
    GifService,
    MediaUploadService,
    MediaPermissionGuard,
    MediaOwnershipGuard,
    MediaModerationGuard,
  ],
})
export class MediaAssetModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(MediaRateLimitMiddleware, MediaValidationMiddleware)
      .forRoutes(StickerController, EmojiController, GifController);
  }
}
