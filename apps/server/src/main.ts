import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.setGlobalPrefix('api/v1');
  app.enableCors();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  app.use(helmet({ hsts: { maxAge: 31536000 } }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`Server is running on http://localhost:${port}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  // Cast error to any for Logger.error; you can also enhance error typing here.
  Logger.error('Error during bootstrap', error as any);
});
