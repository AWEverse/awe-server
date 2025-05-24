import { Request } from 'express';
import { JwtFromRequestFunction } from 'passport-jwt';
import { Strategy } from 'passport-strategy';
import {
  createClient,
  SupabaseClient,
  SupabaseClientOptions,
  AuthUser,
} from '@supabase/supabase-js';

const UNAUTHORIZED = 'Unauthorized';
const SUPABASE_AUTH = 'SUPABASE_AUTH';

export interface SupabaseAuthStrategyOptions {
  supabaseUrl: string;
  supabaseKey: string;
  supabaseOptions?: SupabaseClientOptions<'public'>;
  extractor: JwtFromRequestFunction;
}

export class SupabaseAuthStrategy extends Strategy {
  readonly name = SUPABASE_AUTH;
  private supabase: SupabaseClient;
  private extractor: JwtFromRequestFunction;

  constructor(options: SupabaseAuthStrategyOptions) {
    super();

    if (typeof options.extractor !== 'function') {
      throw new Error(
        'Extractor is not a function. You should provide a valid extractor for Supabase.',
      );
    }
    this.supabase = createClient(
      options.supabaseUrl,
      options.supabaseKey,
      options.supabaseOptions || {},
    );

    this.extractor = options.extractor;
  }

  validate(user: AuthUser | null): AuthUser | null {
    if (user) {
      this.success(user, {});
      return user;
    }
    this.fail(UNAUTHORIZED, 401);
    return null;
  }

  async authenticate(req: Request): Promise<void> {
    try {
      const idToken = this.extractor(req);
      if (!idToken) {
        this.fail(UNAUTHORIZED, 401);
        return;
      }
      const { data, error } = await this.supabase.auth.getUser(String(idToken));
      if (error || !data?.user) {
        const errorMessage =
          error &&
          typeof error === 'object' &&
          'message' in error &&
          typeof (error as { message?: unknown }).message === 'string'
            ? (error as { message: string }).message
            : error
              ? JSON.stringify(error)
              : UNAUTHORIZED;
        this.fail(errorMessage, 401);
        return;
      }
      this.validate(data.user);
    } catch (err) {
      let message = UNAUTHORIZED;
      if (
        err &&
        typeof err === 'object' &&
        'message' in err &&
        typeof (err as { message?: unknown }).message === 'string'
      ) {
        message = (err as { message: string }).message;
      }
      this.fail(message, 401);
    }
  }
}
