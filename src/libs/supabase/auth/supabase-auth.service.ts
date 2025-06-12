import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { createClient, SupabaseClient, AuthError } from '@supabase/supabase-js';
import { AxiosError } from 'axios';
import {
  MFAEnrollResponse,
  MFAVerifyResponse,
  MFAFactorsResponse,
  UserImportResult,
  UserSearchResult,
  PasswordStrengthResult,
  SessionStats,
  AuthNotificationSettings,
  MagicLinkResponse,
  SignInWithMFAResponse,
  AdminUserUpdate,
  UserImportData,
} from './types';

@Injectable()
export class SupabaseAuthService {
  private readonly client: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      const missing: string[] = [];
      if (!supabaseUrl) missing.push('SUPABASE_URL');
      if (!supabaseKey) missing.push('SUPABASE_KEY');
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
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

  async resetPasswordForEmail(email: string, redirectTo?: string) {
    try {
      const { data, error } = await this.client.auth.resetPasswordForEmail(email, {
        redirectTo: redirectTo || `${process.env.FRONTEND_URL}/auth/reset-password`,
      });
      if (error) throw error;
      return { message: 'Password reset email sent successfully' };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to send password reset email');
      return undefined;
    }
  }

  async updatePassword(accessToken: string, newPassword: string) {
    try {
      // Set the session with the access token
      await this.client.auth.setSession({
        access_token: accessToken,
        refresh_token: '',
      });

      const { data, error } = await this.client.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      return { user: data.user, message: 'Password updated successfully' };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to update password');
      return undefined;
    }
  }

  async verifyOtp(email: string, token: string, type: 'signup' | 'recovery' | 'email_change') {
    try {
      const { data, error } = await this.client.auth.verifyOtp({
        email,
        token,
        type,
      });
      if (error) throw error;
      return { user: data.user, session: data.session };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Invalid or expired token');
      return undefined;
    }
  }

  async resendConfirmation(email: string) {
    try {
      const { data, error } = await this.client.auth.resend({
        type: 'signup',
        email,
      });
      if (error) throw error;
      return { message: 'Confirmation email sent successfully' };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to resend confirmation email');
      return undefined;
    }
  }

  // ===== ПРОДВИНУТЫЕ МЕТОДЫ АВТОРИЗАЦИИ =====

  /**
   * Выход из всех устройств/сессий пользователя
   */
  async signOutEverywhere(jwt: string) {
    try {
      await this.client.auth.setSession({ access_token: jwt, refresh_token: '' });
      const { error } = await this.client.auth.signOut({ scope: 'global' });
      if (error) throw error;
      return { message: 'Signed out from all devices successfully' };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to sign out from all devices');
      return undefined;
    }
  }

  /**
   * Многофакторная аутентификация - включение
   */
  async enableMFA(jwt: string): Promise<MFAEnrollResponse | undefined> {
    try {
      await this.client.auth.setSession({ access_token: jwt, refresh_token: '' });
      const { data, error } = await this.client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'TOTP Authenticator',
      });
      if (error) throw error;
      return {
        id: data.id,
        type: data.type,
        qr_code: data.totp?.qr_code,
        secret: data.totp?.secret,
        uri: data.totp?.uri,
      };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to enable MFA');
      return undefined;
    }
  }

  /**
   * Верификация MFA и завершение настройки
   */
  async verifyMFA(
    jwt: string,
    factorId: string,
    code: string,
  ): Promise<MFAVerifyResponse | undefined> {
    try {
      await this.client.auth.setSession({ access_token: jwt, refresh_token: '' });
      const { data, error } = await this.client.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });
      if (error) throw error;
      return {
        user: data.user,
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
      };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Invalid MFA code');
      return undefined;
    }
  }

  /**
   * Получение списка MFA факторов
   */
  async getMFAFactors(jwt: string): Promise<MFAFactorsResponse | undefined> {
    try {
      await this.client.auth.setSession({ access_token: jwt, refresh_token: '' });
      const { data, error } = await this.client.auth.mfa.listFactors();
      if (error) throw error;
      // Map factors to expected MFAFactorsResponse shape
      return {
        all: data.all.map(factor => ({
          id: factor.id,
          type: factor.factor_type, // ensure 'type' is present
          status: factor.status,
          friendly_name: factor.friendly_name,
          created_at: factor.created_at,
          updated_at: factor.updated_at,
        })),
        totp:
          data.totp?.map(factor => ({
            id: factor.id,
            type: factor.factor_type,
            status: factor.status,
            friendly_name: factor.friendly_name,
            created_at: factor.created_at,
            updated_at: factor.updated_at,
          })) || [],
        phone:
          data.phone?.map(factor => ({
            id: factor.id,
            type: factor.factor_type,
            status: factor.status,
            friendly_name: factor.friendly_name,
            created_at: factor.created_at,
            updated_at: factor.updated_at,
          })) || [],
      };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to get MFA factors');
      return undefined;
    }
  }

  /**
   * Удаление MFA фактора
   */
  async removeMFAFactor(jwt: string, factorId: string) {
    try {
      await this.client.auth.setSession({ access_token: jwt, refresh_token: '' });
      const { data, error } = await this.client.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      return { message: 'MFA factor removed successfully' };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to remove MFA factor');
      return undefined;
    }
  }

  /**
   * Вход с MFA кодом
   */
  async signInWithMFA(
    email: string,
    password: string,
    mfaCode?: string,
  ): Promise<SignInWithMFAResponse | undefined> {
    try {
      const { data, error } = await this.client.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Если требуется MFA
      if (data.session === null && data.user === null) {
        if (!mfaCode) {
          return { needsMFA: true, message: 'MFA code required' };
        }

        // Получаем все факторы пользователя
        const { data: factorsData, error: factorsError } = await this.client.auth.mfa.listFactors();
        if (factorsError) throw factorsError;

        if (!factorsData || factorsData.all.length === 0) {
          throw new Error('No MFA factors found for user');
        }

        // Получаем challenge для MFA
        const { data: challengeData, error: challengeError } = await this.client.auth.mfa.challenge(
          {
            factorId: factorsData.all[0].id,
          },
        );
        if (challengeError) throw challengeError;

        // Верифицируем MFA код
        const { data: verifyData, error: verifyError } = await this.client.auth.mfa.verify({
          factorId: factorsData.all[0].id,
          challengeId: challengeData.id,
          code: mfaCode,
        });
        if (verifyError) throw verifyError;

        return {
          user: verifyData.user,
          access_token: verifyData.access_token,
          refresh_token: verifyData.refresh_token,
          expires_in: verifyData.expires_in,
        };
      }

      return { user: data.user, session: data.session };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Invalid credentials or MFA code');
      return undefined;
    }
  }

  /**
   * Импорт пользователей (админская функция)
   */
  async importUsers(users: UserImportData[]): Promise<UserImportResult[] | undefined> {
    try {
      const results: UserImportResult[] = [];
      for (const user of users) {
        const { data, error } = await this.client.auth.admin.createUser({
          email: user.email,
          password: user.password,
          user_metadata: user.user_metadata,
          email_confirm: true,
        });
        results.push({
          email: user.email,
          success: !error,
          error: error?.message,
        });
      }
      return results;
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to import users');
      return undefined;
    }
  }

  /**
   * Получение всех пользователей (админская функция)
   */
  async getAllUsers(page = 1, perPage = 50) {
    try {
      const { data, error } = await this.client.auth.admin.listUsers({
        page,
        perPage,
      });
      if (error) throw error;
      return data;
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to get users');
      return undefined;
    }
  }

  /**
   * Поиск пользователей по email (админская функция)
   */
  async searchUsersByEmail(email: string): Promise<UserSearchResult | undefined> {
    try {
      const { data, error } = await this.client.auth.admin.listUsers();
      if (error) throw error;

      const filteredUsers = data.users.filter(user =>
        user.email?.toLowerCase().includes(email.toLowerCase()),
      );

      return { users: filteredUsers, total: filteredUsers.length };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to search users');
      return undefined;
    }
  }

  /**
   * Удаление пользователя (админская функция)
   */
  async deleteUser(userId: string) {
    try {
      const { data, error } = await this.client.auth.admin.deleteUser(userId);
      if (error) throw error;
      return { message: 'User deleted successfully' };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to delete user');
      return undefined;
    }
  }

  /**
   * Принудительное обновление пользователя (админская функция)
   */
  async adminUpdateUser(userId: string, updates: AdminUserUpdate) {
    try {
      const { data, error } = await this.client.auth.admin.updateUserById(userId, updates);
      if (error) throw error;
      return { user: data.user, message: 'User updated successfully' };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to update user');
      return undefined;
    }
  }

  /**
   * Генерация ссылки для входа по email (Magic Link)
   */
  async generateMagicLink(email: string, redirectTo?: string) {
    try {
      const { data, error } = await this.client.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: {
          redirectTo: redirectTo || `${process.env.FRONTEND_URL}/auth/callback`,
        },
      });
      if (error) throw error;
      return {
        action_link: data.properties?.action_link,
        email_otp: data.properties?.email_otp,
        hashed_token: data.properties?.hashed_token,
      };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to generate magic link');
      return undefined;
    }
  }

  /**
   * Вход через Magic Link
   */
  async signInWithMagicLink(email: string, redirectTo?: string) {
    try {
      const { data, error } = await this.client.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo || `${process.env.FRONTEND_URL}/auth/callback`,
        },
      });
      if (error) throw error;
      return { message: 'Magic link sent to email' };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to send magic link');
      return undefined;
    }
  }

  /**
   * Вход через телефон (SMS OTP)
   */
  async signInWithPhone(phone: string) {
    try {
      const { data, error } = await this.client.auth.signInWithOtp({
        phone,
      });
      if (error) throw error;
      return { message: 'SMS OTP sent to phone' };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to send SMS OTP');
      return undefined;
    }
  }

  /**
   * Верификация телефонного OTP
   */
  async verifyPhoneOtp(phone: string, token: string) {
    try {
      const { data, error } = await this.client.auth.verifyOtp({
        phone,
        token,
        type: 'sms',
      });
      if (error) throw error;
      return { user: data.user, session: data.session };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Invalid or expired SMS code');
      return undefined;
    }
  }

  /**
   * Обновление пользовательских метаданных
   */
  async updateUserMetadata(jwt: string, metadata: any) {
    try {
      await this.client.auth.setSession({ access_token: jwt, refresh_token: '' });
      const { data, error } = await this.client.auth.updateUser({
        data: metadata,
      });
      if (error) throw error;
      return { user: data.user, message: 'Metadata updated successfully' };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to update metadata');
      return undefined;
    }
  }

  /**
   * Обновление email пользователя
   */
  async updateUserEmail(jwt: string, newEmail: string) {
    try {
      await this.client.auth.setSession({ access_token: jwt, refresh_token: '' });
      const { data, error } = await this.client.auth.updateUser({
        email: newEmail,
      });
      if (error) throw error;
      return {
        user: data.user,
        message: 'Email update initiated, check your new email for confirmation',
      };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to update email');
      return undefined;
    }
  }

  /**
   * Обновление телефона пользователя
   */
  async updateUserPhone(jwt: string, newPhone: string) {
    try {
      await this.client.auth.setSession({ access_token: jwt, refresh_token: '' });
      const { data, error } = await this.client.auth.updateUser({
        phone: newPhone,
      });
      if (error) throw error;
      return {
        user: data.user,
        message: 'Phone update initiated, check your phone for confirmation',
      };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to update phone');
      return undefined;
    }
  }

  /**
   * Проверка силы пароля
   */
  validatePasswordStrength(password: string): {
    isValid: boolean;
    score: number;
    suggestions: string[];
  } {
    const suggestions: string[] = [];
    let score = 0;

    // Минимальная длина
    if (password.length >= 8) {
      score += 1;
    } else {
      suggestions.push('Password should be at least 8 characters long');
    }

    // Содержит цифры
    if (/\d/.test(password)) {
      score += 1;
    } else {
      suggestions.push('Password should contain at least one number');
    }

    // Содержит строчные буквы
    if (/[a-z]/.test(password)) {
      score += 1;
    } else {
      suggestions.push('Password should contain at least one lowercase letter');
    }

    // Содержит заглавные буквы
    if (/[A-Z]/.test(password)) {
      score += 1;
    } else {
      suggestions.push('Password should contain at least one uppercase letter');
    }

    // Содержит специальные символы
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      score += 1;
    } else {
      suggestions.push('Password should contain at least one special character');
    }

    // Не содержит последовательности
    if (!/123|abc|qwe|password|admin/i.test(password)) {
      score += 1;
    } else {
      suggestions.push('Password should not contain common sequences or words');
    }

    return {
      isValid: score >= 4,
      score,
      suggestions,
    };
  }

  /**
   * Получение статистики сессий пользователя
   */
  async getSessionStats(jwt: string) {
    try {
      await this.client.auth.setSession({ access_token: jwt, refresh_token: '' });
      const { data: user, error } = await this.client.auth.getUser();
      if (error) throw error;

      return {
        user_id: user.user.id,
        last_sign_in_at: user.user.last_sign_in_at,
        created_at: user.user.created_at,
        email_confirmed_at: user.user.email_confirmed_at,
        phone_confirmed_at: user.user.phone_confirmed_at,
        mfa_enabled: user.user.factors && user.user.factors.length > 0,
        factors_count: user.user.factors?.length || 0,
      };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to get session stats');
      return undefined;
    }
  }

  /**
   * Настройка уведомлений для аутентификации
   */
  async configureAuthNotifications(
    jwt: string,
    settings: {
      emailOnSignIn?: boolean;
      emailOnPasswordChange?: boolean;
      emailOnMFAEnabled?: boolean;
      emailOnSuspiciousActivity?: boolean;
    },
  ) {
    try {
      await this.client.auth.setSession({ access_token: jwt, refresh_token: '' });

      // Сохраняем настройки в пользовательских метаданных
      const { data, error } = await this.client.auth.updateUser({
        data: {
          auth_notifications: settings,
          updated_at: new Date().toISOString(),
        },
      });

      if (error) throw error;
      return {
        user: data.user,
        message: 'Authentication notifications configured successfully',
      };
    } catch (error) {
      this.handleAuthError(error as AuthError, 'Failed to configure notifications');
      return undefined;
    }
  }
}
