import { AuthModule } from './auth.module';
import { runBootstrap } from '@awe/common';

const isProduction = process.env.NODE_ENV === 'production';

runBootstrap(AuthModule, {
  port: parseInt(process.env.AUTH_PORT || '3000', 10),
  swaggerEnabled: !isProduction,
  globalPrefix: '/api',
  logger: true,
  beforeStart: (app) => {
    console.log('Auth app initializing...', app);
  },
});
