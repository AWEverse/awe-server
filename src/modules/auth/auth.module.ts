import { Module, Logger } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { SupabaseModule } from '../../libs/supabase/supabase.module';
import { ExtractJwt } from 'passport-jwt';
import { SupabaseAuthStrategy } from './strategies/supabase.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ThrottledAuthGuard } from './guards/throttled-auth.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { AUTH_CONSTANTS } from './constants/auth.constants';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalAuthGuard } from './guards/optional-auth.guard';
import { ModeratorGuard } from './guards/moderator.guard';
import { AdminGuard } from './guards/admin.guard';

@Module({
  imports: [
    ConfigModule,
    SupabaseModule,
    ScheduleModule.forRoot(),
    PassportModule.register({
      defaultStrategy: 'jwt',
      session: false,
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET environment variable is required');
        }

        return {
          secret,
          signOptions: {
            expiresIn: AUTH_CONSTANTS.JWT.ACCESS_TOKEN_EXPIRES_IN,
            algorithm: AUTH_CONSTANTS.JWT.ALGORITHM,
          },
          verifyOptions: {
            algorithms: [AUTH_CONSTANTS.JWT.ALGORITHM],
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    Logger,
    JwtStrategy,
    JwtAuthGuard,
    OptionalAuthGuard,
    ModeratorGuard,
    AdminGuard,
    ThrottledAuthGuard,
    RateLimitGuard,
    {
      provide: SupabaseAuthStrategy,
      useFactory: (configService: ConfigService) => {
        const supabaseUrl = configService.get<string>('SUPABASE_URL');
        const supabaseKey = configService.get<string>('SUPABASE_KEY');

        if (!supabaseUrl || !supabaseKey) {
          throw new Error('SUPABASE_URL and SUPABASE_KEY environment variables are required');
        }

        return new SupabaseAuthStrategy({
          supabaseUrl,
          supabaseKey,
          extractor: ExtractJwt.fromAuthHeaderAsBearerToken(),
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [
    AuthService,
    JwtStrategy,
    PassportModule,
    JwtModule,
    JwtAuthGuard,
    OptionalAuthGuard,
    ModeratorGuard,
    AdminGuard,
    ThrottledAuthGuard,
    RateLimitGuard,
  ],
})
export class AuthModule {
  constructor(private logger: Logger) {
    this.logger.log('Auth Module initialized with enhanced security features', 'AuthModule');
  }
}
