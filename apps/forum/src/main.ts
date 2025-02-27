import { NestFactory } from '@nestjs/core';
import { ForumModule } from './forum.module';

async function bootstrap() {
  const app = await NestFactory.create(ForumModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
