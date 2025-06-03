import {
  IsBoolean,
  IsNumber,
  IsString,
  IsArray,
  IsOptional,
  IsIn,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UISettingsDto {
  @ApiPropertyOptional({
    description: 'UI theme preference',
    enum: ['light', 'dark', 'auto'],
    example: 'dark',
  })
  @IsOptional()
  @IsString()
  @IsIn(['light', 'dark', 'auto'])
  theme?: string;

  @ApiPropertyOptional({
    description: 'UI language preference',
    example: 'en',
  })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({
    description: 'Font size preference',
    minimum: 12,
    maximum: 24,
    example: 14,
  })
  @IsOptional()
  @IsNumber()
  @Min(12)
  @Max(24)
  fontSize?: number;

  @ApiPropertyOptional({
    description: 'Enable UI animations',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  animations?: boolean;
}

export class NotificationSettingsDto {
  @ApiPropertyOptional({
    description: 'Enable notifications',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: 'Enable notification sounds',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  sound?: boolean;

  @ApiPropertyOptional({
    description: 'Enable vibration',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  vibration?: boolean;

  @ApiPropertyOptional({
    description: 'Notification types to receive',
    example: ['messages', 'mentions', 'likes'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  types?: string[];
}

export class PrivacySettingsDto {
  @ApiPropertyOptional({
    description: 'Last seen visibility',
    enum: ['everyone', 'contacts', 'nobody'],
    example: 'contacts',
  })
  @IsOptional()
  @IsString()
  @IsIn(['everyone', 'contacts', 'nobody'])
  lastSeen?: string;

  @ApiPropertyOptional({
    description: 'Profile photo visibility',
    enum: ['everyone', 'contacts', 'nobody'],
    example: 'everyone',
  })
  @IsOptional()
  @IsString()
  @IsIn(['everyone', 'contacts', 'nobody'])
  profilePhoto?: string;

  @ApiPropertyOptional({
    description: 'Status visibility',
    enum: ['everyone', 'contacts', 'nobody'],
    example: 'contacts',
  })
  @IsOptional()
  @IsString()
  @IsIn(['everyone', 'contacts', 'nobody'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Who can message you',
    enum: ['everyone', 'contacts', 'nobody'],
    example: 'everyone',
  })
  @IsOptional()
  @IsString()
  @IsIn(['everyone', 'contacts', 'nobody'])
  messaging?: string;
}

export class SecuritySettingsDto {
  @ApiPropertyOptional({
    description: 'Enable biometric authentication',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  biometric?: boolean;

  @ApiPropertyOptional({
    description: 'Enable two-factor authentication',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  twoFactor?: boolean;

  @ApiPropertyOptional({
    description: 'Session timeout in minutes',
    minimum: 5,
    maximum: 10080,
    example: 60,
  })
  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(10080) // 7 days
  sessionTimeout?: number;
}

export class DataStorageSettingsDto {
  @ApiPropertyOptional({
    description: 'Auto download preference',
    enum: ['never', 'wifi', 'always'],
    example: 'wifi',
  })
  @IsOptional()
  @IsString()
  @IsIn(['never', 'wifi', 'always'])
  autoDownload?: string;

  @ApiPropertyOptional({
    description: 'Enable automatic backup',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  backup?: boolean;

  @ApiPropertyOptional({
    description: 'Media quality preference',
    enum: ['low', 'medium', 'high', 'original'],
    example: 'high',
  })
  @IsOptional()
  @IsString()
  @IsIn(['low', 'medium', 'high', 'original'])
  quality?: string;
}

export class ContentSettingsDto {
  @ApiPropertyOptional({
    description: 'Enable video autoplay',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  autoplay?: boolean;

  @ApiPropertyOptional({
    description: 'Enable captions by default',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  captions?: boolean;

  @ApiPropertyOptional({
    description: 'Enable content recommendations',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  recommendations?: boolean;
}

export class ExperimentalSettingsDto {
  @ApiPropertyOptional({
    description: 'Enabled beta features',
    example: ['newUI', 'advancedSearch'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  betaFeatures?: string[];

  @ApiPropertyOptional({
    description: 'Enable experimental labs',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  labs?: boolean;
}

export class UpdateSettingsDto {
  @ApiPropertyOptional({
    description: 'UI settings',
    type: UISettingsDto,
  })
  @IsOptional()
  @Type(() => UISettingsDto)
  uiSettings?: UISettingsDto;

  @ApiPropertyOptional({
    description: 'Notification settings',
    type: NotificationSettingsDto,
  })
  @IsOptional()
  @Type(() => NotificationSettingsDto)
  notifications?: NotificationSettingsDto;

  @ApiPropertyOptional({
    description: 'Privacy settings',
    type: PrivacySettingsDto,
  })
  @IsOptional()
  @Type(() => PrivacySettingsDto)
  privacy?: PrivacySettingsDto;

  @ApiPropertyOptional({
    description: 'Security settings',
    type: SecuritySettingsDto,
  })
  @IsOptional()
  @Type(() => SecuritySettingsDto)
  security?: SecuritySettingsDto;

  @ApiPropertyOptional({
    description: 'Data storage settings',
    type: DataStorageSettingsDto,
  })
  @IsOptional()
  @Type(() => DataStorageSettingsDto)
  dataStorage?: DataStorageSettingsDto;

  @ApiPropertyOptional({
    description: 'Content settings',
    type: ContentSettingsDto,
  })
  @IsOptional()
  @Type(() => ContentSettingsDto)
  content?: ContentSettingsDto;

  @ApiPropertyOptional({
    description: 'Experimental settings',
    type: ExperimentalSettingsDto,
  })
  @IsOptional()
  @Type(() => ExperimentalSettingsDto)
  experimental?: ExperimentalSettingsDto;

  @ApiPropertyOptional({
    description: 'List of blocked user IDs',
    example: ['123', '456'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blockedUsers?: string[];
}
