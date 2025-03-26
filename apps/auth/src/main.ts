import { AuthModule } from './auth.module';
import { runBootstrap } from '@awe/common';

runBootstrap(AuthModule, {
  port: parseInt(process.env.AUTH_PORT || '3000', 10),
  globalPrefix: '/auth',
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
