import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

void (async function (): Promise<void> {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log'],
      bufferLogs: true,
    });

    const API_PREFIX = 'api/v1';
    const DEFAULT_PORT = 3000;
    const HSTS_MAX_AGE = 31536000; // 1 year in seconds

    app.setGlobalPrefix(API_PREFIX);
    app.enableCors({
      origin: process.env.CORS_ORIGIN || true,
      credentials: true,
    });

    app.use(
      helmet({
        hsts: { maxAge: HSTS_MAX_AGE },
        contentSecurityPolicy: true,
      }),
    );

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    const port = parseInt(process.env.PORT || '') || DEFAULT_PORT;

    await app.listen(port);
    logger.log(`Server running on http://localhost:${port}`);
  } catch (error) {
    logger.error('Bootstrap failed', error);
    process.exit(1);
  }
})();
