import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SettingsResponseDto {
  @ApiProperty({
    description: 'Settings ID',
    example: '12345',
  })
  id: string;

  @ApiProperty({
    description: 'User ID',
    example: '67890',
  })
  userId: string;

  @ApiPropertyOptional({
    description: 'UI settings including theme, language, fontSize, animations',
    example: {
      theme: 'dark',
      language: 'en',
      fontSize: 14,
      animations: true,
    },
  })
  uiSettings?: any;

  @ApiPropertyOptional({
    description: 'Notification settings including enabled, sound, vibration, types',
    example: {
      enabled: true,
      sound: true,
      vibration: false,
      types: ['messages', 'mentions'],
    },
  })
  notifications?: any;

  @ApiPropertyOptional({
    description: 'Privacy settings including lastSeen, profilePhoto, status, messaging',
    example: {
      lastSeen: 'contacts',
      profilePhoto: 'everyone',
      status: 'contacts',
      messaging: 'everyone',
    },
  })
  privacy?: any;

  @ApiPropertyOptional({
    description: 'Security settings including biometric, twoFactor, sessionTimeout',
    example: {
      biometric: false,
      twoFactor: true,
      sessionTimeout: 60,
    },
  })
  security?: any;

  @ApiPropertyOptional({
    description: 'Data storage settings including autoDownload, backup, quality',
    example: {
      autoDownload: 'wifi',
      backup: true,
      quality: 'high',
    },
  })
  dataStorage?: any;

  @ApiPropertyOptional({
    description: 'Content settings including autoplay, captions, recommendations',
    example: {
      autoplay: true,
      captions: false,
      recommendations: true,
    },
  })
  content?: any;

  @ApiPropertyOptional({
    description: 'Experimental settings including betaFeatures, labs',
    example: {
      betaFeatures: ['newUI'],
      labs: false,
    },
  })
  experimental?: any;

  @ApiPropertyOptional({
    description: 'List of blocked user IDs',
    example: ['123', '456'],
  })
  blockedUsers?: string[];

  @ApiProperty({
    description: 'Settings creation timestamp',
    example: '2023-01-15T08:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Settings last update timestamp',
    example: '2023-12-07T10:30:00.000Z',
  })
  updatedAt: Date;
}
