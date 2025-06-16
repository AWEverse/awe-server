import { IsString, IsNotEmpty, MaxLength, IsArray, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateForumPostDto {
  @ApiProperty({ description: 'Заголовок поста', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Содержимое поста' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ description: 'URL-slug поста', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  slug: string;

  @ApiPropertyOptional({ description: 'Теги поста', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
