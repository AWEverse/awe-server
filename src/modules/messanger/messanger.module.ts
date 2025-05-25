import { Module } from '@nestjs/common';
import { MessangerService } from './messanger.service';
import { MessangerController } from './messanger.controller';
import { PrismaService } from '../../libs/supabase/db/prisma.service';

@Module({
  imports: [],
  controllers: [MessangerController],
  providers: [MessangerService, PrismaService],
  exports: [MessangerService],
})
export class MessangerModule {}
