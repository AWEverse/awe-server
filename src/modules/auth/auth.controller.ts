import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Logger,
  UseInterceptors,
  HttpStatus,
  HttpCode,
  Param,
  UsePipes,
  ValidationPipe,
  Headers,
  Ip,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  SocialLoginDto,
  ChangePasswordDto,
  EmailVerificationDto,
  ResendVerificationDto,
  RegisterResponseDto,
  LoginResponseDto,
  AuthProfileResponseDto,
  LogoutResponseDto,
} from './dto';
import { UserRequest } from './types';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';
import { Public } from '../common/decorators/public.decorator';
import {
  LoginResponse,
  RegisterResponse,
  ProfileResponse,
  PasswordResetResponse,
  OAuthResponse,
  SessionsResponse,
} from './types/auth-response.types';
import {
  ApiPublicEndpoint,
  ApiSecureEndpoint,
  ApiCreatedResponse,
  ApiSuccessResponse,
  ApiNotFoundResponse,
} from '../common/swagger';

@UseInterceptors(ResponseInterceptor)
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {
    this.logger.log('Auth Controller initialized');
  }
  @Post('register')
  @Public()
  @UseGuards(RateLimitGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @HttpCode(HttpStatus.CREATED)
  @ApiPublicEndpoint(
    'Регистрация нового пользователя',
    'Создание новой учетной записи пользователя с email, паролем и именем пользователя',
  )
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse('Пользователь успешно зарегистрирован', RegisterResponseDto)
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Email или имя пользователя уже существует',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 409 },
        message: { type: 'string', example: 'Email already exists' },
        error: { type: 'string', example: 'Conflict' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Слишком много попыток регистрации',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 429 },
        message: { type: 'string', example: 'Too many requests' },
        error: { type: 'string', example: 'Too Many Requests' },
      },
    },
  })
  async register(
    @Body() body: RegisterDto,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string,
  ): Promise<RegisterResponse> {
    try {
      this.logger.log(`Registration attempt for email: ${body.email} from IP: ${ipAddress}`);
      const result = await this.authService.register(
        body.email,
        body.password,
        body.username,
        body.fullName,
        body.deviceToken,
        body.userAgent || userAgent, // Use provided or fallback to header
        body.fingerprint,
      );
      this.logger.log(`Registration successful for email: ${body.email}`);
      return result;
    } catch (error) {
      this.logger.error(`Registration failed for ${body.email}:`, error.message);
      throw error;
    }
  }
  @Post('login')
  @Public()
  // @UseGuards(RateLimitGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @HttpCode(HttpStatus.OK)
  @ApiPublicEndpoint(
    'Авторизация пользователя',
    'Аутентификация пользователя с помощью email и пароля',
  )
  @ApiBody({ type: LoginDto })
  @ApiSuccessResponse('Пользователь успешно авторизован', LoginResponseDto)
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Неверные учетные данные',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Invalid credentials' },
        error: { type: 'string', example: 'Unauthorized' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Слишком много попыток входа',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 429 },
        message: { type: 'string', example: 'Too many requests' },
        error: { type: 'string', example: 'Too Many Requests' },
      },
    },
  })
  async login(
    @Body() body: LoginDto,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string,
  ): Promise<LoginResponse> {
    try {
      this.logger.log(`Login attempt for email: ${body.email} from IP: ${ipAddress}`);
      const result = await this.authService.login(
        body.email,
        body.password,
        body.deviceToken,
        body.userAgent || userAgent, // Use provided or fallback to header
        body.fingerprint,
      );
      this.logger.log(`Login successful for email: ${body.email}`);
      return result;
    } catch (error) {
      this.logger.error(`Login failed for ${body.email}:`, error.message);
      throw error;
    }
  }
  @Post('refresh')
  @Public()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @HttpCode(HttpStatus.OK)
  @ApiPublicEndpoint(
    'Обновление токена доступа',
    'Получение нового токена доступа с помощью refresh token',
  )
  @ApiBody({ type: RefreshTokenDto })
  @ApiSuccessResponse('Токен успешно обновлен', LoginResponseDto)
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Неверный или истекший refresh token',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Invalid or expired refresh token' },
        error: { type: 'string', example: 'Unauthorized' },
      },
    },
  })
  async refresh(@Body() body: RefreshTokenDto): Promise<LoginResponse> {
    try {
      this.logger.log('Token refresh attempt');
      const result = await this.authService.refresh(
        body.refreshToken,
        body.fingerprint,
        body.userAgent,
      );
      this.logger.log('Token refresh successful');
      return result;
    } catch (error) {
      this.logger.error('Token refresh failed:', error.message);
      throw error;
    }
  }
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiSecureEndpoint('Выход из системы', 'Аннулирование пользовательской сессии и токенов')
  @ApiSuccessResponse('Пользователь успешно вышел из системы')
  async logout(@Request() req: UserRequest): Promise<{ message: string }> {
    try {
      this.logger.log(`Logout attempt for user: ${req.user.id}`);
      const result = await this.authService.logout(req.user.access_token);
      this.logger.log(`Logout successful for user: ${req.user.id}`);
      return result;
    } catch (error) {
      this.logger.error(`Logout failed for user ${req.user?.id}:`, error.message);
      throw error;
    }
  }
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiSecureEndpoint(
    'Получение профиля пользователя',
    'Получение информации о профиле текущего пользователя',
  )
  @ApiSuccessResponse('Профиль пользователя успешно получен', AuthProfileResponseDto)
  @ApiNotFoundResponse('Пользователь')
  async getProfile(@Request() req: UserRequest): Promise<ProfileResponse> {
    try {
      this.logger.log(`Profile request for user: ${req.user.id}`);
      const result = await this.authService.getUserProfile(req.user.id);
      return result;
    } catch (error) {
      this.logger.error(`Profile fetch failed for user ${req.user?.id}:`, error.message);
      throw error;
    }
  }

  @Post('forgot-password')
  @Public()
  @UseGuards(RateLimitGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request password reset',
    description: 'Send password reset link to user email',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Password reset email sent',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Too many password reset attempts',
  })
  async forgotPassword(@Body() body: ForgotPasswordDto): Promise<PasswordResetResponse> {
    try {
      this.logger.log(`Password reset request for email: ${body.email}`);
      const result = await this.authService.forgotPassword(body.email);
      return result;
    } catch (error) {
      this.logger.error(`Password reset failed for ${body.email}:`, error.message);
      throw error;
    }
  }

  @Post('reset-password')
  @Public()
  @UseGuards(RateLimitGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password',
    description: 'Reset user password using reset token',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Password reset successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid or expired reset token',
  })
  async resetPassword(@Body() body: ResetPasswordDto): Promise<PasswordResetResponse> {
    try {
      this.logger.log('Password reset attempt');
      const result = await this.authService.resetPassword(body.token, body.newPassword);
      return result;
    } catch (error) {
      this.logger.error('Password reset failed:', error.message);
      throw error;
    }
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change password',
    description: 'Change user password (requires current password)',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Password changed successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        success: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid current password',
  })
  async changePassword(
    @Body() body: ChangePasswordDto,
    @Request() req: UserRequest,
  ): Promise<PasswordResetResponse> {
    try {
      this.logger.log(`Password change request for user: ${req.user.id}`);
      const result = await this.authService.changePassword(
        req.user.id,
        body.currentPassword,
        body.newPassword,
      );
      this.logger.log(`Password changed successfully for user: ${req.user.id}`);
      return result;
    } catch (error) {
      this.logger.error(`Password change failed for user ${req.user?.id}:`, error.message);
      throw error;
    }
  }

  @Post('social/:provider')
  @Public()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Social login',
    description: 'Initiate OAuth login with social provider',
  })
  @ApiParam({
    name: 'provider',
    enum: ['google', 'twitter', 'facebook', 'github', 'discord'],
    description: 'OAuth provider name',
  })
  @ApiBody({ type: SocialLoginDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'OAuth URL generated successfully',
    schema: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        url: { type: 'string' },
        state: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Unsupported OAuth provider',
  })
  async socialLogin(
    @Param('provider') provider: string,
    @Body() body: SocialLoginDto,
  ): Promise<OAuthResponse> {
    try {
      this.logger.log(`Social login attempt with provider: ${provider}`);
      // TODO: Implement social login with multiple providers
      return {
        provider,
        url: 'https://oauth-provider.com/auth',
        state: 'generated-state',
      };
    } catch (error) {
      this.logger.error(`Social login failed for provider ${provider}:`, error.message);
      throw error;
    }
  }

  @Post('verify-email')
  @Public()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify email with token',
    description: 'Verify user email address using verification token and email',
  })
  @ApiBody({ type: EmailVerificationDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Email verified successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid or expired verification token',
  })
  async verifyEmailWithBody(
    @Body() body: EmailVerificationDto,
  ): Promise<{ message: string; success: boolean }> {
    try {
      this.logger.log(`Email verification attempt for: ${body.email}`);
      const result = await this.authService.verifyEmail(body.token, body.email);
      return result;
    } catch (error) {
      this.logger.error(`Email verification failed for ${body.email}:`, error.message);
      throw error;
    }
  }

  @Post('resend-verification')
  @Public()
  @UseGuards(RateLimitGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend email verification',
    description: 'Resend verification email to user',
  })
  @ApiBody({ type: ResendVerificationDto })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Verification email sent successfully',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'Too many verification attempts',
  })
  async resendVerification(
    @Body() body: ResendVerificationDto,
  ): Promise<{ message: string; success: boolean }> {
    try {
      this.logger.log(`Resend verification request for: ${body.email}`);
      const result = await this.authService.resendEmailVerification(body.email);
      return result;
    } catch (error) {
      this.logger.error(`Resend verification failed for ${body.email}:`, error.message);
      throw error;
    }
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get user sessions',
    description: 'Retrieve all active sessions for the current user',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Sessions retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        sessions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
              expiresAt: { type: 'string', format: 'date-time' },
              deviceId: { type: 'string' },
              ipAddress: { type: 'string' },
              userAgent: { type: 'string' },
            },
          },
        },
        activeCount: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Invalid or missing token',
  })
  async getSessions(@Request() req: UserRequest): Promise<SessionsResponse> {
    try {
      const userId = req.user?.id || req.user?.sub;
      this.logger.log(`Sessions request for user: ${userId}`);
      const sessions = await this.authService.getUserSessions(userId);
      const activeCount = await this.authService.getActiveTokensCount(userId);

      return {
        sessions,
        activeCount,
      };
    } catch (error) {
      const userId = req.user?.id || req.user?.sub;
      this.logger.error(`Failed to get sessions for user ${userId}:`, error.message);
      throw error;
    }
  }

  @Post('sessions/:sessionId/revoke')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke session',
    description: 'Revoke a specific user session',
  })
  @ApiParam({ name: 'sessionId', description: 'Session ID to revoke' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Session revoked successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Session not found',
  })
  async revokeSession(
    @Request() req: UserRequest,
    @Param('sessionId') sessionId: string,
  ): Promise<{ message: string; success: boolean }> {
    try {
      this.logger.log(`Revoke session ${sessionId} for user: ${req.user.id}`);
      const success = await this.authService.revokeSession(req.user.id, sessionId);

      if (success) {
        return {
          message: 'Session revoked successfully',
          success: true,
        };
      } else {
        return {
          message: 'Session not found or already revoked',
          success: false,
        };
      }
    } catch (error) {
      this.logger.error(
        `Failed to revoke session ${sessionId} for user ${req.user?.id}:`,
        error.message,
      );
      throw error;
    }
  }

  @Post('sessions/revoke-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke all sessions',
    description: 'Revoke all active sessions for the current user',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'All sessions revoked successfully',
  })
  async revokeAllSessions(
    @Request() req: UserRequest,
  ): Promise<{ message: string; success: boolean }> {
    try {
      this.logger.log(`Revoke all sessions for user: ${req.user.id}`);
      await this.authService.revokeAllUserTokens(req.user.id);

      return {
        message: 'All sessions revoked successfully',
        success: true,
      };
    } catch (error) {
      this.logger.error(`Failed to revoke all sessions for user ${req.user?.id}:`, error.message);
      throw error;
    }
  }

  // Простой тестовый эндпоинт для диагностики
  @Get('test')
  @Public()
  @HttpCode(HttpStatus.OK)
  async test(): Promise<{ message: string }> {
    this.logger.log('Test endpoint called');
    return { message: 'Test endpoint works!' };
  }
}
