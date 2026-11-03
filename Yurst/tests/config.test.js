import './setup.js';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { BASE_URL, CFG, DEV, TOKEN, has, jitter, sleep } from '../src/config.js';

const configUrl = new URL('../src/config.js', import.meta.url).href;
const emptyEnv = fileURLToPath(new URL('./fixtures/empty.env', import.meta.url));

const ENV_KEYS = [
  'TOKEN',
  'MODE',
  'YURST',
  'YURST_LOG',
  'LOG_FILE',
  'WS_IDLE_MS',
  'WS_MAX_FAILS',
  'MAX_TEXT',
  'API_TIMEOUT_MS',
  'POLL_TIMEOUT_S',
  'YURST_ENV_FILE',
];

function cleanEnv(overrides = {}) {
  const env = { ...process.env };
  for (const key of ENV_KEYS) delete env[key];
  return { ...env, ...overrides };
}

function runConfig({ env = {}, cwd = process.cwd() } = {}) {
  const code = `
    const m = await import(${JSON.stringify(configUrl)});
    console.log(JSON.stringify({
      token: m.TOKEN,
      dev: m.DEV,
      mode: m.CFG.mode,
      logFile: m.CFG.logFile ?? null,
      wsIdleMs: m.CFG.wsIdleMs,
      wsMaxFails: m.CFG.wsMaxFails,
      maxText: m.CFG.maxText,
      apiTimeoutMs: m.CFG.apiTimeoutMs,
      pollTimeoutS: m.CFG.pollTimeoutS,
      frozen: Object.isFrozen(m.CFG),
    }));
  `;

  return spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd,
    env: cleanEnv(env),
    encoding: 'utf8',
  });
}

function parseConfig(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test('the test environment uses the checked-in token fixture', () => {
  assert.equal(TOKEN, 'b.test_token');
  assert.equal(DEV, false);
  assert.equal(BASE_URL, 'https://api.yurba.one');
});

test('CFG exposes the documented defaults and is frozen', () => {
  const result = runConfig({ env: { YURST_ENV_FILE: emptyEnv, TOKEN: 'b.test_token' } });

  assert.deepEqual(parseConfig(result), {
    token: 'b.test_token',
    dev: false,
    mode: 'ws',
    logFile: null,
    wsIdleMs: 0,
    wsMaxFails: 5,
    maxText: 4000,
    apiTimeoutMs: 10000,
    pollTimeoutS: 30,
    frozen: true,
  });
});

test('environment variables override every CFG field', () => {
  const result = runConfig({
    env: {
      YURST_ENV_FILE: emptyEnv,
      TOKEN: 'b.override',
      MODE: 'POLL',
      YURST: 'dev',
      LOG_FILE: '/tmp/yurst-test.log',
      WS_IDLE_MS: '1234',
      WS_MAX_FAILS: '2',
      MAX_TEXT: '99',
      API_TIMEOUT_MS: '500',
      POLL_TIMEOUT_S: '7',
    },
  });

  assert.deepEqual(parseConfig(result), {
    token: 'b.override',
    dev: true,
    mode: 'poll',
    logFile: '/tmp/yurst-test.log',
    wsIdleMs: 1234,
    wsMaxFails: 2,
    maxText: 99,
    apiTimeoutMs: 500,
    pollTimeoutS: 7,
    frozen: true,
  });
});

test('invalid numeric values fall back to defaults', () => {
  const result = runConfig({
    env: {
      YURST_ENV_FILE: emptyEnv,
      TOKEN: 'b.test_token',
      WS_IDLE_MS: 'not-a-number',
      WS_MAX_FAILS: 'NaN',
      MAX_TEXT: 'Infinity',
      API_TIMEOUT_MS: '',
      POLL_TIMEOUT_S: 'undefined',
    },
  });

  const parsed = parseConfig(result);
  assert.equal(parsed.wsIdleMs, 0);
  assert.equal(parsed.wsMaxFails, 5);
  assert.equal(parsed.maxText, 4000);
  assert.equal(parsed.apiTimeoutMs, 10000);
  assert.equal(parsed.pollTimeoutS, 30);
});

test('YURST_ENV_FILE takes priority over a .env file in the working directory', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yurst-config-'));
  const fromFile = join(directory, 'from-file.env');
  const fromCwd = join(directory, '.env');

  try {
    writeFileSync(fromFile, 'TOKEN=b.file_token\nMAX_TEXT=111\n');
    writeFileSync(fromCwd, 'TOKEN=b.cwd_token\nMAX_TEXT=222\n');

    const result = runConfig({
      cwd: directory,
      env: { YURST_ENV_FILE: fromFile },
    });

    const parsed = parseConfig(result);
    assert.equal(parsed.token, 'b.file_token');
    assert.equal(parsed.maxText, 111);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the working directory .env is used when YURST_ENV_FILE is not set', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yurst-config-'));
  const fromCwd = join(directory, '.env');

  try {
    writeFileSync(fromCwd, 'TOKEN=b.cwd_token\nMAX_TEXT=222\n');

    const result = runConfig({ cwd: directory });
    const parsed = parseConfig(result);

    assert.equal(parsed.token, 'b.cwd_token');
    assert.equal(parsed.maxText, 222);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('importing config without a token exits with a helpful error', () => {
  const result = runConfig({ env: { YURST_ENV_FILE: emptyEnv } });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Yurst: TOKEN not found/);
});

test('jitter() stays within 0-25% and has() is safe for inherited keys', () => {
  const originalRandom = Math.random;

  try {
    Math.random = () => 0;
    assert.equal(jitter(100), 100);

    Math.random = () => 0.999999;
    assert.equal(jitter(100), 124);
    assert.equal(jitter(0), 0);
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(has({ own: true }, 'own'), true);
  assert.equal(has({}, 'toString'), false);
});

test('sleep() resolves after the requested delay', async () => {
  await sleep(0);
  assert.ok(true);
});
