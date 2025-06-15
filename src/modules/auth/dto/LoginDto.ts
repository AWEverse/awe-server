import {
  IsEmail,
  MinLength,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class LoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    format: 'email',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  @Transform(({ value }) => value?.toLowerCase()?.trim())
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'StrongP@ss123',
    minLength: 6,
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @ApiProperty({
    description: 'Remember user session for extended period',
    example: false,
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  rememberMe?: boolean = false;
  @ApiProperty({
    description: 'Device token for push notifications and device identification',
    example: 'device-token-abc123xyz789',
    required: false,
    maxLength: 512,
  })
  @IsOptional()
  @IsString()
  @MaxLength(512, { message: 'Device token cannot exceed 512 characters' })
  deviceToken?: string;

  @ApiProperty({
    description: 'User agent string of the client making the request',
    example:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
    required: false,
    maxLength: 1024,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024, { message: 'User agent cannot exceed 1024 characters' })
  userAgent?: string;

  @ApiProperty({
    description: 'Browser fingerprint for additional security validation',
    example: 'fp-a1b2c3d4e5f6g7h8i9j0',
    required: false,
    maxLength: 256,
  })
  @IsOptional()
  @IsString()
  @MaxLength(256, { message: 'Fingerprint cannot exceed 256 characters' })
  fingerprint?: string;
}
