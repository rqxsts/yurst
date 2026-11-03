import './setup.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BASE_URL } from '../src/config.js';
import { setStopping } from '../src/state.js';
import { startPolling } from '../src/transport/poll.js';
import { jsonResponse, resetStats, withFetch } from './helpers.js';

test('startPolling() retries failures, dispatches updates, and advances the offset', async () => {
  resetStats();
  const originalSetTimeout = globalThis.setTimeout;
  const urls = [];
  const updates = [];

  // Skip the real backoff delay.
  globalThis.setTimeout = (callback) => {
    callback();
    return 0;
  };

  try {
    await withFetch(async (url) => {
      urls.push(url);

      if (urls.length === 1) {
        return jsonResponse({ error: 'temporary' }, { status: 500 });
      }

      if (urls.length === 2) {
        return jsonResponse([
          { ID: 5, Type: 'message' },
          { ID: 7, Type: 'added' },
        ]);
      }

      setStopping();
      return jsonResponse([]);
    }, async () => {
      await startPolling((update, via) => {
        updates.push({ update, via });
      });
    });
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }

  assert.deepEqual(updates, [
    { update: { ID: 5, Type: 'message' }, via: 'poll' },
    { update: { ID: 7, Type: 'added' }, via: 'poll' },
  ]);
  assert.deepEqual(urls, [
    `${BASE_URL}/bot/updates?timeout=30`,
    `${BASE_URL}/bot/updates?timeout=30`,
    `${BASE_URL}/bot/updates?timeout=30&offset=8`,
  ]);
});
