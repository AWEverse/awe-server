import { Module } from '@nestjs/common';
import { ForumController } from './forum.controller';
import { ForumService } from './forum.service';

@Module({
  imports: [],
  controllers: [ForumController],
  providers: [ForumService],
})
export class ForumModule {}
