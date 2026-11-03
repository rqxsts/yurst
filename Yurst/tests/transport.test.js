import './setup.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { setSocket } from '../src/state.js';
import { getWebSocket, startWs } from '../src/transport/ws.js';
import { jsonResponse, settle, withFetch } from './helpers.js';

test('getWebSocket() prefers the native global implementation', async () => {
  const original = globalThis.WebSocket;
  class FakeWebSocket {}

  try {
    globalThis.WebSocket = FakeWebSocket;
    assert.equal(await getWebSocket(), FakeWebSocket);
  } finally {
    globalThis.WebSocket = original;
  }
});

test('startWs() connects, receives a greeting, and dispatches update frames', async () => {
  const instances = [];
  const dispatched = [];

  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      instances.push(this);
    }

    close() {}
  }

  await withFetch(async () => jsonResponse({ Mode: 'websocket' }), async () => {
    const fallback = startWs(FakeWebSocket, (update, via) => {
      dispatched.push({ update, via });
    });

    assert.equal(instances.length, 1);
    assert.match(instances[0].url, /^wss:\/\/api\.yurba\.one\/ws\?token=/);

    const socket = instances[0];
    socket.onopen();
    socket.onmessage({ data: JSON.stringify({ ok: 1, version: '1.2.3' }) });
    await settle();

    socket.onmessage({
      data: JSON.stringify({
        Type: 'update',
        Message: { ID: 42, Type: 'message' },
      }),
    });

    assert.deepEqual(dispatched, [{
      update: { ID: 42, Type: 'message' },
      via: 'ws',
    }]);

    // Keep the returned promise from becoming an unhandled rejection.
    assert.equal(typeof fallback.then, 'function');
  });

  setSocket(null);
});

test('startWs() ignores malformed and unrecognized frames', async () => {
  class FakeWebSocket {
    constructor() {
      FakeWebSocket.instance = this;
    }

    close() {}
  }

  const dispatched = [];

  await withFetch(async () => jsonResponse({ Mode: 'websocket' }), async () => {
    startWs(FakeWebSocket, (update) => dispatched.push(update));

    const socket = FakeWebSocket.instance;
    socket.onmessage({ data: 'not json' });
    socket.onmessage({ data: JSON.stringify({ ok: 0, error: 'nope' }) });
    socket.onmessage({ data: JSON.stringify({ Type: 'unknown' }) });
    await settle();

    assert.deepEqual(dispatched, []);
  });

  setSocket(null);
});
