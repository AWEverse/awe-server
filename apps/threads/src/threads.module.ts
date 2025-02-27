import { Module } from '@nestjs/common';
import { ThreadsController } from './threads.controller';
import { ThreadsService } from './threads.service';

@Module({
  imports: [],
  controllers: [ThreadsController],
  providers: [ThreadsService],
})
export class ThreadsModule {}
