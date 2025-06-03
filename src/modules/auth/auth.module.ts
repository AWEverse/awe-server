// src/modules/auth/auth.module.ts
import { Module, Logger } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SupabaseModule } from '../../libs/supabase/supabase.module';
import { ExtractJwt } from 'passport-jwt';
import { SupabaseAuthStrategy } from './strategies/supabase.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    SupabaseModule,
    PassportModule.register({ defaultStrategy: 'SUPABASE_AUTH' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    Logger,
    JwtStrategy,
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
  exports: [AuthService, JwtStrategy],
})
export class AuthModule {}
