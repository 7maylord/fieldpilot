import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { configSummary, loadConfig, loadLocalEnv } from '../config/app.config';
import { OutboxPublisher } from '../queue/outbox-publisher.service';

async function bootstrap() {
  loadLocalEnv();
  const config = loadConfig();
  console.info('Configuration loaded', configSummary(config));
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  app.get(OutboxPublisher).start();
}

void bootstrap();
