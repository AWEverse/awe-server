import { Request } from 'express';
import { User, Session } from '@supabase/supabase-js';

export type UserRequest<R = Request> = R & {
  user: {
    id: string;
    sub: string;
    email: string;
    username?: string;
    access_token: string;
    role?: any;
    supabaseUser?: any;
  };
};

export interface AuthResponse {
  user: User | null;
  session: Session | null;
}

export interface AuthResult {
  user: any; // Database user
  session: Session | null;
}

export interface OAuthResponse {
  provider: string;
  url: string;
}

export interface RefreshResponse {
  user: User;
  session: Session;
}
