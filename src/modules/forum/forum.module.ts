import { Module } from '@nestjs/common';
import { PrismaService } from '../../libs/supabase/db/prisma.service';
import { ForumController } from './controllers/forum.controller';
import { ForumCategoryController } from './controllers/forum-category.controller';
import { ForumSearchController } from './controllers/forum-search.controller';
import { ForumModerationController } from './controllers/forum-moderation.controller';
import { ForumService } from './services/forum.service';
import { ForumReplyService } from './services/forum-reply.service';
import { ForumCategoryService } from './services/forum-category.service';
import { ForumSearchService } from './services/forum-search.service';
import { ForumModerationService } from './services/forum-moderation.service';

@Module({
  imports: [],
  controllers: [
    ForumController,
    ForumCategoryController,
    ForumSearchController,
    ForumModerationController,
  ],
  providers: [
    PrismaService,
    ForumService,
    ForumReplyService,
    ForumCategoryService,
    ForumSearchService,
    ForumModerationService,
  ],
  exports: [
    ForumService,
    ForumReplyService,
    ForumCategoryService,
    ForumSearchService,
    ForumModerationService,
  ],
})
export class ForumModule {}
