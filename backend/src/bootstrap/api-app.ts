import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from '../app.module';
import { JsonLogger } from '../common/json-logger';
import { ProblemDetailsFilter } from '../common/problem-details.filter';
import type { AppConfig } from '../config/app.config';

export async function createApiApp(config: AppConfig) {
  const app = await NestFactory.create(AppModule, { logger: new JsonLogger() });
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableCors({ origin: config.frontendUrl, credentials: true });
  app.enableShutdownHooks();
  return app;
}

export function createOpenApiDocument(
  app: Awaited<ReturnType<typeof createApiApp>>,
) {
  const options = new DocumentBuilder()
    .setTitle('FieldPilot API')
    .setVersion('1.0')
    .addCookieAuth('fieldpilot_session')
    .build();
  return SwaggerModule.createDocument(app, options);
}

export function mountOpenApi(app: Awaited<ReturnType<typeof createApiApp>>) {
  SwaggerModule.setup('api/docs', app, createOpenApiDocument(app));
}
