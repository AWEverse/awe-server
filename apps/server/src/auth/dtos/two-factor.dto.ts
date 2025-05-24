import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TwoFactorDto {
  @ApiProperty({ description: '2FA token from authenticator app' })
  @IsString()
  @Length(6, 6)
  token: string;
}
