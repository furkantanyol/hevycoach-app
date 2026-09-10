import { existsSync } from 'node:fs';
import { buildApp } from './routes.js';

const ENV_FILE = '.env';
const DEFAULT_PORT = 3001;
const FAILURE = 1;

if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

const port = Number(process.env.PORT) || DEFAULT_PORT;
const app = buildApp();

try {
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`hevycoach server listening on port ${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(FAILURE);
}
