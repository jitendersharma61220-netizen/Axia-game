import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from './config';
import { configureApp } from './setup';

async function bootstrap() {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file: rely on the real environment.
  }
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableCors({ origin: config.webOrigin, credentials: true });
  app.enableShutdownHooks();
  await app.listen(config.port);
}

void bootstrap();
