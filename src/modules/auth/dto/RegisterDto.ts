import {
  IsEmail,
  MinLength,
  IsString,
  MaxLength,
  Matches,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class RegisterDto {
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
    description:
      'User password (minimum 8 characters, must contain uppercase, lowercase, number and special character)',
    example: 'StrongP@ss123',
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128, { message: 'Password cannot exceed 128 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).+$/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character',
  })
  password: string;

  @ApiProperty({
    description: 'Unique username (3-30 characters, alphanumeric and underscores only)',
    example: 'john_doe123',
    minLength: 3,
    maxLength: 30,
  })
  @IsString()
  @IsNotEmpty({ message: 'Username is required' })
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  @MaxLength(30, { message: 'Username cannot exceed 30 characters' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username can only contain letters, numbers and underscores',
  })
  @Transform(({ value }) => value?.toLowerCase()?.trim())
  username: string;

  @ApiProperty({
    description: 'User full name',
    example: 'John Doe',
    required: false,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Full name cannot exceed 100 characters' })
  @Transform(({ value }) => value?.trim())
  fullName?: string;
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
