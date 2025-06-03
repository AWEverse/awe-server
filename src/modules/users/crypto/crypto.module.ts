import { Module } from '@nestjs/common';
import { CryptoController } from './crypto.controller';
import { PrismaService } from 'src/libs/supabase/db/prisma.service';

@Module({
  imports: [PrismaService],
  controllers: [CryptoController],
  providers: [CryptoService],
  exports: [CryptoService]
})
export class CryptoModule {}