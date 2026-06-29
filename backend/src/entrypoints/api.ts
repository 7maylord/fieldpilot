import 'reflect-metadata';
import { createApiApp, mountOpenApi } from '../bootstrap/api-app';
import { configSummary, loadConfig, loadLocalEnv } from '../config/app.config';

async function bootstrap() {
  loadLocalEnv();
  const config = loadConfig();
  console.info('Configuration loaded', configSummary(config));
  const app = await createApiApp(config);
  mountOpenApi(app);
  await app.listen(config.port);
}

void bootstrap();
