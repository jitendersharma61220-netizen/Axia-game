import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/** Shared by main.ts and the e2e tests so both run the same pipeline. */
export function configureApp(app: INestApplication) {
  // Requests arrive via Caddy → Next.js → API; trust X-Forwarded-For for client IPs.
  // The API is never exposed directly in production (see deploy/docker-compose.prod.yml).
  app.getHttpAdapter().getInstance().set('trust proxy', true);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
}
