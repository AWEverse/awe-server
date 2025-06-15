import { ApiProperty } from '@nestjs/swagger';

export class UserDataDto {
  @ApiProperty({
    description: 'Уникальный идентификатор пользователя',
    example: 'clh7x9z1v0000pv8f2q8z8z1v',
  })
  id: string;

  @ApiProperty({
    description: 'Email адрес пользователя',
    example: 'user@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'Имя пользователя',
    example: 'john_doe',
  })
  username: string;

  @ApiProperty({
    description: 'Полное имя пользователя',
    example: 'John Doe',
    required: false,
  })
  fullName?: string;

  @ApiProperty({
    description: 'Роль пользователя',
    example: { name: 'user', permissions: [] },
    required: false,
  })
  role?: any;

  @ApiProperty({
    description: 'Статус верификации email',
    example: true,
  })
  emailVerified: boolean;

  @ApiProperty({
    description: 'Дата создания аккаунта',
    example: '2025-06-13T10:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Дата последнего обновления',
    example: '2025-06-13T10:00:00.000Z',
  })
  updatedAt: Date;
}

export class LoginResponseDto {
  @ApiProperty({
    description: 'Данные пользователя',
    type: UserDataDto,
  })
  user: UserDataDto;

  @ApiProperty({
    description: 'JWT токен доступа',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Refresh токен',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;

  @ApiProperty({
    description: 'Время истечения токена (timestamp)',
    example: 1685714400000,
  })
  expiresAt: number;

  @ApiProperty({
    description: 'Тип токена',
    example: 'Bearer',
  })
  tokenType: string;
}

export class RegisterUserDataDto {
  @ApiProperty({
    description: 'Уникальный идентификатор пользователя',
    example: 'clh7x9z1v0000pv8f2q8z8z1v',
  })
  id: string;

  @ApiProperty({
    description: 'Email адрес пользователя',
    example: 'user@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'Имя пользователя',
    example: 'john_doe',
  })
  username: string;

  @ApiProperty({
    description: 'Полное имя пользователя',
    example: 'John Doe',
    required: false,
  })
  fullName?: string;

  @ApiProperty({
    description: 'Статус верификации email',
    example: false,
  })
  emailVerified: boolean;
}

export class RegisterResponseDto {
  @ApiProperty({
    description: 'Данные зарегистрированного пользователя',
    type: RegisterUserDataDto,
  })
  user: RegisterUserDataDto;

  @ApiProperty({
    description: 'Сообщение о результате регистрации',
    example: 'User registered successfully. Please check your email for verification.',
  })
  message: string;

  @ApiProperty({
    description: 'Требуется ли верификация email',
    example: true,
  })
  requiresEmailVerification: boolean;
}

export class ProfileUserDataDto {
  @ApiProperty({
    description: 'Уникальный идентификатор пользователя',
    example: 'clh7x9z1v0000pv8f2q8z8z1v',
  })
  id: string;

  @ApiProperty({
    description: 'Email адрес пользователя',
    example: 'user@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'Имя пользователя',
    example: 'john_doe',
  })
  username: string;

  @ApiProperty({
    description: 'Полное имя пользователя',
    example: 'John Doe',
    required: false,
  })
  fullName?: string;

  @ApiProperty({
    description: 'URL аватара пользователя',
    example: 'https://cdn.example.com/avatars/user.jpg',
    required: false,
  })
  avatarUrl?: string;

  @ApiProperty({
    description: 'Роль пользователя',
    example: { name: 'user', permissions: [] },
    required: false,
  })
  role?: any;

  @ApiProperty({
    description: 'Статус верификации email',
    example: true,
  })
  emailVerified: boolean;

  @ApiProperty({
    description: 'Включена ли двухфакторная аутентификация',
    example: false,
  })
  twoFactorEnabled: boolean;

  @ApiProperty({
    description: 'Время последнего входа',
    example: '2025-06-13T10:00:00.000Z',
    required: false,
  })
  lastLoginAt?: Date;

  @ApiProperty({
    description: 'Дата создания аккаунта',
    example: '2025-06-13T10:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Дата последнего обновления',
    example: '2025-06-13T10:00:00.000Z',
  })
  updatedAt: Date;
}

export class AuthProfileResponseDto {
  @ApiProperty({
    description: 'Данные профиля пользователя',
    type: ProfileUserDataDto,
  })
  user: ProfileUserDataDto;
}

export class LogoutResponseDto {
  @ApiProperty({
    description: 'Сообщение о результате выхода',
    example: 'User logged out successfully',
  })
  message: string;
}
