import './setup.js';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { BASE_URL } from '../src/config.js';
import {
  CallbackContext,
  InlineContext,
  MessageContext,
} from '../src/context.js';
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

function messageContext(overrides = {}) {
  return new MessageContext(
    messageUpdate({
      Args: 'one two',
      Payload: 'invite-code',
      ...overrides,
    }),
    { _help: () => '  `/ping` — Check connection' },
  );
}

test('MessageContext exposes update fields and the help text', () => {
  const ctx = messageContext();

  assert.equal(ctx.user.Name, 'Tester');
  assert.equal(ctx.dialog, 'd.1');
  assert.equal(ctx.args, 'one two');
  assert.equal(ctx.payload, 'invite-code');
  assert.equal(ctx.help(), '  `/ping` — Check connection');
});

test('MessageContext.reply() quotes the current message by default', async () => {
  const calls = [];
  const ctx = messageContext();

  await withFetch(async (url, init) => {
    calls.push({ url, body: requestBody(init) });
    return jsonResponse({ ok: true });
  }, async () => {
    await ctx.reply('pong', {
      buttons: [[{ text: 'Open', url: 'https://yurba.one' }]],
    });
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${BASE_URL}/dialogs/d.1/messages`);
  assert.deepEqual(calls[0].body, {
    text: 'pong',
    replyTo: 'm.1',
    markup: { Inline: [[{ Text: 'Open', Url: 'https://yurba.one' }]] },
  });
});

test('MessageContext.reply() supports replyTo: null and reply keyboards', async () => {
  let body;
  const ctx = messageContext();

  await withFetch(async (url, init) => {
    body = requestBody(init);
    return jsonResponse({});
  }, async () => {
    await ctx.reply('pick a city', {
      replyTo: null,
      keyboard: [['Kyiv', 'Lviv']],
      placeholder: 'Choose a city',
    });
  });

  assert.deepEqual(body, {
    text: 'pick a city',
    markup: {
      Keyboard: [['Kyiv', 'Lviv']],
      Once: true,
      Placeholder: 'Choose a city',
    },
  });
  assert.equal('replyTo' in body, false);
});

test('MessageContext.send() does not quote the current message', async () => {
  let body;
  const ctx = messageContext();

  await withFetch(async (url, init) => {
    body = requestBody(init);
    return jsonResponse({});
  }, async () => {
    await ctx.send('follow-up');
  });

  assert.deepEqual(body, { text: 'follow-up' });
});

test('MessageContext.typing() targets the dialog typing endpoint', async () => {
  let captured;
  const ctx = messageContext();

  await withFetch(async (url, init) => {
    captured = { url, body: requestBody(init) };
    return jsonResponse({});
  }, async () => {
    await ctx.typing();
  });

  assert.deepEqual(captured, {
    url: `${BASE_URL}/bot/typing`,
    body: { dialog: 'd.1' },
  });
});

function callbackContext(overrides = {}) {
  return new CallbackContext(callbackUpdate(overrides), Date.now(), {});
}

test('CallbackContext exposes callback fields', () => {
  const ctx = callbackContext();

  assert.equal(ctx.data, 'menu:open');
  assert.equal(ctx.dialog, 'd.1');
  assert.equal(ctx.message.ID, 'm.1');
  assert.equal(ctx.user.Name, 'Tester');
});

test('CallbackContext.answer() sends silent, toast, and detailed answers', async () => {
  const bodies = [];

  await withFetch(async (url, init) => {
    bodies.push({ url, body: requestBody(init) });
    return jsonResponse({});
  }, async () => {
    await callbackContext().answer();
    await callbackContext().answer('Saved');
    await callbackContext().answer({
      text: 'Error',
      alert: true,
      url: 'https://example.com',
    });
  });

  assert.deepEqual(bodies, [
    { url: `${BASE_URL}/bot/callbacks/cb.1`, body: {} },
    { url: `${BASE_URL}/bot/callbacks/cb.1`, body: { Text: 'Saved' } },
    {
      url: `${BASE_URL}/bot/callbacks/cb.1`,
      body: { Text: 'Error', Alert: true, Url: 'https://example.com' },
    },
  ]);
});

test('CallbackContext.answer() only acknowledges once', async () => {
  let calls = 0;
  const ctx = callbackContext();

  await withFetch(async () => {
    calls++;
    return jsonResponse({});
  }, async () => {
    await ctx.answer('first');
    const second = await ctx.answer('second');
    assert.equal(second, undefined);
  });

  assert.equal(calls, 1);
});

test('CallbackContext.answer() ignores falsy optional values', async () => {
  let body;
  const ctx = callbackContext();

  await withFetch(async (url, init) => {
    body = requestBody(init);
    return jsonResponse({});
  }, async () => {
    await ctx.answer({ text: '', alert: false, url: '' });
  });

  assert.deepEqual(body, {});
});

test('CallbackContext.replace() edits the original message', async () => {
  const calls = [];
  const ctx = callbackContext();

  await withFetch(async (url, init) => {
    calls.push({ url, method: init.method, body: requestBody(init) });
    return jsonResponse({});
  }, async () => {
    await ctx.replace('counter: 1', {
      buttons: [[{ text: '+1', data: 'counter:inc' }]],
    });
  });

  assert.deepEqual(calls, [{
    url: `${BASE_URL}/dialogs/d.1/messages`,
    method: 'POST',
    body: {
      edit: 'm.1',
      text: 'counter: 1',
      markup: { Inline: [[{ Text: '+1', Data: 'counter:inc' }]] },
    },
  }]);
});

test('CallbackContext.editMarkup() patches only the keyboard', async () => {
  const calls = [];
  const ctx = callbackContext();

  await withFetch(async (url, init) => {
    calls.push({ url, method: init.method, body: requestBody(init) });
    return jsonResponse({});
  }, async () => {
    await ctx.editMarkup({ removeKeyboard: true });
  });

  assert.deepEqual(calls, [{
    url: `${BASE_URL}/dialogs/messages/m.1/markup`,
    method: 'PATCH',
    body: { markup: { Remove: true } },
  }]);
});

test('CallbackContext methods reject callbacks without an original message', async () => {
  const update = callbackUpdate();
  delete update.Callback.Message;
  const ctx = new CallbackContext(update, Date.now(), {});

  await withFetch(async () => {
    throw new Error('fetch must not be called');
  }, async () => {
    await assert.rejects(() => ctx.replace('text'), /without an original message/);
    assert.throws(() => ctx.editMarkup({ buttons: [] }), /without an original message/);
  });
});

test('CallbackContext.reply() sends a new message without editing', async () => {
  let body;
  const ctx = callbackContext();

  await withFetch(async (url, init) => {
    body = requestBody(init);
    return jsonResponse({});
  }, async () => {
    await ctx.reply('separate message');
  });

  assert.deepEqual(body, { text: 'separate message' });
});

function inlineContext(overrides = {}) {
  return new InlineContext(inlineUpdate(overrides));
}

test('InlineContext exposes the query and query id', () => {
  const ctx = inlineContext();

  assert.equal(ctx.query, 'hello');
  assert.equal(ctx.queryId, 'q.1');
  assert.equal(ctx.user.Name, 'Tester');
});

test('InlineContext reads the Text fallback and update ID', () => {
  const ctx = inlineContext({
    Inline: { Text: 'fallback query' },
  });

  assert.equal(ctx.query, 'fallback query');
  assert.equal(ctx.queryId, 3);
});

test('InlineContext.answer() normalizes camelCase and PascalCase results', async () => {
  let body;
  const ctx = inlineContext();
  const originalRandom = Math.random;
  Math.random = () => 0.5;

  try {
    await withFetch(async (url, init) => {
      body = requestBody(init);
      return jsonResponse({});
    }, async () => {
      await ctx.answer([
        { id: '1', title: 'One', text: 'First' },
        { ID: '2', Title: 'Two', Text: 'Second' },
        { title: 'Three' },
      ]);
    });
  } finally {
    Math.random = originalRandom;
  }

  assert.deepEqual(body, {
    results: [
      { ID: '1', Title: 'One', Text: 'First' },
      { ID: '2', Title: 'Two', Text: 'Second' },
      { ID: '0.5', Title: 'Three', Text: '' },
    ],
  });
});

test('InlineContext.answer() defaults to an empty result list', async () => {
  let body;
  const ctx = inlineContext();

  await withFetch(async (url, init) => {
    body = requestBody(init);
    return jsonResponse({});
  }, async () => {
    await ctx.answer();
  });

  assert.deepEqual(body, { results: [] });
});

test('MessageContext tolerates missing message fields', () => {
  const ctx = new MessageContext({ ID: 1, Type: 'message' }, { _help: () => '' });

  assert.equal(ctx.dialog, null);
  assert.equal(ctx.user, null);
  assert.equal(ctx.args, '');
  assert.equal(ctx.payload, '');
});
