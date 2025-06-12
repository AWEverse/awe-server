export interface MFAEnrollResponse {
  id: string;
  type: string;
  qr_code?: string;
  secret?: string;
  uri?: string;
}

export interface MFAVerifyResponse {
  user: any;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface MFAFactorsResponse {
  all: Array<{
    id: string;
    type: string;
    status: string;
    friendly_name?: string;
    created_at: string;
    updated_at: string;
  }>;
  totp: Array<{
    id: string;
    type: string;
    status: string;
    friendly_name?: string;
    created_at: string;
    updated_at: string;
  }>;
  phone: Array<{
    id: string;
    type: string;
    status: string;
    friendly_name?: string;
    created_at: string;
    updated_at: string;
  }>;
}

export interface UserImportResult {
  email: string;
  success: boolean;
  error?: string;
}

export interface UserSearchResult {
  users: any[];
  total: number;
}

export interface PasswordStrengthResult {
  isValid: boolean;
  score: number;
  suggestions: string[];
}

export interface SessionStats {
  user_id: string;
  last_sign_in_at?: string;
  created_at: string;
  email_confirmed_at?: string;
  phone_confirmed_at?: string;
  mfa_enabled: boolean;
  factors_count: number;
}

export interface AuthNotificationSettings {
  emailOnSignIn?: boolean;
  emailOnPasswordChange?: boolean;
  emailOnMFAEnabled?: boolean;
  emailOnSuspiciousActivity?: boolean;
}

export interface MagicLinkResponse {
  action_link?: string;
  email_otp?: string;
  hashed_token?: string;
}

export interface SignInWithMFAResponse {
  user?: any;
  session?: any;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  needsMFA?: boolean;
  message?: string;
}

export interface AdminUserUpdate {
  email?: string;
  password?: string;
  user_metadata?: any;
  app_metadata?: any;
  email_confirm?: boolean;
  phone_confirm?: boolean;
  ban_duration?: string;
}

export interface UserImportData {
  email: string;
  password?: string;
  user_metadata?: any;
}

export interface BulkDeleteResult {
  userId: string;
  success: boolean;
  error?: string;
}

export interface AccountStatus {
  user_id: string;
  email?: string;
  is_banned: boolean;
  ban_until?: string;
  ban_reason?: string;
  is_email_confirmed: boolean;
  is_phone_confirmed: boolean;
  has_mfa: boolean;
  last_sign_in?: string;
  created_at: string;
}

export interface UserActionLog {
  action: string;
  details?: any;
  timestamp: string;
  ip_address?: string;
  user_agent?: string;
}

export interface UserActionLogsResponse {
  logs: UserActionLog[];
  total: number;
}

export interface SuspiciousActivityIndicators {
  multiple_failed_logins: boolean;
  rapid_requests: boolean;
  unusual_ip_changes: boolean;
  mfa_disabled_recently: boolean;
}

export interface SuspiciousActivityCheck {
  is_suspicious: boolean;
  indicators: SuspiciousActivityIndicators;
  recent_activity_count: number;
  recommendation: string;
}

export interface ActiveSessionsResponse {
  current_session: {
    user_id: string;
    last_sign_in_at?: string;
    created_at: string;
    updated_at?: string;
  };
  message: string;
}

export interface UserCreationData {
  user_metadata?: any;
  app_metadata?: any;
  email_confirm?: boolean;
  phone_confirm?: boolean;
}
