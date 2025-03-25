import { AuthModule } from './auth.module';
import { runBootstrap } from '@awe/common';

runBootstrap(AuthModule, {
  port: 3000,
  swaggerEnabled: false,
  beforeStart: (app) => {
    console.log('Auth app initializing...', app);
  },
});
