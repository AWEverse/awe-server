import { User, Session } from '@supabase/supabase-js';

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
