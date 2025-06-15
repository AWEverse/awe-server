import { Module } from '@nestjs/common';
import { SupabaseAuthService } from './auth/supabase-auth.service';
import { PrismaService } from '../db/prisma.service';

@Module({
  providers: [SupabaseAuthService, PrismaService],
  exports: [SupabaseAuthService, PrismaService],
})
export class SupabaseModule {}
