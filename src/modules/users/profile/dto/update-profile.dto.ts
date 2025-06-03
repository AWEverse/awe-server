import { IsString, IsOptional, MaxLength, IsUrl, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'User full name',
    maxLength: 128,
    example: 'John Doe',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  fullName?: string;

  @ApiPropertyOptional({
    description: 'User bio/description',
    maxLength: 500,
    example: 'Software developer and tech enthusiast',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({
    description: 'Avatar URL',
    maxLength: 512,
    example: 'https://example.com/avatar.jpg',
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(512)
  avatarUrl?: string;

  @ApiPropertyOptional({
    description: 'Banner/cover image URL',
    maxLength: 512,
    example: 'https://example.com/banner.jpg',
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(512)
  bannerUrl?: string;

  @ApiPropertyOptional({
    description: 'Profile color in HEX format',
    pattern: '^#[0-9A-Fa-f]{6}$',
    example: '#FF5733',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Color must be a valid HEX color code' })
  color?: string;

  @ApiPropertyOptional({
    description: 'Phone number',
    maxLength: 15,
    example: '+1234567890',
  })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  phoneNumber?: string;

  @ApiPropertyOptional({
    description: 'User timezone',
    maxLength: 32,
    example: 'America/New_York',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  timezone?: string;

  @ApiPropertyOptional({
    description: 'User locale',
    maxLength: 10,
    example: 'en-US',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string;
}
