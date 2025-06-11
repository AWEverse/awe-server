import { IsEmail, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EmailVerificationDto {
  @ApiProperty({
    description: 'Email address to verify',
    example: 'user@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Verification token received via email',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class ResendVerificationDto {
  @ApiProperty({
    description: 'Email address to resend verification to',
    example: 'user@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export interface SessionInfo {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface SessionsResponse {
  sessions: SessionInfo[];
  activeCount: number;
}
