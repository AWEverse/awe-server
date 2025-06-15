import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateKeysDto {
  @ApiProperty({
    description: 'Public identity key for the user in Base64 format',
    example: 'BQ4X5Nq8dQKjY7Hc4v2JKLmNoPqRstuVwx9zA1b2C3d4E5F6g7H8i9',
    maxLength: 256,
  })
  @IsString()
  identityKeyPublic: string;
}

export class KeyPairDto {
  @ApiProperty({
    description: 'Unique 32-bit unsigned integer identifier for the key',
    example: 123456,
    minimum: 0,
    maximum: 0xffffffff,
  })
  @IsInt()
  @Min(0)
  @Max(0xffffffff) // 32-bit unsigned integer
  keyId: number;

  @ApiProperty({
    description: 'Public key in Base64 format',
    example: 'BQ4X5Nq8dQKjY7Hc4v2JKLmNoPqRstuVwx9zA1b2C3d4E5F6g7H8i9',
    maxLength: 256,
  })
  @IsString()
  publicKey: string;
}

export class SignedPreKeyDto extends KeyPairDto {
  @ApiProperty({
    description: 'Digital signature of the public key in Base64 format',
    example: 'MEUCIQDxYz1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL...',
    maxLength: 512,
  })
  @IsString()
  signature: string;

  @ApiPropertyOptional({
    description: 'Expiration timestamp in ISO 8601 format',
    example: '2025-12-31T23:59:59.999Z',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  expiresAt?: string; // ISO 8601 date string
}

export class UploadPreKeysDto {
  @ApiPropertyOptional({
    description: 'Optional key ID for the signed pre-key',
    example: 123456,
    minimum: 0,
    maximum: 0xffffffff,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(0xffffffff)
  keyId?: number;

  @ApiPropertyOptional({
    description: 'Public key for the signed pre-key in Base64 format',
    example: 'BQ4X5Nq8dQKjY7Hc4v2JKLmNoPqRstuVwx9zA1b2C3d4E5F6g7H8i9',
    maxLength: 256,
  })
  @IsOptional()
  @IsString()
  publicKey?: string;

  @ApiPropertyOptional({
    description: 'Digital signature of the public key in Base64 format',
    example: 'MEUCIQDxYz1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL...',
    maxLength: 512,
  })
  @IsOptional()
  @IsString()
  signature?: string;

  @ApiPropertyOptional({
    description: 'Expiration timestamp in ISO 8601 format',
    example: '2025-12-31T23:59:59.999Z',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  expiresAt?: string;

  @ApiPropertyOptional({
    description: 'Array of one-time pre-keys for key exchange',
    type: [KeyPairDto],
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KeyPairDto)
  keys?: KeyPairDto[];
}

export class RotateSignedPreKeyDto {
  @ApiPropertyOptional({
    description: 'ID of the old signed pre-key to replace',
    example: 123455,
    minimum: 0,
    maximum: 0xffffffff,
  })
  @IsOptional()
  @IsInt()
  oldKeyId?: number;

  @ApiProperty({
    description: 'ID for the new signed pre-key',
    example: 123456,
    minimum: 0,
    maximum: 0xffffffff,
  })
  @IsInt()
  @Min(0)
  @Max(0xffffffff)
  newKeyId: number;

  @ApiProperty({
    description: 'Public key for the new signed pre-key in Base64 format',
    example: 'BQ4X5Nq8dQKjY7Hc4v2JKLmNoPqRstuVwx9zA1b2C3d4E5F6g7H8i9',
    maxLength: 256,
  })
  @IsString()
  publicKey: string;

  @ApiProperty({
    description: 'Digital signature of the new public key in Base64 format',
    example: 'MEUCIQDxYz1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL...',
    maxLength: 512,
  })
  @IsString()
  signature: string;

  @ApiPropertyOptional({
    description: 'Expiration timestamp for the new key in ISO 8601 format',
    example: '2025-12-31T23:59:59.999Z',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class GetKeyBundleDto {
  @ApiPropertyOptional({
    description: 'Whether to include a one-time pre-key in the bundle',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeOneTimeKey?: boolean = true;
}

// Response DTOs
export class KeyBundleResponse {
  @ApiProperty({
    description: "User's identity key in Base64 format",
    example: 'BQ4X5Nq8dQKjY7Hc4v2JKLmNoPqRstuVwx9zA1b2C3d4E5F6g7H8i9',
  })
  identityKey: string;

  @ApiProperty({
    description: 'Current signed pre-key information',
    type: 'object',
    properties: {
      keyId: { type: 'number', example: 123456 },
      publicKey: {
        type: 'string',
        example: 'BQ4X5Nq8dQKjY7Hc4v2JKLmNoPqRstuVwx9zA1b2C3d4E5F6g7H8i9',
      },
      signature: {
        type: 'string',
        example: 'MEUCIQDxYz1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL...',
      },
    },
  })
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };

  @ApiProperty({
    description: 'One-time pre-key information (null if none available)',
    nullable: true,
    type: 'object',
    properties: {
      keyId: { type: 'number', example: 789012 },
      publicKey: {
        type: 'string',
        example: 'BQ4X5Nq8dQKjY7Hc4v2JKLmNoPqRstuVwx9zA1b2C3d4E5F6g7H8i9',
      },
    },
  })
  oneTimePreKey: {
    keyId: number;
    publicKey: string;
  } | null;
}

export class KeyStatusResponse {
  @ApiProperty({
    description: 'Identity key status information',
    type: 'object',
    properties: {
      exists: { type: 'boolean', example: true },
      createdAt: { type: 'string', format: 'date-time', example: '2025-06-13T10:00:00.000Z' },
    },
  })
  identityKey: {
    exists: boolean;
    createdAt: Date;
  };

  @ApiProperty({
    description: 'Signed pre-keys statistics',
    type: 'object',
    properties: {
      total: { type: 'number', example: 5 },
      valid: { type: 'number', example: 4 },
      expired: { type: 'number', example: 1 },
    },
  })
  signedPreKeys: {
    total: number;
    valid: number;
    expired: number;
  };

  @ApiProperty({
    description: 'One-time pre-keys statistics',
    type: 'object',
    properties: {
      total: { type: 'number', example: 100 },
      unused: { type: 'number', example: 75 },
      used: { type: 'number', example: 25 },
    },
  })
  oneTimePreKeys: {
    total: number;
    unused: number;
    used: number;
  };
}
