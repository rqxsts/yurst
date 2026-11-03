/**
 * @file config.js
 * Loads a .env file and exports typed configuration constants.
 * Supports Node 22+ native `process.loadEnvFile` and a manual fallback parser.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Look for .env in the current working directory first. The second path keeps
// `pnpm --filter <example> start` working from a workspace, where the example
// package does not contain its own .env. YURST_ENV_FILE can point elsewhere.
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const envFile = [
  process.env.YURST_ENV_FILE,
  join(process.cwd(), '.env'),
  join(packageRoot, '.env'),
].filter(Boolean).find((candidate) => existsSync(candidate));

(function loadEnv() {
  if (!envFile) return;
  if (typeof process.loadEnvFile === 'function') {
    try { process.loadEnvFile(envFile); } catch { /* unreadable file — ok */ }
    return;
  }
  let raw;
  try { raw = readFileSync(envFile, 'utf8'); } catch { return; }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)$/);
    if (m && !(m[1] in process.env))
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
})();

const env = (k, d) => process.env[k] ?? d;
const num = (k, d) => {
  const raw = env(k);
  if (raw === undefined || String(raw).trim() === '') return d;
  const value = Number(raw);
  return Number.isFinite(value) ? value : d;
};

/** Bot token (`b.xxxx`). Required — process exits if not set. */
export const TOKEN = process.env.TOKEN;
if (!TOKEN) { console.error('Yurst: TOKEN not found. Create .env with TOKEN=b.xxxx'); process.exit(1); }

/**
 * Whether dev mode is enabled (`YURST=dev` in .env).
 * In dev mode: log level defaults to `debug`, extra diagnostics are shown.
 * @type {boolean}
 */
export const DEV = process.env.YURST === 'dev';

/**
 * Frozen runtime configuration object.
 * All values can be overridden via environment variables.
 *
 * @type {Readonly<{
 *   mode:         'ws' | 'poll',
 *   logFile:      string | undefined,
 *   wsIdleMs:     number,
 *   wsMaxFails:   number,
 *   maxText:      number,
 *   apiTimeoutMs: number,
 *   pollTimeoutS: number,
 * }>}
 */
export const CFG = Object.freeze({
  /** Delivery mode: `ws` (WebSocket) or `poll` (long polling). Default: `ws`. */
  mode:         env('MODE', 'ws').toLowerCase(),
  /** Path to log file. If set, logs are appended there in addition to stdout. */
  logFile:      env('LOG_FILE'),
  /** WebSocket idle watchdog timeout in ms. 0 = disabled. */
  wsIdleMs:     num('WS_IDLE_MS',      0),
  /** Number of consecutive failed WS connections before falling back to polling. */
  wsMaxFails:   num('WS_MAX_FAILS',    5),
  /** Maximum length of a single message chunk in characters. */
  maxText:      num('MAX_TEXT',     4000),
  /** HTTP request timeout in ms. */
  apiTimeoutMs: num('API_TIMEOUT_MS',  10_000),
  /** Long polling server-side timeout in seconds. */
  pollTimeoutS: num('POLL_TIMEOUT_S',  30),
});

/** Yurba REST API base URL. */
export const BASE_URL = 'https://api.yurba.one';

/**
 * Returns a Promise that resolves after `ms` milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Adds random jitter (up to 25%) to a delay to avoid thundering herd.
 * @param {number} ms  Base delay in milliseconds.
 * @returns {number}
 */
export const jitter = (ms) => ms + Math.floor(Math.random() * ms * 0.25);

/**
 * Safe `Object.hasOwn` wrapper.
 * @param {object} o
 * @param {string} k
 * @returns {boolean}
 */
export const has = (o, k) => Object.hasOwn(o, k);
