import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto, SettingsResponseDto } from './dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';

@ApiTags('Settings')
@Controller('settings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user settings' })
  @ApiResponse({
    status: 200,
    description: 'User settings retrieved successfully',
    type: SettingsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getMySettings(@GetUser('sub') userId: string): Promise<SettingsResponseDto> {
    return this.settingsService.getSettings(userId);
  }

  @Put()
  @ApiOperation({ summary: 'Update current user settings' })
  @ApiResponse({
    status: 200,
    description: 'Settings updated successfully',
    type: SettingsResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation errors' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateMySettings(
    @GetUser('id') userId: string,
    @Body() updateSettingsDto: UpdateSettingsDto,
  ): Promise<SettingsResponseDto> {
    return this.settingsService.updateSettings(userId, updateSettingsDto);
  }

  @Get(':category')
  @ApiParam({
    name: 'category',
    enum: [
      'uiSettings',
      'notifications',
      'privacy',
      'security',
      'dataStorage',
      'content',
      'experimental',
    ],
    description: 'Settings category to retrieve',
  })
  @ApiOperation({ summary: 'Get specific settings category' })
  @ApiResponse({ status: 200, description: 'Settings category retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Settings category not found' })
  async getSettingsCategory(@GetUser('id') userId: string, @Param('category') category: string) {
    return this.settingsService.getSettingCategory(userId, category);
  }

  @Put(':category')
  @ApiParam({
    name: 'category',
    enum: [
      'uiSettings',
      'notifications',
      'privacy',
      'security',
      'dataStorage',
      'content',
      'experimental',
    ],
    description: 'Settings category to update',
  })
  @ApiOperation({ summary: 'Update specific settings category' })
  @ApiResponse({
    status: 200,
    description: 'Settings category updated successfully',
    type: SettingsResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation errors' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateSettingsCategory(
    @GetUser('id') userId: string,
    @Param('category') category: string,
    @Body() data: any,
  ): Promise<SettingsResponseDto> {
    return this.settingsService.updateSettingCategory(userId, category as any, data);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset settings to default values' })
  @ApiResponse({
    status: 200,
    description: 'Settings reset to default successfully',
    type: SettingsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async resetSettings(@GetUser('id') userId: string): Promise<SettingsResponseDto> {
    return this.settingsService.resetSettings(userId);
  }

  @Post('block/:userToBlockId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block a user' })
  @ApiParam({ name: 'userToBlockId', description: 'ID of the user to block' })
  @ApiResponse({
    status: 200,
    description: 'User blocked successfully',
    type: SettingsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User to block not found' })
  async blockUser(
    @GetUser('id') userId: string,
    @Param('userToBlockId') userToBlockId: string,
  ): Promise<SettingsResponseDto> {
    return this.settingsService.blockUser(userId, userToBlockId);
  }

  @Delete('block/:userToUnblockId')
  @ApiOperation({ summary: 'Unblock a user' })
  @ApiParam({ name: 'userToUnblockId', description: 'ID of the user to unblock' })
  @ApiResponse({
    status: 200,
    description: 'User unblocked successfully',
    type: SettingsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async unblockUser(
    @GetUser('id') userId: string,
    @Param('userToUnblockId') userToUnblockId: string,
  ): Promise<SettingsResponseDto> {
    return this.settingsService.unblockUser(userId, userToUnblockId);
  }

  @Get('block/check/:otherUserId')
  @ApiOperation({ summary: 'Check if a user is blocked' })
  @ApiParam({ name: 'otherUserId', description: 'ID of the user to check' })
  @ApiResponse({
    status: 200,
    description: 'Block status checked successfully',
    schema: {
      type: 'object',
      properties: {
        blocked: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async checkUserBlocked(@GetUser('id') userId: string, @Param('otherUserId') otherUserId: string) {
    return this.settingsService.isUserBlocked(userId, otherUserId);
  }

  @Get('blocked-users/list')
  @ApiOperation({ summary: 'Get list of blocked users' })
  @ApiResponse({
    status: 200,
    description: 'Blocked users list retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        blockedUsers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              username: { type: 'string' },
              fullName: { type: 'string' },
              avatarUrl: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getBlockedUsers(@GetUser('id') userId: string) {
    return this.settingsService.getBlockedUsers(userId);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export user settings' })
  @ApiResponse({
    status: 200,
    description: 'Settings exported successfully',
    schema: { type: 'object' },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async exportSettings(@GetUser('id') userId: string) {
    return this.settingsService.exportSettings(userId);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Import user settings' })
  @ApiResponse({
    status: 200,
    description: 'Settings imported successfully',
    type: SettingsResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request - invalid settings data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async importSettings(
    @GetUser('id') userId: string,
    @Body() settingsData: any,
  ): Promise<SettingsResponseDto> {
    return this.settingsService.importSettings(userId, settingsData);
  }
}
