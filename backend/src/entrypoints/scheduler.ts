import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { configSummary, loadConfig, loadLocalEnv } from '../config/app.config';

async function bootstrap() {
  loadLocalEnv();
  const config = loadConfig();
  console.info('Configuration loaded', configSummary(config));
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
}

void bootstrap();
