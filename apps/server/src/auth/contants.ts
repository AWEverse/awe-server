export const JWT_REFRESH_EXPIRE_IN = '30d';
export const JWT_ACCESS_EXPIRE_IN = '15m';
export const USER_IN_PROCCESS_ID = -1;

export const AuthRoutes = {
  MODULE: 'auth',
  REGISTER: 'register',
  LOGIN: 'login',
  TWO_FACTOR_VERIFY: 'two-factor/verify',
  TWO_FACTOR_ENABLE: 'two-factor/enable',
  TWO_FACTOR_DISABLE: 'two-factor/disable',
  LOGOUT: 'logout',
  REFRESH_TOKEN: 'refresh',
} as const;
