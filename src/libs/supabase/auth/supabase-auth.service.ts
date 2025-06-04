import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { createClient, SupabaseClient, AuthError } from '@supabase/supabase-js';
import axios, { AxiosError } from 'axios';

@Injectable()
export class SupabaseAuthService {
  private readonly client: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_KEY environment variables');
    }

    this.client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: false,
      },
    });
  }

  private handleAuthError(error: AuthError | AxiosError | Error, defaultMessage: string) {
    if (error instanceof AxiosError) {
      throw new UnauthorizedException(error.response?.data?.message || defaultMessage);
    }
    throw error instanceof AuthError
      ? new UnauthorizedException(error.message)
      : new BadRequestException(error.message || defaultMessage);
  }

  async signUp(email: string, password: string) {
    try {
      const { data, error } = await this.client.auth.signUp({ email, password });
      if (error) throw error;
      return { user: data.user, session: data.session };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to register user');
      return undefined;
    }
  }

  async signIn(email: string, password: string) {
    try {
      const { data, error } = await this.client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { user: data.user, session: data.session };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Invalid credentials');
      return undefined;
    }
  }

  async signInWithOAuth(provider: 'google' | 'twitter') {
    try {
      const { data, error } = await this.client.auth.signInWithOAuth({
        provider,
      });
      if (error) throw error;
      return { provider: data.provider, url: data.url };
    } catch (error) {
      this.handleAuthError(error as AuthError, `Failed to sign in with ${provider}`);
      return undefined;
    }
  }

  async signOut(jwt: string) {
    try {
      // Set the session manually and then sign out
      await this.client.auth.setSession({ access_token: jwt, refresh_token: '' });
      const { error } = await this.client.auth.signOut();
      if (error) throw error;
      return { message: 'Signed out successfully' };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to sign out');
      return undefined;
    }
  }

  async getUser(jwt: string) {
    try {
      const { data, error } = await this.client.auth.getUser(jwt);
      if (error) throw error;
      return data.user;
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Invalid token');
      return null;
    }
  }

  async refreshSession(refresh_token: string) {
    try {
      const { data, error } = await this.client.auth.refreshSession({ refresh_token });
      if (error) throw error;
      return { user: data.user, session: data.session };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to refresh session');
      return undefined;
    }
  }
}
