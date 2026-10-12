import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule, ObserveInstrument } from '@/app.module';
import { getAppConfig } from '@/config/configuration';
import { setupSwagger } from '@/swagger';

export const API_PREFIX = 'api';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Existing observability integration - preserved.
    instrument: ObserveInstrument,
  });

  const configService = app.get(ConfigService);
  const config = getAppConfig(configService);

  // Only reachable as an unprefixed route when trust proxy is deliberately off.
  app.set('trust proxy', true);

  app.setGlobalPrefix(API_PREFIX);

  app.use(
    helmet({
      // The API serves JSON, not HTML, so a restrictive CSP is safe here.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"] } },
      // Swagger UI needs inline styles/scripts, so its own CSP is relaxed by the
      // UI's own middleware; this policy targets API responses.
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Allow all origins directly in code
  app.enableCors({
    origin: (_origin, callback) => {
      // Allow all origins (*), reflecting caller origin to maintain credentials support
      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id', 'Accept', 'Origin'],
    maxAge: 86400,
  });

  app.enableShutdownHooks();

  const swagger = setupSwagger(app, config);

  const port = config.port;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`MoneyTear API listening on http://localhost:${port}/${API_PREFIX}`);
  if (swagger.ui) {
    logger.log(`Swagger UI:      http://localhost:${port}${swagger.ui}`);
    logger.log(`OpenAPI JSON:    http://localhost:${port}${swagger.json}`);
  }
}

await bootstrap();
