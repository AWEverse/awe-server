import {
  IsString,
  IsEmail,
  MinLength,
  IsArray,
  IsObject,
  IsInt,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PrekeyDto {
  @ApiProperty({ description: 'Prekey ID' })
  @IsInt()
  id: number;

  @ApiProperty({ description: 'Public key in base64' })
  @IsString()
  public: string;
}

export class SignedPrekeyDto extends PrekeyDto {
  @ApiProperty({ description: 'Signature in base64' })
  @IsString()
  signature: string;
}

export class RegisterDto {
  @ApiProperty({ description: 'Username of the user' })
  @IsString()
  @MinLength(3)
  username: string;

  @ApiProperty({ description: 'Email address of the user' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Password for the user' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ description: 'Public identity key in base64' })
  @IsString()
  identityKeyPublic: string;

  @ApiProperty({ description: 'Signed prekey for Signal Protocol' })
  @IsObject()
  signedPrekey: SignedPrekeyDto;

  @ApiProperty({ description: 'Array of one-time prekeys for Signal Protocol' })
  @IsArray()
  oneTimePrekeys: PrekeyDto[];
}
