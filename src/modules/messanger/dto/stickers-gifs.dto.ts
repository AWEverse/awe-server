import { IsString, IsOptional, IsNotEmpty, IsNumber, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO для отправки стикера в чат
 */
export class SendStickerDto {
  @ApiProperty({
    description: 'ID of the sticker to send',
    example: '12345678901234567890',
  })
  @IsNotEmpty()
  @Transform(({ value }) => BigInt(value))
  stickerId: bigint;

  @ApiPropertyOptional({
    description: 'ID of the message this is replying to',
    example: '98765432101234567890',
  })
  @IsOptional()
  @Transform(({ value }) => (value ? BigInt(value) : undefined))
  replyToId?: bigint;

  @ApiPropertyOptional({
    description: 'ID of the thread this message belongs to',
    example: '11111111111111111111',
  })
  @IsOptional()
  @Transform(({ value }) => (value ? BigInt(value) : undefined))
  threadId?: bigint;
}

/**
 * DTO для отправки GIF в чат
 */
export class SendGifDto {
  @ApiProperty({
    description: 'ID of the GIF to send',
    example: '12345678901234567890',
  })
  @IsNotEmpty()
  @Transform(({ value }) => BigInt(value))
  gifId: bigint;

  @ApiPropertyOptional({
    description: 'ID of the message this is replying to',
    example: '98765432101234567890',
  })
  @IsOptional()
  @Transform(({ value }) => (value ? BigInt(value) : undefined))
  replyToId?: bigint;

  @ApiPropertyOptional({
    description: 'ID of the thread this message belongs to',
    example: '11111111111111111111',
  })
  @IsOptional()
  @Transform(({ value }) => (value ? BigInt(value) : undefined))
  threadId?: bigint;
}

/**
 * DTO для отправки кастомного эмодзи в чат
 */
export class SendCustomEmojiDto {
  @ApiProperty({
    description: 'ID of the custom emoji to send',
    example: '12345678901234567890',
  })
  @IsNotEmpty()
  @Transform(({ value }) => BigInt(value))
  emojiId: bigint;

  @ApiPropertyOptional({
    description: 'ID of the message this is replying to',
    example: '98765432101234567890',
  })
  @IsOptional()
  @Transform(({ value }) => (value ? BigInt(value) : undefined))
  replyToId?: bigint;

  @ApiPropertyOptional({
    description: 'ID of the thread this message belongs to',
    example: '11111111111111111111',
  })
  @IsOptional()
  @Transform(({ value }) => (value ? BigInt(value) : undefined))
  threadId?: bigint;
}

/**
 * DTO для поиска GIF
 */
export class SearchGifsDto {
  @ApiProperty({
    description: 'Search query for GIFs',
    example: 'funny cat',
  })
  @IsString()
  @IsNotEmpty()
  query: string;

  @ApiPropertyOptional({
    description: 'Maximum number of GIFs to return',
    minimum: 1,
    maximum: 50,
    default: 20,
    example: 20,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
