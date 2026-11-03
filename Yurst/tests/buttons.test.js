import './setup.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ButtonsBuilder } from '../src/builders/buttons.js';
import { ButtonsBuilder as LegacyButtonsBuilder } from '../src/builder.js';
import { Bot, normalizeCommandName, resolveMarkup } from '../src/bot.js';
import { L } from '../src/logger.js';

test('normalizes command case, spaces, and Cyrillic', () => {
  assert.equal(normalizeCommandName('/Rules  Test').normalized, 'rules_test');
  assert.equal(normalizeCommandName('хелп').normalized, 'help');
  assert.equal(normalizeCommandName('допомога').normalized, 'dopomoga');
  assert.equal(normalizeCommandName('налаштування').normalized, 'nalashtuvannya');
  assert.equal(normalizeCommandName('профіль').normalized, 'profil');
});

test('routes updates to normalized command names and preserves the first duplicate', async () => {
  const bot = new Bot();
  const originalAlways = L.always;
  const logged = [];
  L.always = (...entry) => logged.push(entry);

  try {
    let called;
    bot.command('Test ButtonSs', () => { called = 'first'; });
    bot.command('test  buttonss', () => { called = 'duplicate'; });
    bot.command('invalid#command', () => { called = 'invalid'; });
    bot.dispatch({
      ID: 900001,
      Type: 'message',
      Command: 'test_buttonss',
      Message: { ID: 'test-message', Dialog: { ID: 'test-dialog' } },
    }, 'ws');

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(called, 'first');
    assert.ok(logged.some(([level, message]) => level === 'error' && message.includes('already registered')));
    assert.ok(logged.some(([level, message]) => level === 'error' && message.includes('unsupported characters')));
  } finally {
    L.always = originalAlways;
  }
});

test('accepts command names within 1-32 normalized characters only', async () => {
  const bot = new Bot();
  const originalAlways = L.always;
  const logged = [];
  L.always = (...entry) => logged.push(entry);

  try {
    let called;
    bot.command('a', () => { called = 'one'; });
    bot.command('a'.repeat(32), () => { called = 'thirty-two'; });
    bot.command('', () => { called = 'empty'; });
    bot.command('a'.repeat(33), () => { called = 'thirty-three'; });
    bot.dispatch({
      ID: 900002,
      Type: 'message',
      Command: 'A'.repeat(32),
      Message: { ID: 'test-message-2', Dialog: { ID: 'test-dialog' } },
    }, 'ws');

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(called, 'thirty-two');
    assert.ok(logged.some(([level, message]) => level === 'error' && message.includes('is empty')));
    assert.ok(logged.some(([level, message]) => level === 'error' && message.includes('maximum is 32')));
  } finally {
    L.always = originalAlways;
  }
});

test('reports every source location for repeated duplicate command declarations', () => {
  const bot = new Bot();
  const originalLog = console.log;
  const output = [];
  console.log = (message) => output.push(String(message));

  try {
    bot.command('duplicate_location_test', () => {});
    bot.command('duplicate_location_test', () => {});
    bot.command('duplicate_location_test', () => {});
  } finally {
    console.log = originalLog;
  }

  assert.match(output[0], /^ERR: Command "duplicate_location_test" is already registered; duplicate command was not added\./);
  assert.match(output[0], /first at .*buttons\.test\.js:\d+:\d+/);
  assert.match(output[0], /second at .*buttons\.test\.js:\d+:\d+/);
  assert.match(output[1], /third at .*buttons\.test\.js:\d+:\d+/);
  assert.doesNotMatch(output[0], /^\d{2}:\d{2}:\d{2}/);
});

test('adds a placeholder to reply keyboard markup', () => {
  assert.deepEqual(
    resolveMarkup(undefined, [['Kyiv', 'Lviv']], false, 'Choose a city'),
    { Keyboard: [['Kyiv', 'Lviv']], Once: true, Placeholder: 'Choose a city' },
  );
});

test('serializes an app button, including an empty app value', () => {
  assert.deepEqual(
    resolveMarkup([[{ text: 'Open app', app: '' }]], undefined, false),
    { Inline: [[{ Text: 'Open app', App: '' }]] },
  );
});

test('builds fluent button rows in ctx.reply format', () => {
  const buttons = new ButtonsBuilder()
    .row()
    .callback('Help', 'help')
    .link('Docs', 'https://yurba.one')
    .app('Mini app')
    .command('Run', '/run')
    .row()
    .copy('Copy', 'invite-code')
    .success()
    .build();

  assert.deepEqual(buttons, [
    [
      { text: 'Help', data: 'help' },
      { text: 'Docs', url: 'https://yurba.one' },
      { text: 'Mini app', app: '' },
      { text: 'Run', command: '/run' },
    ],
    [{ text: 'Copy', copy: 'invite-code', style: 'success' }],
  ]);
});

test('builds large data-driven menus in groups of three', () => {
  const entries = Array.from({ length: 8 }, (_, index) => ({ id: index + 1, name: `Entry ${index + 1}` }));
  const builder = new ButtonsBuilder();

  entries.forEach((entry, index) => {
    if (index % 3 === 0) builder.row();
    builder.callback(entry.name, `entry:${entry.id}`).gray();
  });

  assert.deepEqual(builder.build().map((row) => row.length), [3, 3, 2]);
  assert.deepEqual(builder.buildMarkup().Inline[1][0], {
    Text: 'Entry 4',
    Data: 'entry:4',
  });

  entries[0].name = 'Changed';
  assert.equal(builder.build()[0][0].text, 'Entry 1');
});

test('supports style modifiers on the most recently added button', () => {
  const buttons = new ButtonsBuilder()
    .row()
    .callback('Delete', 'delete:1')
    .danger()
    .link('Default', 'https://yurba.one')
    .gray()
    .build();

  assert.deepEqual(buttons, [[
    { text: 'Delete', data: 'delete:1', style: 'danger' },
    { text: 'Default', url: 'https://yurba.one' },
  ]]);
  assert.throws(() => new ButtonsBuilder().link('No row', 'https://yurba.one'), /row\(\)/);
});

test('keeps the legacy internal import path', () => {
  assert.equal(LegacyButtonsBuilder, ButtonsBuilder);
});