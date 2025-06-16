import { IsString, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateForumDto {
  @ApiProperty({ description: 'Название форума', maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name: string;

  @ApiProperty({ description: 'URL-slug форума', maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  slug: string;

  @ApiPropertyOptional({ description: 'Описание форума', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
