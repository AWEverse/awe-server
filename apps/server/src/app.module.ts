import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { ForumModule } from './forum/forum.module';
import { ThreadsModule } from './threads/threads.module';
import { MediaModule } from './media/media.module';
import { CustomizeModule } from './customize/customize.module';

@Module({
  imports: [AuthModule, ChatModule, ForumModule, ThreadsModule, MediaModule, CustomizeModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
