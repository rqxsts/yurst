import { fileURLToPath } from 'node:url';

// Keep unit tests independent from the developer's real .env file.
for (const key of [
  'MODE',
  'YURST',
  'YURST_LOG',
  'LOG_FILE',
  'WS_IDLE_MS',
  'WS_MAX_FAILS',
  'MAX_TEXT',
  'API_TIMEOUT_MS',
  'POLL_TIMEOUT_S',
]) {
  delete process.env[key];
}

process.env.TOKEN = 'b.test_token';
process.env.YURST_ENV_FILE = fileURLToPath(
  new URL('./fixtures/test.env', import.meta.url),
);
