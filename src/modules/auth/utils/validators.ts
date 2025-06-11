import { AUTH_CONSTANTS } from '../constants/auth.constants';

export class PasswordValidator {
  /**
   * Validate password strength
   */
  static validate(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Length check
    if (password.length < AUTH_CONSTANTS.PASSWORD.MIN_LENGTH) {
      errors.push(
        `Password must be at least ${AUTH_CONSTANTS.PASSWORD.MIN_LENGTH} characters long`,
      );
    }

    if (password.length > AUTH_CONSTANTS.PASSWORD.MAX_LENGTH) {
      errors.push(`Password cannot exceed ${AUTH_CONSTANTS.PASSWORD.MAX_LENGTH} characters`);
    }

    // Character requirements
    if (AUTH_CONSTANTS.PASSWORD.REQUIRE_LOWERCASE && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (AUTH_CONSTANTS.PASSWORD.REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (AUTH_CONSTANTS.PASSWORD.REQUIRE_NUMBERS && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (AUTH_CONSTANTS.PASSWORD.REQUIRE_SPECIAL_CHARS) {
      const specialChars = AUTH_CONSTANTS.PASSWORD.SPECIAL_CHARS;
      const specialRegex = new RegExp(`[${specialChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]`);
      if (!specialRegex.test(password)) {
        errors.push(`Password must contain at least one special character (${specialChars})`);
      }
    }

    // Common password patterns
    const commonPatterns = [
      /(.)\1{2,}/, // Repeated characters (3 or more)
      /123456789|987654321/, // Sequential numbers
      /abcdefg|qwerty|password|admin/i, // Common words
    ];

    for (const pattern of commonPatterns) {
      if (pattern.test(password)) {
        errors.push('Password contains common patterns and is not secure');
        break;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Calculate password strength score (0-100)
   */
  static calculateStrength(password: string): number {
    let score = 0;

    // Length bonus
    score += Math.min(password.length * 2, 25);

    // Character variety bonus
    if (/[a-z]/.test(password)) score += 5;
    if (/[A-Z]/.test(password)) score += 5;
    if (/\d/.test(password)) score += 5;
    if (/[^a-zA-Z0-9]/.test(password)) score += 10;

    // Additional complexity bonus
    if (password.length >= 12) score += 10;
    if (/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9])/.test(password)) score += 15;

    // Penalty for common patterns
    const commonPatterns = [
      /(.)\1{2,}/, // Repeated characters
      /123456789|987654321/, // Sequential
      /password|admin|user|test/i, // Common words
    ];

    for (const pattern of commonPatterns) {
      if (pattern.test(password)) {
        score -= 15;
        break;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get password strength description
   */
  static getStrengthDescription(score: number): string {
    if (score < 30) return 'Very Weak';
    if (score < 50) return 'Weak';
    if (score < 70) return 'Fair';
    if (score < 85) return 'Good';
    return 'Strong';
  }
}

export class UsernameValidator {
  /**
   * Validate username
   */
  static validate(username: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Length check
    if (username.length < AUTH_CONSTANTS.USERNAME.MIN_LENGTH) {
      errors.push(
        `Username must be at least ${AUTH_CONSTANTS.USERNAME.MIN_LENGTH} characters long`,
      );
    }

    if (username.length > AUTH_CONSTANTS.USERNAME.MAX_LENGTH) {
      errors.push(`Username cannot exceed ${AUTH_CONSTANTS.USERNAME.MAX_LENGTH} characters`);
    }

    // Pattern check
    if (!AUTH_CONSTANTS.USERNAME.ALLOWED_PATTERN.test(username)) {
      errors.push('Username can only contain letters, numbers, and underscores');
    }

    // Reserved usernames
    const reservedUsernames = [
      'admin',
      'administrator',
      'root',
      'system',
      'api',
      'www',
      'mail',
      'ftp',
      'support',
      'help',
      'info',
      'news',
      'blog',
      'forum',
      'chat',
      'user',
      'test',
      'demo',
      'guest',
      'null',
      'undefined',
      'delete',
      'remove',
      'moderator',
      'mod',
      'staff',
      'team',
      'official',
      'service',
    ];

    if (reservedUsernames.includes(username.toLowerCase())) {
      errors.push('This username is reserved and cannot be used');
    }

    // No leading/trailing underscores
    if (username.startsWith('_') || username.endsWith('_')) {
      errors.push('Username cannot start or end with underscore');
    }

    // No consecutive underscores
    if (/__/.test(username)) {
      errors.push('Username cannot contain consecutive underscores');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Suggest alternative usernames
   */
  static suggestAlternatives(username: string): string[] {
    const suggestions: string[] = [];
    const baseUsername = username.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Add numbers
    for (let i = 1; i <= 5; i++) {
      suggestions.push(`${baseUsername}${i}`);
      suggestions.push(`${baseUsername}${Math.floor(Math.random() * 1000)}`);
    }

    // Add prefixes/suffixes
    const prefixes = ['the', 'real', 'true', 'new'];
    const suffixes = ['user', 'pro', 'x', 'official'];

    prefixes.forEach(prefix => {
      suggestions.push(`${prefix}${baseUsername}`);
    });

    suffixes.forEach(suffix => {
      suggestions.push(`${baseUsername}${suffix}`);
    });

    // Remove duplicates and filter by length
    return [...new Set(suggestions)]
      .filter(
        suggestion =>
          suggestion.length >= AUTH_CONSTANTS.USERNAME.MIN_LENGTH &&
          suggestion.length <= AUTH_CONSTANTS.USERNAME.MAX_LENGTH,
      )
      .slice(0, 10);
  }
}

export class EmailValidator {
  /**
   * Validate email format
   */
  static validate(email: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Basic format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push('Invalid email format');
      return { isValid: false, errors };
    }

    // Length check
    if (email.length > 320) {
      // RFC 5321 limit
      errors.push('Email address is too long');
    }

    // Local part checks
    const [localPart, domain] = email.split('@');

    if (localPart.length > 64) {
      errors.push('Email local part is too long');
    }

    if (localPart.startsWith('.') || localPart.endsWith('.')) {
      errors.push('Email local part cannot start or end with a period');
    }

    if (localPart.includes('..')) {
      errors.push('Email local part cannot contain consecutive periods');
    }

    // Domain checks
    if (domain.length > 253) {
      errors.push('Email domain is too long');
    }

    // Disposable email check (basic)
    const disposableDomains = [
      '10minutemail.com',
      'tempmail.org',
      'guerrillamail.com',
      'mailinator.com',
      'throwaway.email',
      'temp-mail.org',
    ];

    if (disposableDomains.some(disposable => domain.toLowerCase().includes(disposable))) {
      errors.push('Disposable email addresses are not allowed');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Normalize email address
   */
  static normalize(email: string): string {
    return email.toLowerCase().trim();
  }
}

export class SecurityUtils {
  /**
   * Generate secure random string
   */
  static generateSecureToken(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';

    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return result;
  }

  /**
   * Generate secure numeric code
   */
  static generateSecureCode(length: number = 6): string {
    const digits = '0123456789';
    let result = '';

    for (let i = 0; i < length; i++) {
      result += digits.charAt(Math.floor(Math.random() * digits.length));
    }

    return result;
  }

  /**
   * Check if IP is suspicious
   */
  static isSuspiciousIP(ip: string): boolean {
    // Basic checks for suspicious IPs
    const suspiciousPatterns = [
      /^127\./, // Localhost
      /^192\.168\./, // Private network
      /^10\./, // Private network
      /^172\.(1[6-9]|2\d|3[01])\./, // Private network
      /^0\./, // Invalid
    ];

    return suspiciousPatterns.some(pattern => pattern.test(ip));
  }

  /**
   * Sanitize user input
   */
  static sanitizeInput(input: string): string {
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim();
  }

  /**
   * Generate CSRF token
   */
  static generateCSRFToken(): string {
    return this.generateSecureToken(AUTH_CONSTANTS.SECURITY.CSRF_TOKEN_LENGTH);
  }
}
