import './setup.js';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import {
  answerCallback,
  answerInline,
  api,
  deleteMessage,
  send,
  sendTyping,
  splitText,
  updateMarkup,
} from '../src/api.js';
import { BASE_URL, TOKEN } from '../src/config.js';
import { stats } from '../src/state.js';
import {
  jsonResponse,
  requestBody,
  resetStats,
  textResponse,
  withFetch,
} from './helpers.js';

beforeEach(resetStats);

test('api() sends an authenticated GET without a body', async () => {
  const calls = [];

  await withFetch(async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({ User: { ID: 1, Name: 'Bot' } });
  }, async () => {
    const response = await api('GET', '/bot/me');

    assert.deepEqual(response.data, { User: { ID: 1, Name: 'Bot' } });
    assert.equal(response.status, 200);
    assert.equal(response.ok, true);
    assert.equal(typeof response.ms, 'number');
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE_URL}/bot/me`);
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.body, undefined);
  assert.equal(calls[0].init.headers.Authorization, `Bot ${TOKEN}`);
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.equal(stats.apiCalls, 1);
  assert.equal(stats.apiErrors, 0);
});

test('api() serializes a POST body and parses a plain-text response', async () => {
  let captured;

  await withFetch(async (url, init) => {
    captured = { url, init };
    return textResponse('ok');
  }, async () => {
    const response = await api('POST', '/bot/typing', { dialog: 'd.1' });

    assert.equal(response.status, 200);
    assert.equal(response.data, 'ok');
  });

  assert.deepEqual(requestBody(captured.init), { dialog: 'd.1' });
  assert.equal(captured.init.method, 'POST');
});

test('api() reports non-2xx responses and counts the error', async () => {
  await withFetch(
    async () => jsonResponse({ error: 'nope' }, { status: 500 }),
    async () => {
      const response = await api('DELETE', '/dialogs/messages/m.1');

      assert.equal(response.ok, false);
      assert.equal(response.status, 500);
      assert.deepEqual(response.data, { error: 'nope' });
      assert.equal(stats.apiCalls, 1);
      assert.equal(stats.apiErrors, 1);
    },
  );
});

test('api() turns a network failure into a status 0 response', async () => {
  await withFetch(
    async () => {
      const error = new Error('connection reset');
      error.name = 'TypeError';
      throw error;
    },
    async () => {
      const response = await api('GET', '/bot/me');

      assert.equal(response.status, 0);
      assert.equal(response.ok, false);
      assert.deepEqual(response.data, { error: 'connection reset' });
      assert.equal(stats.apiErrors, 1);
    },
  );
});

test('api() maps AbortSignal timeouts to a timeout error', async () => {
  await withFetch(
    async () => {
      const error = new Error('The operation timed out');
      error.name = 'TimeoutError';
      throw error;
    },
    async () => {
      const response = await api('GET', '/bot/me');
      assert.deepEqual(response.data, { error: 'timeout' });
    },
  );
});

test('api() retries exactly once on HTTP 429', async () => {
  let calls = 0;
  const originalSetTimeout = globalThis.setTimeout;

  // The retry sleeps for at least one second; resolve the delay immediately.
  globalThis.setTimeout = (callback) => {
    callback();
    return 0;
  };

  try {
    await withFetch(
      async () => {
        calls++;
        return calls === 1
          ? jsonResponse({ error: 'slow down' }, { status: 429, headers: { 'retry-after': '1' } })
          : jsonResponse({ ok: true });
      },
      async () => {
        const response = await api('GET', '/bot/me');

        assert.equal(calls, 2);
        assert.equal(response.status, 200);
        assert.deepEqual(response.data, { ok: true });
        assert.equal(stats.apiCalls, 2);
        assert.equal(stats.apiErrors, 1);
      },
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('splitText() keeps short text as a single chunk', () => {
  assert.deepEqual(splitText('hello'), ['hello']);
  assert.deepEqual(splitText('12345', 5), ['12345']);
  assert.deepEqual(splitText(''), ['']);
  assert.deepEqual(splitText(null), ['']);
  assert.deepEqual(splitText(0), ['0']);
});

test('splitText() prefers newlines, then spaces, then hard cuts', () => {
  assert.deepEqual(splitText('hello\nworld', 8), ['hello', 'world']);
  assert.deepEqual(splitText('hello world foo', 8), ['hello', 'world', 'foo']);
  assert.deepEqual(splitText('abcdefghij', 5), ['abcde', 'fghij']);
});

test('send() splits long messages and attaches replyTo and markup to the right chunks', async () => {
  const bodies = [];

  await withFetch(async (url, init) => {
    assert.equal(url, `${BASE_URL}/dialogs/d.1/messages`);
    bodies.push(requestBody(init));
    return jsonResponse({ ok: true });
  }, async () => {
    const response = await send('d.1', 'a'.repeat(4001), {
      replyTo: 'm.1',
      markup: { Inline: [] },
    });

    assert.equal(response.ok, true);
  });

  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0], { text: 'a'.repeat(4000), replyTo: 'm.1' });
  assert.deepEqual(bodies[1], { text: 'a', markup: { Inline: [] } });
});

test('send() skips the request when dialogId is missing', async () => {
  let calls = 0;

  await withFetch(async () => {
    calls++;
    return jsonResponse({});
  }, async () => {
    const response = await send('', 'hello');
    assert.deepEqual(response, { status: 0, ok: false });
  });

  assert.equal(calls, 0);
});

test('send() stops after the first failed chunk', async () => {
  let calls = 0;

  await withFetch(async () => {
    calls++;
    return jsonResponse({ error: 'failed' }, { status: 500 });
  }, async () => {
    const response = await send('d.1', 'a'.repeat(4001));
    assert.equal(response.status, 500);
    assert.equal(response.ok, false);
  });

  assert.equal(calls, 1);
});

test('convenience API wrappers call the expected endpoints', async () => {
  const calls = [];

  await withFetch(async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? requestBody(init) : undefined });
    return jsonResponse({});
  }, async () => {
    await sendTyping('d.1');
    await deleteMessage('m.1');
    await updateMarkup('m.1', null);
    await answerCallback('cb.1', { Text: 'Saved', Alert: true });
    await answerInline('q.1', [{ ID: '1', Title: 'One', Text: 'First' }]);
  });

  assert.deepEqual(calls, [
    { url: `${BASE_URL}/bot/typing`, method: 'POST', body: { dialog: 'd.1' } },
    { url: `${BASE_URL}/dialogs/messages/m.1?scope=everyone`, method: 'DELETE', body: undefined },
    { url: `${BASE_URL}/dialogs/messages/m.1/markup`, method: 'PATCH', body: { markup: null } },
    { url: `${BASE_URL}/bot/callbacks/cb.1`, method: 'POST', body: { Text: 'Saved', Alert: true } },
    { url: `${BASE_URL}/bot/inline/q.1`, method: 'POST', body: { results: [{ ID: '1', Title: 'One', Text: 'First' }] } },
  ]);
});
