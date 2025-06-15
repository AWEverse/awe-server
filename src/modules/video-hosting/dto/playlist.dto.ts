import { IsString, IsOptional, IsBoolean, IsArray, Length, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePlaylistDto {
  @ApiProperty({
    description: 'Title of the playlist',
    example: 'My Favorite Tech Videos',
    minLength: 1,
    maxLength: 128,
  })
  @IsString()
  @Length(1, 128)
  title: string;

  @ApiPropertyOptional({
    description: 'Description of the playlist',
    example: 'A collection of my favorite technology and programming videos',
    maxLength: 500,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @ApiPropertyOptional({
    description: 'URL of the playlist thumbnail image',
    example: 'https://cdn.example.com/thumbnails/playlist_123.jpg',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional({
    description: 'Whether the playlist is public and visible to other users',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  public?: boolean = true;

  @ApiPropertyOptional({
    description: 'Whether other users can add videos to this playlist',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  collaborative?: boolean = false;
}

export class UpdatePlaylistDto {
  @ApiPropertyOptional({
    description: 'Updated title of the playlist',
    example: 'My Updated Tech Videos Collection',
    minLength: 1,
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  title?: string;

  @ApiPropertyOptional({
    description: 'Updated description of the playlist',
    example: 'An updated collection of my favorite technology videos',
    maxLength: 500,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Updated URL of the playlist thumbnail image',
    example: 'https://cdn.example.com/thumbnails/playlist_123_new.jpg',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional({
    description: 'Updated public visibility setting',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  public?: boolean;

  @ApiPropertyOptional({
    description: 'Updated collaborative setting',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  collaborative?: boolean;
}

export class AddToPlaylistDto {
  @ApiProperty({
    description: 'ID of the video to add to the playlist',
    example: 'video_123456789',
  })
  @IsString()
  videoId: string;

  @ApiPropertyOptional({
    description: 'Position in the playlist where to insert the video (0-based index)',
    example: 2,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  position?: number;
}
