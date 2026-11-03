import './setup.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TOKEN } from '../src/config.js';
import { L } from '../src/logger.js';
import {
  activeSocket,
  currentMode,
  fmtUptime,
  setMode,
  setSocket,
  stats,
} from '../src/state.js';

function captureLogs(run) {
  const original = console.log;
  const output = [];
  console.log = (...args) => output.push(args.join(' '));
  try {
    run();
  } finally {
    console.log = original;
  }
  return output;
}

test('regular logger levels are silent outside dev mode', () => {
  const output = captureLogs(() => {
    L.debug('test', 'debug');
    L.info('test', 'info');
    L.warn('test', 'warn');
    L.error('test', 'error');
  });

  assert.deepEqual(output, []);
});

test('L.always() redacts the token from messages and data', () => {
  const output = captureLogs(() => {
    L.always('error', `request failed for ${TOKEN}`, {
      authorization: `Bot ${TOKEN}`,
    });
  });

  const text = output.join('\n');
  assert.match(text, /^ERR:/);
  assert.match(text, /\*\*\*/);
  assert.equal(text.includes(TOKEN), false);
});

test('L.always() appends explicit source lines', () => {
  const output = captureLogs(() => {
    L.always('warn', 'duplicate', undefined, [
      '  first at file.js:1:2',
      '  second at file.js:3:4',
    ]);
  });

  const text = output.join('\n');
  assert.match(text, /^WARN: duplicate/);
  assert.match(text, /first at file\.js:1:2/);
  assert.match(text, /second at file\.js:3:4/);
});

test('fmtUptime() returns a human-readable duration', () => {
  assert.match(fmtUptime(), /^(?:\d+d )?\d+h \d+m \d+s$/);
});

test('runtime state setters update mode and socket references', () => {
  try {
    setMode('poll');
    assert.equal(currentMode, 'poll');

    const socket = { readyState: 1 };
    setSocket(socket);
    assert.equal(activeSocket, socket);
  } finally {
    setMode('ws');
    setSocket(null);
  }
});

test('stats exposes the documented counters', () => {
  assert.deepEqual(stats, {
    updates: 0,
    errors: 0,
    apiCalls: 0,
    apiErrors: 0,
    dupes: 0,
  });
});
