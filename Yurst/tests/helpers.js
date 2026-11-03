import assert from 'node:assert/strict';

import { stats } from '../src/state.js';

/** Resets global counters between tests in the same file. */
export function resetStats() {
  for (const key of Object.keys(stats)) stats[key] = 0;
}

/** Replaces global fetch for the duration of `run`, restoring it afterwards. */
export async function withFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

/** Builds a JSON fetch Response. */
export function jsonResponse(data, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** Builds a plain-text fetch Response. */
export function textResponse(text, { status = 200, headers = {} } = {}) {
  return new Response(text, {
    status,
    headers: { 'content-type': 'text/plain', ...headers },
  });
}

/** Parses the JSON body of a captured fetch request. */
export function requestBody(init) {
  assert.equal(typeof init.body, 'string');
  return JSON.parse(init.body);
}

/** Waits for all currently tracked handler promises to settle. */
export async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

/** Creates a message update with sensible defaults. */
export function messageUpdate(overrides = {}) {
  return {
    ID: 1,
    Type: 'message',
    Message: {
      ID: 'm.1',
      Dialog: { ID: 'd.1' },
      Author: { ID: 7, Name: 'Tester' },
      Text: 'hello',
    },
    ...overrides,
  };
}

/** Creates a callback update with sensible defaults. */
export function callbackUpdate(overrides = {}) {
  return {
    ID: 2,
    Type: 'callback',
    Callback: {
      ID: 'cb.1',
      Data: 'menu:open',
      User: { ID: 7, Name: 'Tester' },
      Message: {
        ID: 'm.1',
        Dialog: { ID: 'd.1' },
      },
    },
    ...overrides,
  };
}

/** Creates an inline update with sensible defaults. */
export function inlineUpdate(overrides = {}) {
  return {
    ID: 3,
    Type: 'inline',
    User: { ID: 7, Name: 'Tester' },
    Inline: { ID: 'q.1', Query: 'hello' },
    ...overrides,
  };
}
