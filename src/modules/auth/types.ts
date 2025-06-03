import { Request } from 'express';

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
