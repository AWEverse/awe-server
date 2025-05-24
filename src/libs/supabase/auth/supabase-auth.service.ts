import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import axios from 'axios';

@Injectable()
export class SupabaseAuthService {
  private client: SupabaseClient;

  constructor() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_KEY must be defined in environment variables');
    }
    this.client = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_KEY as string,
    );
  }

  async signUp(email: string, password: string) {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw new UnauthorizedException(error.message);
    return data;
  }

  async signOut(jwt: string) {
    try {
      await axios.post(
        `${process.env.SUPABASE_URL}/auth/v1/logout`,
        {},
        {
          headers: {
            apiKey: process.env.SUPABASE_KEY,
            Authorization: `Bearer ${jwt}`,
          },
        },
      );
      return { message: 'Signed out successfully' };
    } catch (error) {
      throw new UnauthorizedException('Failed to sign out');
    }
  }

  async getUser(jwt: string) {
    const { data, error } = await this.client.auth.getUser(jwt);
    if (error) throw new UnauthorizedException(error.message);
    return data.user;
  }
}
