import { IsString, IsOptional, IsBoolean, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCommentDto {
  @ApiProperty({
    description: 'Content of the comment',
    example: 'Great video! Really enjoyed watching it.',
    minLength: 1,
    maxLength: 1000,
  })
  @IsString()
  @Length(1, 1000)
  text: string;

  @ApiPropertyOptional({
    description: 'ID of the parent comment for replies',
    example: 'comment_123456789',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  parentId?: string;
}

export class UpdateCommentDto {
  @ApiProperty({
    description: 'Updated content of the comment',
    example: 'Great video! Really enjoyed watching it. [Edited]',
    minLength: 1,
    maxLength: 1000,
  })
  @IsString()
  @Length(1, 1000)
  text: string;
}

export class CommentInteractionDto {
  @ApiProperty({
    description: 'Type of interaction with the comment',
    enum: ['like', 'dislike', 'none'],
    example: 'like',
  })
  @IsString()
  action: 'like' | 'dislike' | 'none';
}
