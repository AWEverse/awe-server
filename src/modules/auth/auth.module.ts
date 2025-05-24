// src/modules/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SupabaseModule } from '../../libs/supabase/supabase.module';
import { ExtractJwt } from 'passport-jwt';
import { SupabaseAuthStrategy } from './strategies/supabase.strategy';

@Module({
  imports: [SupabaseModule, PassportModule.register({ defaultStrategy: 'SUPABASE_AUTH' })],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: 'SUPABASE_AUTH_STRATEGY',
      useFactory: () => {
        return new SupabaseAuthStrategy({
          supabaseUrl:
            process.env.SUPABASE_URL ??
            (() => {
              throw new Error('SUPABASE_URL is not defined');
            })(),
          supabaseKey:
            process.env.SUPABASE_KEY ??
            (() => {
              throw new Error('SUPABASE_KEY is not defined');
            })(),
          extractor: ExtractJwt.fromAuthHeaderAsBearerToken(),
        });
      },
    },
  ],
})
export class AuthModule {}
