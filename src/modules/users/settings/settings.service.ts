import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../libs/supabase/db/prisma.service';
import { UpdateSettingsDto, SettingsResponseDto } from './dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get user settings by user ID
   */
  async getSettings(userId: string): Promise<SettingsResponseDto> {
    let userSettings = await this.prisma.userSettings.findUnique({
      where: { userId: BigInt(userId) },
    }); // Create default settings if they don't exist
    if (!userSettings) {
      userSettings = await this.createDefaultSettings(userId);
    }

    return {
      ...userSettings!,
      id: userSettings!.id.toString(),
      userId: userSettings!.userId.toString(),
      blockedUsers: (userSettings!.blockedUsers as bigint[])?.map(id => id.toString()) || [],
      createdAt: userSettings!.createdAt,
      updatedAt: userSettings!.updatedAt,
    };
  }

  /**
   * Update user settings
   */
  async updateSettings(
    userId: string,
    updateData: UpdateSettingsDto,
  ): Promise<SettingsResponseDto> {
    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    } // Convert blockedUsers strings to BigInt if provided
    const updateDataWithBigInt: any = { ...updateData };
    if (updateData.blockedUsers) {
      updateDataWithBigInt.blockedUsers = updateData.blockedUsers.map(id => BigInt(id));
    }

    try {
      // Try to update existing settings
      let userSettings = await this.prisma.userSettings.update({
        where: { userId: BigInt(userId) },
        data: updateDataWithBigInt as any,
      });
      return {
        ...userSettings,
        id: userSettings.id.toString(),
        userId: userSettings.userId.toString(),
        blockedUsers: (userSettings.blockedUsers as bigint[])?.map(id => id.toString()) || [],
        createdAt: userSettings.createdAt,
        updatedAt: userSettings.updatedAt,
      };
    } catch (error) {
      if (error.code === 'P2025') {
        // Record not found, create new settings
        const newSettings = await this.createDefaultSettings(userId, updateDataWithBigInt);
        return {
          ...newSettings,
          id: newSettings.id.toString(),
          userId: newSettings.userId.toString(),
          blockedUsers: (newSettings.blockedUsers as bigint[])?.map(id => id.toString()) || [],
          createdAt: newSettings.createdAt,
          updatedAt: newSettings.updatedAt,
        };
      }
      throw error;
    }
  }

  /**
   * Update specific setting category
   */
  async updateSettingCategory(
    userId: string,
    category: keyof UpdateSettingsDto,
    data: any,
  ): Promise<SettingsResponseDto> {
    const updateData = { [category]: data };
    return this.updateSettings(userId, updateData);
  }

  /**
   * Get specific setting category
   */
  async getSettingCategory(userId: string, category: string): Promise<any> {
    const settings = await this.getSettings(userId);
    return settings[category as keyof SettingsResponseDto] || null;
  }

  /**
   * Reset settings to default
   */
  async resetSettings(userId: string): Promise<SettingsResponseDto> {
    const defaultSettings = this.getDefaultSettingsData();

    try {
      const userSettings = await this.prisma.userSettings.update({
        where: { userId: BigInt(userId) },
        data: defaultSettings as any,
      });

      return {
        ...userSettings,
        id: userSettings.id.toString(),
        userId: userSettings.userId.toString(),
        blockedUsers: [],
        createdAt: userSettings.createdAt,
        updatedAt: userSettings.updatedAt,
      };
    } catch (error) {
      if (error.code === 'P2025') {
        // Record not found, create new settings
        const newSettings = await this.createDefaultSettings(userId);
        return {
          ...newSettings,
          id: newSettings.id.toString(),
          userId: newSettings.userId.toString(),
          blockedUsers: [],
        };
      }
      throw error;
    }
  }

  /**
   * Block a user
   */
  async blockUser(userId: string, userToBlockId: string): Promise<SettingsResponseDto> {
    const settings = await this.getSettings(userId);
    const currentBlockedUsers = settings.blockedUsers || [];

    if (!currentBlockedUsers.includes(userToBlockId)) {
      const updatedBlockedUsers = [...currentBlockedUsers, userToBlockId];
      return this.updateSettings(userId, { blockedUsers: updatedBlockedUsers });
    }

    return settings;
  }

  /**
   * Unblock a user
   */
  async unblockUser(userId: string, userToUnblockId: string): Promise<SettingsResponseDto> {
    const settings = await this.getSettings(userId);
    const currentBlockedUsers = settings.blockedUsers || [];
    const updatedBlockedUsers = currentBlockedUsers.filter(id => id !== userToUnblockId);

    return this.updateSettings(userId, { blockedUsers: updatedBlockedUsers });
  }

  /**
   * Check if user is blocked
   */
  async isUserBlocked(userId: string, otherUserId: string): Promise<{ blocked: boolean }> {
    const settings = await this.getSettings(userId);
    const blockedUsers = settings.blockedUsers || [];
    return { blocked: blockedUsers.includes(otherUserId) };
  }

  /**
   * Get blocked users list
   */
  async getBlockedUsers(userId: string): Promise<{ blockedUsers: any[] }> {
    const settings = await this.getSettings(userId);
    const blockedUserIds = settings.blockedUsers || [];

    if (blockedUserIds.length === 0) {
      return { blockedUsers: [] };
    }

    const blockedUsers = await this.prisma.user.findMany({
      where: {
        id: {
          in: blockedUserIds.map(id => BigInt(id)),
        },
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        avatarUrl: true,
      },
    });

    return {
      blockedUsers: blockedUsers.map(user => ({
        ...user,
        id: user.id.toString(),
      })),
    };
  }

  /**
   * Export user settings
   */
  async exportSettings(userId: string): Promise<any> {
    const settings = await this.getSettings(userId);
    const { id, userId: settingsUserId, createdAt, updatedAt, ...exportableSettings } = settings;
    return exportableSettings;
  }

  /**
   * Import user settings
   */
  async importSettings(userId: string, settingsData: any): Promise<SettingsResponseDto> {
    // Validate and sanitize the imported data
    const validatedData = this.validateImportData(settingsData);
    return this.updateSettings(userId, validatedData);
  }

  /**
   * Create default settings for a user
   */
  private async createDefaultSettings(userId: string, customData: any = {}): Promise<any> {
    const defaultData = this.getDefaultSettingsData();
    const settingsData = { ...defaultData, ...customData };

    return this.prisma.userSettings.create({
      data: {
        userId: BigInt(userId),
        ...settingsData,
      },
    });
  }

  /**
   * Get default settings data
   */
  private getDefaultSettingsData() {
    return {
      uiSettings: {
        theme: 'auto',
        language: 'en',
        fontSize: 14,
        animations: true,
      },
      notifications: {
        enabled: true,
        sound: true,
        vibration: true,
        types: ['messages', 'mentions', 'likes', 'comments'],
      },
      privacy: {
        lastSeen: 'contacts',
        profilePhoto: 'everyone',
        status: 'contacts',
        messaging: 'everyone',
      },
      security: {
        biometric: false,
        twoFactor: false,
        sessionTimeout: 60,
      },
      dataStorage: {
        autoDownload: 'wifi',
        backup: true,
        quality: 'high',
      },
      content: {
        autoplay: true,
        captions: false,
        recommendations: true,
      },
      experimental: {
        betaFeatures: [],
        labs: false,
      },
      blockedUsers: [],
    };
  }

  /**
   * Validate imported settings data
   */
  private validateImportData(data: any): UpdateSettingsDto {
    const validatedData: UpdateSettingsDto = {};

    // Validate each section with basic type checking
    if (data.uiSettings && typeof data.uiSettings === 'object') {
      validatedData.uiSettings = data.uiSettings;
    }

    if (data.notifications && typeof data.notifications === 'object') {
      validatedData.notifications = data.notifications;
    }

    if (data.privacy && typeof data.privacy === 'object') {
      validatedData.privacy = data.privacy;
    }

    if (data.security && typeof data.security === 'object') {
      validatedData.security = data.security;
    }

    if (data.dataStorage && typeof data.dataStorage === 'object') {
      validatedData.dataStorage = data.dataStorage;
    }

    if (data.content && typeof data.content === 'object') {
      validatedData.content = data.content;
    }

    if (data.experimental && typeof data.experimental === 'object') {
      validatedData.experimental = data.experimental;
    }

    if (Array.isArray(data.blockedUsers)) {
      validatedData.blockedUsers = data.blockedUsers.filter(id => typeof id === 'string');
    }

    return validatedData;
  }
}
