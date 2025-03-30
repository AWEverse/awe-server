import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: 'Username or email of the user' })
  @IsString()
  usernameOrEmail: string;

  @ApiProperty({ description: 'Password for the user' })
  @IsString()
  @MinLength(8)
  password: string;
}
