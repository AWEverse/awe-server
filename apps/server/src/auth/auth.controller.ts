import {
  Controller,
  Post,
  Body,
  Request,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {
  RegisterDto,
  LoginDto,
  TwoFactorDto,
  RefreshTokenDto,
  AuthResponseDto,
  TwoFactorSetupResponseDto,
} from './dtos';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import DeviceUtil from 'src/_common/device.util';
import { AuthService } from './auth.service';
import { Request as ApiRequest } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthRoutes } from './contants';

@ApiTags(AuthRoutes.MODULE)
@Controller(AuthRoutes.MODULE)
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post(AuthRoutes.REGISTER)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async register(
    @Body() dto: RegisterDto,
    @Request() req: ApiRequest,
  ): Promise<AuthResponseDto> {
    return this.authService.register(dto, req);
  }

  @Post(AuthRoutes.LOGIN)
  @ApiOperation({ summary: 'Log in a user' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async login(
    @Body() dto: LoginDto,
    @Request() req: ApiRequest,
  ): Promise<AuthResponseDto> {
    return this.authService.login(dto, req);
  }

  @Post(AuthRoutes.TWO_FACTOR_VERIFY)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify 2FA token' })
  @ApiResponse({
    status: 200,
    description: '2FA verified',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async verifyTwoFactor(
    @Request() req: ApiRequest,
    @Body() dto: TwoFactorDto,
  ): Promise<AuthResponseDto> {
    return this.authService.verifyTwoFactor(req.user.userId, dto, req);
  }

  @Post(AuthRoutes.TWO_FACTOR_ENABLE)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enable 2FA for the user' })
  @ApiResponse({
    status: 200,
    description: '2FA enabled',
    type: TwoFactorSetupResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async enableTwoFactor(
    @Request() req: ApiRequest,
  ): Promise<TwoFactorSetupResponseDto> {
    return this.authService.enableTwoFactor(req.user.userId);
  }

  @Post(AuthRoutes.TWO_FACTOR_DISABLE)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable 2FA for the user' })
  @ApiResponse({ status: 204, description: '2FA disabled' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @HttpCode(204)
  async disableTwoFactor(
    @Request() req: ApiRequest,
    @Body('password') password: string,
  ): Promise<void> {
    return this.authService.disableTwoFactor(req.user.userId, password);
  }

  @Post(AuthRoutes.LOGOUT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Log out a user' })
  @ApiResponse({ status: 204, description: 'Logout successful' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @HttpCode(204)
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.authService.logout(dto.refreshToken);
  }

  @Post(AuthRoutes.REFRESH_TOKEN)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async refreshToken(
    @Body() dto: RefreshTokenDto,
    @Request() req: ApiRequest,
  ): Promise<AuthResponseDto> {
    const fingerprint = DeviceUtil.generateFingerprint(req);
    return this.authService.refreshToken(dto.refreshToken, fingerprint);
  }
}
