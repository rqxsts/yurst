import './setup.js';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import {
  Bot,
  buildInline,
  normalizeCommandName,
  resolveMarkup,
} from '../src/bot.js';
import { L } from '../src/logger.js';
import { inflight, stats } from '../src/state.js';
import {
  callbackUpdate,
  inlineUpdate,
  jsonResponse,
  messageUpdate,
  requestBody,
  resetStats,
  withFetch,
} from './helpers.js';

beforeEach(resetStats);

async function dispatchAndWait(bot, update, via = 'ws') {
  const before = new Set(inflight);
  bot.dispatch(update, via);
  const pending = [...inflight].filter((promise) => !before.has(promise));
  await Promise.all(pending);
}

test('resolveMarkup() applies removeKeyboard, keyboard, and buttons priority', () => {
  const buttons = [[{ text: 'Open', data: 'open' }]];
  const keyboard = [['One', 'Two']];

  assert.deepEqual(
    resolveMarkup(buttons, keyboard, true, 'ignored'),
    { Remove: true },
  );
  assert.deepEqual(
    resolveMarkup(buttons, keyboard, false, 'Hint'),
    { Keyboard: keyboard, Once: true, Placeholder: 'Hint' },
  );
  assert.deepEqual(
    resolveMarkup(buttons, undefined, false),
    { Inline: [[{ Text: 'Open', Data: 'open' }]] },
  );
  assert.equal(resolveMarkup(undefined, undefined, false), undefined);
});

test('resolveMarkup() omits an empty placeholder and preserves empty button lists', () => {
  assert.deepEqual(
    resolveMarkup(undefined, [['One']], false, ''),
    { Keyboard: [['One']], Once: true },
  );
  assert.deepEqual(resolveMarkup([], undefined, false), { Inline: [] });
});

test('buildInline() serializes every supported button action', () => {
  assert.deepEqual(
    buildInline([[
      { text: 'Callback', data: 'cb:1' },
      { text: 'Link', url: 'https://example.com' },
      { text: 'App', app: '' },
      { text: 'Copy', copy: 'code' },
      { text: 'Command', command: '/help' },
      { text: 'Styled', data: 'x', style: 'danger' },
    ]]),
    {
      Inline: [[
        { Text: 'Callback', Data: 'cb:1' },
        { Text: 'Link', Url: 'https://example.com' },
        { Text: 'App', App: '' },
        { Text: 'Copy', Copy: 'code' },
        { Text: 'Command', Command: '/help' },
        { Text: 'Styled', Data: 'x', Style: 'danger' },
      ]],
    },
  );
});

test('normalizeCommandName() handles slash prefixes, spaces, and non-strings', () => {
  assert.deepEqual(normalizeCommandName('/Hello  World'), {
    original: '/Hello  World',
    normalized: 'hello_world',
    lowercase: true,
    spaces: true,
    cyrillic: false,
    invalid: [],
  });
  assert.deepEqual(normalizeCommandName(null), {
    original: null,
    normalized: '',
    lowercase: false,
    spaces: false,
    cyrillic: false,
    invalid: [],
  });
});

test('command() supports shorthand and object registration', () => {
  const bot = new Bot();
  const calls = [];

  bot.command('ping', 'Check connection', () => calls.push('ping'));
  bot.command({
    name: 'city',
    description: 'Pick a city',
    scope: 'private',
    register: false,
    run: () => calls.push('city'),
  });

  assert.equal(
    bot._help(),
    '  `/ping` — Check connection\n  `/city` — Pick a city',
  );
});

test('command() enforces description and scope limits', () => {
  const bot = new Bot();
  const originalAlways = L.always;
  const logged = [];
  L.always = (...entry) => logged.push(entry);

  try {
    bot.command('good', 'ok', () => {});
    bot.command('long_description', 'a'.repeat(257), () => {});
    bot.command({
      name: 'bad_scope',
      description: 'scope',
      scope: 'channels',
      run: () => {},
    });
    bot.command({ name: 'bad_description', description: 42, run: () => {} });
  } finally {
    L.always = originalAlways;
  }

  assert.match(bot._help(), /\/good/);
  assert.doesNotMatch(bot._help(), /long_description|bad_scope|bad_description/);
  assert.ok(logged.some(([, message]) => message.includes('at most 256 characters')));
  assert.ok(logged.some(([, message]) => message.includes('unknown scope "channels"')));
  assert.equal(
    logged.filter(([, message]) => message.includes('at most 256 characters')).length,
    2,
  );
});

test('command() caps registered commands at 50 and ignores unregistered ones', () => {
  const bot = new Bot();
  const originalAlways = L.always;
  const logged = [];
  L.always = (...entry) => logged.push(entry);

  try {
    bot.command({
      name: 'not_registered',
      description: 'local only',
      register: false,
      run: () => {},
    });
    for (let index = 0; index < 50; index++) {
      bot.command(`cmd_${index}`, `Command ${index}`, () => {});
    }
    bot.command('cmd_50', 'One too many', () => {});
  } finally {
    L.always = originalAlways;
  }

  assert.match(bot._help(), /\/not_registered/);
  assert.match(bot._help(), /\/cmd_49/);
  assert.doesNotMatch(bot._help(), /cmd_50/);
  assert.ok(logged.some(([, message]) => message.includes('at most 50 registered commands')));
});

test('dispatch() routes commands to MessageContext with args and payload', async () => {
  const bot = new Bot();
  let captured;

  bot.command('ping', 'Check', (ctx) => {
    captured = ctx;
  });

  await dispatchAndWait(bot, messageUpdate({
    ID: 10,
    Command: 'PING',
    Args: 'one two',
    Payload: 'ref',
  }));

  assert.equal(captured.args, 'one two');
  assert.equal(captured.payload, 'ref');
  assert.equal(captured.dialog, 'd.1');
  assert.equal(captured.user.Name, 'Tester');
  assert.equal(stats.updates, 1);
});

test('dispatch() calls message listeners in registration order', async () => {
  const bot = new Bot();
  const calls = [];

  bot.on('message', async (ctx) => {
    calls.push(`first:${ctx.message.Text}`);
  });
  bot.on('message', (ctx) => {
    calls.push(`second:${ctx.message.Text}`);
  });

  await dispatchAndWait(bot, messageUpdate({ ID: 11 }));

  assert.deepEqual(calls, ['first:hello', 'second:hello']);
});

test('dispatch() does not call message listeners for unknown commands', async () => {
  const bot = new Bot();
  const calls = [];

  bot.on('message', () => calls.push('message'));
  await dispatchAndWait(bot, messageUpdate({ ID: 12, Command: 'missing' }));

  assert.deepEqual(calls, []);
});

test('dispatch() routes callbacks by exact match first, then prefix', async () => {
  const bot = new Bot();
  const calls = [];

  bot.callback('menu:open', () => calls.push('exact'));
  bot.callback('menu', () => calls.push('prefix'));

  await dispatchAndWait(bot, callbackUpdate({ ID: 13 }));

  assert.deepEqual(calls, ['exact']);
});

test('dispatch() stops at the first matching callback handler', async () => {
  const bot = new Bot();
  const calls = [];

  bot.callback('menu', () => calls.push('first'));
  bot.callback('menu:open', () => calls.push('second'));

  await dispatchAndWait(bot, callbackUpdate({ ID: 14 }));

  assert.deepEqual(calls, ['first']);
});

test('dispatch() acknowledges unhandled callbacks', async () => {
  const bot = new Bot();
  let body;

  await withFetch(async (url, init) => {
    body = { url, body: requestBody(init) };
    return jsonResponse({});
  }, async () => {
    await dispatchAndWait(bot, callbackUpdate({ ID: 15 }));
  });

  assert.deepEqual(body, {
    url: 'https://api.yurba.one/bot/callbacks/cb.1',
    body: {},
  });
});

test('dispatch() forwards generic events as raw updates', async () => {
  const bot = new Bot();
  const calls = [];

  bot.on('added', (update) => calls.push(`first:${update.ID}`));
  bot.on('added', (update) => calls.push(`second:${update.ID}`));

  await dispatchAndWait(bot, { ID: 16, Type: 'added' });

  assert.deepEqual(calls, ['first:16', 'second:16']);
});

test('dispatch() gives inline handlers an InlineContext', async () => {
  const bot = new Bot();
  let captured;

  bot.on('inline', (ctx) => {
    captured = ctx;
  });

  await dispatchAndWait(bot, inlineUpdate({ ID: 17 }));

  assert.equal(captured.query, 'hello');
  assert.equal(captured.queryId, 'q.1');
});

test('dispatch() ignores duplicate update IDs and counts them', async () => {
  const bot = new Bot();
  let calls = 0;

  bot.on('message', () => {
    calls++;
  });

  const update = messageUpdate({ ID: 18 });
  await dispatchAndWait(bot, update);
  await dispatchAndWait(bot, update);

  assert.equal(calls, 1);
  assert.equal(stats.updates, 1);
  assert.equal(stats.dupes, 1);
});

test('dispatch() does not deduplicate updates without an ID', async () => {
  const bot = new Bot();
  let calls = 0;

  bot.on('message', () => {
    calls++;
  });

  const update = messageUpdate();
  delete update.ID;
  await dispatchAndWait(bot, update);
  await dispatchAndWait(bot, update);

  assert.equal(calls, 2);
  assert.equal(stats.updates, 2);
  assert.equal(stats.dupes, 0);
});

test('dispatch() catches handler errors, counts them, and keeps going', async () => {
  const bot = new Bot();
  let secondCalled = false;

  bot.on('message', () => {
    throw new Error('handler failed');
  });
  bot.on('message', () => {
    secondCalled = true;
  });

  await dispatchAndWait(bot, messageUpdate({ ID: 19 }));

  assert.equal(secondCalled, false);
  assert.equal(stats.errors, 1);

  await dispatchAndWait(bot, messageUpdate({ ID: 20 }));
  assert.equal(stats.errors, 2);
});

test('bot.me exposes empty values before boot and builds invite links', () => {
  const bot = new Bot();

  assert.equal(bot.me.data, null);
  assert.equal(bot.me.name, null);
  assert.equal(bot.me.link, null);
  assert.equal(bot.me.id, null);
  assert.equal(bot.me.invite(), 'https://yurba.one/messenger?bot=');
  assert.equal(bot.me.invite('ref'), 'https://yurba.one/messenger?bot=&start=ref');
});
