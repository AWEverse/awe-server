import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateForumReplyDto {
  @ApiProperty({ description: 'Содержимое ответа' })
  @IsString()
  @IsNotEmpty()
  content: string;
}
