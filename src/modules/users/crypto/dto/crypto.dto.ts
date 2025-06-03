import { IsString, IsNumber, IsOptional, IsArray, ValidateNested, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateKeysDto {
  @IsString()
  identityKeyPublic: string;
}

export class KeyPairDto {
  @IsInt()
  @Min(0)
  @Max(0xFFFFFFFF) // 32-bit unsigned integer
  keyId: number;

  @IsString()
  publicKey: string;
}

export class SignedPreKeyDto extends KeyPairDto {
  @IsString()
  signature: string;

  @IsOptional()
  @IsString()
  expiresAt?: string; // ISO 8601 date string
}

export class UploadPreKeysDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(0xFFFFFFFF)
  keyId?: number;

  @IsOptional()
  @IsString()
  publicKey?: string;

  @IsOptional()
  @IsString()
  signature?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KeyPairDto)
  keys?: KeyPairDto[];
}

export class RotateSignedPreKeyDto {
  @IsOptional()
  @IsInt()
  oldKeyId?: number;

  @IsInt()
  @Min(0)
  @Max(0xFFFFFFFF)
  newKeyId: number;

  @IsString()
  publicKey: string;

  @IsString()
  signature: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class GetKeyBundleDto {
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeOneTimeKey?: boolean = true;
}

// Response DTOs

export interface KeyBundleResponse {
  identityKey: string;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  oneTimePreKey: {
    keyId: number;
    publicKey: string;
  } | null;
}

export interface KeyStatusResponse {
  identityKey: {
    exists: boolean;
    createdAt: Date;
  };
  signedPreKeys: {
    total: number;
    valid: number;
    expired: number;
  };
  oneTimePreKeys: {
    total: number;
    unused: number;
    used: number;
  };
}