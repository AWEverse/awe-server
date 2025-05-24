import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken: string;

  @ApiProperty({ description: 'JWT refresh token' })
  refreshToken: string;

  @ApiProperty({ description: 'Indicates if 2FA is required', required: false })
  twoFactorRequired?: boolean;
}

export class TwoFactorSetupResponseDto {
  @ApiProperty({ description: '2FA secret for authenticator app' })
  secret: string;

  @ApiProperty({ description: 'QR code URL for 2FA setup' })
  qrCodeUrl: string;
}

export class UserProfileDto {
  @ApiProperty({ description: 'User ID' })
  id: string;

  @ApiProperty({ description: 'Username' })
  username: string;

  @ApiProperty({ description: 'Email address' })
  email: string;

  @ApiProperty({ description: 'Role name' })
  role: string;

  @ApiProperty({
    description: 'Access level',
    enum: ['USER', 'ADMIN', 'MODERATOR'],
  })
  accessLevel: string;
}
