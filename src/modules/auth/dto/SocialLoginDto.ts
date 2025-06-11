import { IsIn, IsUrl, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SocialLoginDto {
  @ApiProperty({
    description: 'OAuth provider',
    example: 'google',
    enum: ['google', 'twitter', 'facebook', 'github', 'discord'],
  })
  @IsIn(['google', 'twitter', 'facebook', 'github', 'discord'], {
    message: 'Provider must be one of: google, twitter, facebook, github, discord',
  })
  provider: 'google' | 'twitter' | 'facebook' | 'github' | 'discord';

  @ApiProperty({
    description: 'Redirect URL after authentication',
    example: 'https://myapp.com/auth/callback',
    required: false,
  })
  @IsOptional()
  @IsUrl({}, { message: 'Redirect URL must be a valid URL' })
  redirectUrl?: string;
}
