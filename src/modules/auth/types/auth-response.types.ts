import { User, Session } from '@supabase/supabase-js';

export interface AuthResponse {
  user: User | null;
  session: Session | null;
  message?: string;
}

export interface AuthResult {
  user: any; // Database user
  session: Session | null;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface OAuthResponse {
  provider: string;
  url: string;
  state?: string;
}

export interface RefreshResponse {
  user: User;
  session: Session;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    username: string;
    fullName?: string;
    role?: any;
    emailVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: 'Bearer';
}

export interface RegisterResponse {
  user: {
    id: string;
    email: string;
    username: string;
    fullName?: string;
    emailVerified: boolean;
  };
  message: string;
  requiresEmailVerification: boolean;
}

export interface PasswordResetResponse {
  message: string;
  success: boolean;
}

export interface ProfileResponse {
  id: string;
  email: string;
  username: string;
  fullName?: string;
  avatarUrl?: string;
  role: any;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionInfo {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  deviceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface SessionsResponse {
  sessions: SessionInfo[];
  activeCount: number;
}
