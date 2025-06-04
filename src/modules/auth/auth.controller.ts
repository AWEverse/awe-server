import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Logger,
  UseInterceptors,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';
import { RegisterDto, LoginDto } from './dto';
import { UserRequest } from './types';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ResponseInterceptor } from '../common/interceptors/response.interceptor';

@UseInterceptors(ResponseInterceptor)
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  async register(@Body() body: RegisterDto) {
    try {
      return await this.authService.register(body.email, body.password, body.username);
    } catch (error) {
      this.logger.error('Error during registration', error.stack);
      throw error;
    }
  }

  @Post('login')
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 200, description: 'User logged in successfully' })
  async login(@Body() body: LoginDto) {
    try {
      return await this.authService.login(body.email, body.password);
    } catch (error) {
      this.logger.error('Error during login', error.stack);
      throw error;
    }
  }
  @Post('social/:provider')
  @ApiOperation({ summary: 'Sign in with social provider (Google, Twitter)' })
  @ApiResponse({ status: 200, description: 'Social login successful' })
  async socialSignIn(@Body('provider') provider: 'google' | 'twitter') {
    try {
      return await this.authService.socialSignIn(provider);
    } catch (error) {
      this.logger.error(`Error during ${provider} login`, error.stack);
      throw error;
    }
  }

  @Post('refresh')
  @UseGuards(SupabaseAuthGuard)
  @ApiOperation({ summary: 'Refresh user token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  async refresh(@Request() req: UserRequest<Request>) {
    try {
      return await this.authService.refresh(req.user.access_token);
    } catch (error) {
      this.logger.error('Error during token refresh', error.stack);
      throw error;
    }
  }

  @Post('logout')
  @UseGuards(SupabaseAuthGuard)
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'User logged out successfully' })
  async logout(@Request() req: UserRequest<Request>) {
    try {
      return await this.authService.logout(req.user.access_token);
    } catch (error) {
      this.logger.error('Error during logout', error.stack);
      throw error;
    }
  }

  @Get('profile')
  @UseGuards(SupabaseAuthGuard)
  @ApiOperation({ summary: 'Get user profile' })
  @ApiResponse({ status: 200, description: 'User profile fetched successfully' })
  async getProfile(@Request() req: UserRequest<Request>) {
    try {
      return await this.authService.getUserProfile(req.user.access_token);
    } catch (error) {
      this.logger.error('Error during profile fetch', error.stack);
      throw error;
    }
  }
}
