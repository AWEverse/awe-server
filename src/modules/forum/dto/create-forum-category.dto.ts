import { IsString, IsOptional, MaxLength, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateForumCategoryDto {
  @ApiProperty({ description: 'Название категории', maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name: string;

  @ApiProperty({ description: 'URL-slug категории', maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  slug: string;

  @ApiPropertyOptional({ description: 'Описание категории', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
