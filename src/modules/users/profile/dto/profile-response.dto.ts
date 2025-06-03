import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProfileResponseDto {
  @ApiProperty({
    description: 'User ID',
    example: '12345',
  })
  id: string;

  @ApiProperty({
    description: 'User email',
    example: 'user@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'Username',
    example: 'johndoe',
  })
  username: string;
  @ApiPropertyOptional({
    description: 'User full name',
    example: 'John Doe',
  })
  fullName?: string | null;
  @ApiPropertyOptional({
    description: 'User bio/description',
    example: 'Software developer and tech enthusiast',
  })
  bio?: string | null;

  @ApiPropertyOptional({
    description: 'Avatar URL',
    example: 'https://example.com/avatar.jpg',
  })
  avatarUrl?: string | null;

  @ApiPropertyOptional({
    description: 'Banner/cover image URL',
    example: 'https://example.com/banner.jpg',
  })
  bannerUrl?: string | null;

  @ApiPropertyOptional({
    description: 'Profile color in HEX format',
    example: '#FF5733',
  })
  color?: string | null;

  @ApiPropertyOptional({
    description: 'Phone number',
    example: '+1234567890',
  })
  phoneNumber?: string | null;

  @ApiPropertyOptional({
    description: 'User timezone',
    example: 'America/New_York',
  })
  timezone?: string | null;

  @ApiPropertyOptional({
    description: 'User locale',
    example: 'en-US',
  })
  locale?: string | null;

  @ApiProperty({
    description: 'User flags (bitwise)',
    example: 5,
  })
  flags: number;

  @ApiProperty({
    description: 'User status',
    example: 'ACTIVE',
  })
  status: string;

  @ApiProperty({
    description: 'Subscribers count',
    example: 1250,
  })
  subscribersCount: number;

  @ApiProperty({
    description: 'Subscriptions count',
    example: 150,
  })
  subscriptionsCount: number;

  @ApiProperty({
    description: 'Videos count',
    example: 45,
  })
  videosCount: number;

  @ApiProperty({
    description: 'Posts count',
    example: 120,
  })
  postsCount: number;

  @ApiProperty({
    description: 'Total views',
    example: '1500000',
  })
  totalViews: string;

  @ApiProperty({
    description: 'Total likes',
    example: '75000',
  })
  totalLikes: string;

  @ApiProperty({
    description: 'Reputation score',
    example: 850,
  })
  reputation: number;
  @ApiPropertyOptional({
    description: 'Last seen timestamp',
    example: '2023-12-07T10:30:00.000Z',
  })
  lastSeen?: Date | null;

  @ApiProperty({
    description: 'Account creation timestamp',
    example: '2023-01-15T08:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2023-12-07T10:30:00.000Z',
  })
  updatedAt: Date;
}
