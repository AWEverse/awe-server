import { Module } from '@nestjs/common';
import { PrismaService } from '../../libs/db/prisma.service';
import { ForumController, ForumPostController } from './controllers';
import { ForumService, ForumPostService } from './services';

@Module({
  controllers: [ForumController, ForumPostController],
  providers: [ForumService, ForumPostService, PrismaService],
  exports: [ForumService, ForumPostService],
})
export class ForumModule {}
