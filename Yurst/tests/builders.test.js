import './setup.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ButtonsBuilder } from '../src/builders/buttons.js';

test('an empty ButtonsBuilder produces empty output', () => {
  const builder = new ButtonsBuilder();

  assert.deepEqual(builder.build(), []);
  assert.deepEqual(builder.buildMarkup(), { Inline: [] });
});

test('build() skips rows that contain no buttons', () => {
  const builder = new ButtonsBuilder()
    .row()
    .row()
    .callback('Only', 'only')
    .row();

  assert.deepEqual(builder.build(), [[{ text: 'Only', data: 'only' }]]);
});

test('build() returns defensive copies of buttons and rows', () => {
  const builder = new ButtonsBuilder().row().callback('Original', 'data');
  const first = builder.build();
  first[0][0].text = 'Changed';
  first.push([{ text: 'Injected', data: 'x' }]);

  assert.deepEqual(builder.build(), [[{ text: 'Original', data: 'data' }]]);
});

test('buildMarkup() preserves empty action values', () => {
  const builder = new ButtonsBuilder()
    .row()
    .callback('Empty data', '')
    .link('Empty url', '')
    .copy('Empty copy', '')
    .command('Empty command', '')
    .app('Empty app');

  assert.deepEqual(builder.buildMarkup(), {
    Inline: [[
      { Text: 'Empty data', Data: '' },
      { Text: 'Empty url', Url: '' },
      { Text: 'Empty copy', Copy: '' },
      { Text: 'Empty command', Command: '' },
      { Text: 'Empty app', App: '' },
    ]],
  });
});

test('btn() and cmd() are aliases for callback() and command()', () => {
  const builder = new ButtonsBuilder()
    .row()
    .btn('Callback', 'cb')
    .cmd('Command', '/run');

  assert.deepEqual(builder.build(), [[
    { text: 'Callback', data: 'cb' },
    { text: 'Command', command: '/run' },
  ]]);
});

test('add() requires a row and a string text', () => {
  assert.throws(() => new ButtonsBuilder().callback('No row', 'x'), /row\(\)/);
  assert.throws(() => new ButtonsBuilder().row().add(null), /string text/);
  assert.throws(() => new ButtonsBuilder().row().add({ text: 42 }), /string text/);
});

test('style modifiers require a button and gray() removes the style', () => {
  assert.throws(() => new ButtonsBuilder().primary(), /before setting its style/);
  assert.throws(() => new ButtonsBuilder().success(), /before setting its style/);
  assert.throws(() => new ButtonsBuilder().danger(), /before setting its style/);
  assert.throws(() => new ButtonsBuilder().gray(), /before setting its style/);

  const builder = new ButtonsBuilder().row().callback('Button', 'data').danger();
  assert.equal(builder.build()[0][0].style, 'danger');

  builder.gray();
  assert.deepEqual(builder.build(), [[{ text: 'Button', data: 'data' }]]);
});
