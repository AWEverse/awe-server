import { NestFactory } from '@nestjs/core';
import { ThreadsModule } from './threads.module';

async function bootstrap() {
  const app = await NestFactory.create(ThreadsModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
