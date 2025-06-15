import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Refresh token is required' })
  refreshToken: string;

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
}
