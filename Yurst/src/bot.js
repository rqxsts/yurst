/**
 * @file bot.js
 * Core Bot class and singleton export.
 *
 * The singleton `bot` is the primary API surface of Yurst:
 *
 * ```js
 * import { bot } from 'yurst';
 *
 * bot.command('ping', 'Check connection', ctx => ctx.reply('pong'));
 * bot.on('message', ctx => ctx.reply('Got your message'));
 * bot.start();
 * ```
 */

import { api }        from './api.js';
import { L }          from './logger.js';
import { CFG, sleep, DEV } from './config.js';
import {
  stats, inflight, stopping,
  setStopping, activeSocket, fmtUptime,
} from './state.js';
import { getWebSocket, startWs } from './transport/ws.js';
import { startPolling }          from './transport/poll.js';
import { MessageContext, CallbackContext, InlineContext } from './context.js';

// ── Internal helpers ──────────────────────────────────────────────────────────

const CYRILLIC_TO_LATIN = Object.freeze({
  а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', е: 'e', є: 'ye', ж: 'zh', з: 'z',
  и: 'y', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ю: 'yu', я: 'ya', ё: 'yo', ы: 'y', э: 'e', ъ: '', ь: '', '’': '', "'": '',
});

export function normalizeCommandName(input) {
  if (typeof input !== 'string') {
    return { original: input, normalized: '', lowercase: false, spaces: false, cyrillic: false, invalid: [] };
  }

  const original = input;
  let value = input.trim();
  if (value.startsWith('/')) value = value.slice(1);

  const beforeLowercase = value;
  value = value.toLowerCase();
  const lowercase = beforeLowercase !== value;

  const beforeSpaces = value;
  value = value.replace(/\s+/gu, '_');
  const spaces = beforeSpaces !== value;

  const beforeCyrillic = value;
  value = [...value].map((character) => CYRILLIC_TO_LATIN[character] ?? character).join('');
  const cyrillic = /[\u0400-\u04FF]/u.test(beforeCyrillic);
  const invalid = [...new Set(value.match(/[^a-z0-9_]/g) ?? [])];

  return { original, normalized: value, lowercase, spaces, cyrillic, invalid };
}

function commandCallsite() {
  const stack = new Error().stack?.split('\n').slice(1) ?? [];
  return stack.find((frame) =>
    !frame.includes('/src/bot.js') &&
    !frame.includes('/src/logger.js') &&
    !frame.includes('node:internal'),
  )?.trim().replace(/^at /, '');
}

function ordinal(number) {
  if (number === 1) return 'first';
  if (number === 2) return 'second';
  if (number === 3) return 'third';
  const suffix = number % 100 >= 11 && number % 100 <= 13
    ? 'th'
    : ({ 1: 'st', 2: 'nd', 3: 'rd' }[number % 10] ?? 'th');
  return `${number}${suffix}`;
}

/**
 * Resolves reply options into a Yurba `markup` object.
 * Priority: `removeKeyboard` > `keyboard` (reply) > `buttons` (inline).
 *
 * @param {Array[]|undefined}    buttons         Inline button rows.
 * @param {string[][]|undefined} keyboard        Reply keyboard rows.
 * @param {boolean|undefined}    removeKeyboard  If true, sends `{ Remove: true }`.
 * @returns {object|undefined}
 */
export function resolveMarkup(buttons, keyboard, removeKeyboard, placeholder) {
  if (removeKeyboard) return { Remove: true };
  if (keyboard)       return { Keyboard: keyboard, Once: true, ...(placeholder ? { Placeholder: placeholder } : {}) };
  if (buttons)        return buildInline(buttons);
  return undefined;
}

/**
 * Converts a plain button row array into a Yurba `{ Inline: [[...]] }` object.
 *
 * Each button is a plain object with a `text` property and exactly one action:
 * - `data`    — callback button
 * - `url`     — link button
 * - `app`     — open the bot's mini app
 * - `copy`    — copy-to-clipboard button
 * - `command` — run-command button
 *
 * Optional: `style` — `'primary'`, `'success'`, or `'danger'`.
 *
 * @param {Array<Array<{text:string, data?:string, url?:string, app?:string, copy?:string, command?:string, style?:string}>>} rows
 * @returns {{ Inline: object[][] }}
 */
export function buildInline(rows) {
  return {
    Inline: rows.map((row) =>
      row.map((b) => {
        const btn = { Text: b.text };
        if (b.data)    btn.Data    = b.data;
        if (b.url)     btn.Url     = b.url;
        if (b.app !== undefined) btn.App = b.app;
        if (b.copy)    btn.Copy    = b.copy;
        if (b.command) btn.Command = b.command;
        if (b.style)   btn.Style   = b.style;
        return btn;
      }),
    ),
  };
}

// ── Bot class ─────────────────────────────────────────────────────────────────

export class Bot {
  /** @type {Map<string, { desc: string, scope: string, register: boolean, handler: Function }>} */
  #commands  = new Map();

  /** @type {Array<{ pattern: string, handler: Function }>} */
  #callbacks = [];

  /** @type {Map<string, Function[]>} */
  #listeners = new Map();

  /** LRU Set for deduplicating re-delivered updates after WS reconnects. */
  #seen      = new Set();

  /** Cached bot user data from `GET /bot/me` — available after `start()`. */
  #meData    = null;

  // ─── bot.me ──────────────────────────────────────────────────────────────

  /**
   * Information about the bot itself.
   * Populated after `bot.start()` completes the boot sequence.
   *
   * @returns {{
   *   data:   object|null,
   *   name:   string|null,
   *   link:   string|null,
   *   id:     number|null,
   *   invite: (payload?: string) => string,
   * }}
   *
   * @example
   * bot.me.name           // 'Ani'
   * bot.me.link           // 'ani_'
   * bot.me.id             // 2251
   * bot.me.invite()       // 'https://yurba.one/messenger?bot=ani_'
   * bot.me.invite('ref')  // 'https://yurba.one/messenger?bot=ani_&start=ref'
   */
  get me() {
    const data = this.#meData;
    return {
      /** Full User object returned by `GET /bot/me`. */
      data,
      /** Bot display name. */
      name: data?.Name ?? null,
      /** Bot username without `@`. */
      link: data?.Link ?? null,
      /** Numeric bot user ID. */
      id:   data?.ID   ?? null,
      /**
       * Builds a deep-link URL to start the bot.
       * @param {string} [payload] Optional start parameter.
       * @returns {string}
       */
      invite: (payload) => {
        const l = data?.Link ?? '';
        return payload
          ? `https://yurba.one/messenger?bot=${l}&start=${payload}`
          : `https://yurba.one/messenger?bot=${l}`;
      },
    };
  }

  // ─── Registration ─────────────────────────────────────────────────────────

  /**
   * Registers a bot command.
   *
   * **Shorthand form** (registers the command in Yurba by default):
   * ```js
   * bot.command('ping', 'Check connection', ctx => ctx.reply('pong'));
   * bot.command('ping', 'Check connection', ctx => ctx.reply('pong'), { register: false });
   * ```
   *
   * **Object form** (full control):
   * ```js
   * bot.command({
  *   name:        'city',
  *   description: 'Pick a city',
  *   scope:       'private',   // 'all', 'private', or 'groups'
  *   register:    true,        // whether to include in PUT /bot/commands — default true
  *   run:         ctx => ctx.reply('Which city?', { keyboard: [['Kyiv', 'Lviv']] }),
  * });
   * ```
   *
   * @param {string | { name: string, description?: string, scope?: string, register?: boolean, run: Function }} nameOrObj
   * @param {string|Function} [descOrHandler]
   * @param {Function}        [handler]
   * @param {{ register?: boolean }} [opts]
   * @returns {this}
   */
  command(nameOrObj, descOrHandler, handler, opts = {}) {
    const source = commandCallsite();
    let name, desc, scope = 'all', register = true, run;

    if (nameOrObj !== null && typeof nameOrObj === 'object') {
      ({ name, description: desc, scope = 'all', register = true, run } = nameOrObj);
    } else {
      name     = nameOrObj;
      desc     = typeof descOrHandler === 'string' ? descOrHandler : '';
      run      = typeof descOrHandler === 'function' ? descOrHandler : handler;
      register = opts.register ?? true;
    }
    desc ??= '';

    const result = normalizeCommandName(name);
    if (result.lowercase) {
      L.always('info', `Command name "${name}" contains uppercase letters and was normalized to "${result.normalized}".\nRegister command names in lowercase.`);
    }
    if (result.spaces) {
      L.always('warn', `Spaces are not supported in command names; replaced "${name}" with "${result.normalized}".`);
    }
    if (result.cyrillic) {
      L.always('warn', `Cyrillic is not supported in command names; transliterated "${name}" to "${result.normalized}".`);
    }

    if (!result.normalized.length) {
      L.always('error', `Command name "${name}" is empty. Names must contain 1 to 32 Latin letters, digits, or underscores.`);
      return this;
    }
    if (result.normalized.length > 32) {
      L.always('error', `Command name "${result.normalized}" has ${result.normalized.length} characters; the maximum is 32.`);
      return this;
    }
    if (result.invalid.length) {
      L.always('error', `Command name "${result.normalized}" contains unsupported characters: ${result.invalid.join(' ')}. Only Latin letters, digits, and underscores are allowed.`);
      return this;
    }
    if (typeof desc !== 'string' || [...desc].length > 256) {
      L.always('error', 'Command descriptions must be strings of at most 256 characters.');
      return this;
    }
    if (!['all', 'private', 'groups'].includes(scope)) {
      L.always('error', `Command "${result.normalized}" has unknown scope "${scope}". Use "all", "private", or "groups".`);
      return this;
    }
    const existingCommand = this.#commands.get(result.normalized);
    if (existingCommand) {
      existingCommand.sources.push(source);
      const locations = existingCommand.sources.map((location, index) =>
        `  ${ordinal(index + 1)} at ${location ?? 'unknown location'}`,
      );
      L.always(
        'error',
        `Command "${result.normalized}" is already registered; duplicate command was not added.`,
        undefined,
        locations,
      );
      return this;
    }
    const registeredCount = [...this.#commands.values()].filter((command) => command.register !== false).length;
    if (register !== false && registeredCount >= 50) {
      L.always('error', 'The Yurba API allows at most 50 registered commands; command was not added.');
      return this;
    }

    this.#commands.set(result.normalized, { desc, scope, register, handler: run, sources: [source] });
    return this;
  }

  /**
   * Registers a callback handler matched against button `Data` strings.
   *
   * Matching rules (first match wins):
   * - Exact match:  `data === pattern`
   * - Prefix match: `data.startsWith(pattern + ':')`
   *
   * ```js
   * bot.callback('cnt:inc', ctx => { ... });  // matches 'cnt:inc' and 'cnt:inc:5'
   * bot.callback('menu:danger', ctx => { ... }); // exact match only (no colon suffix)
   * ```
   *
   * @param {string}   pattern  Exact data string or colon-separated prefix.
   * @param {Function} handler  `(ctx: CallbackContext) => Promise<void>`
   * @returns {this}
   */
  callback(pattern, handler) {
    this.#callbacks.push({ pattern, handler });
    return this;
  }

  /**
   * Subscribes to a Yurba update event.
   *
   * **Supported events:**
   * - `'message'`    — plain messages (non-command). Handler receives `MessageContext`.
   * - `'inline'`     — inline queries (`@bot text`). Handler receives `InlineContext`.
   * - `'inline_sent'`— user selected an inline result. Handler receives raw update.
   * - `'stopped'`    — user blocked the bot.
   * - `'added'`, `'removed'`, `'joined'`, `'left'`, `'edit'`, `'delete'`, `'test'`
   *   — group/chat events. Handler receives raw update object.
   *
   * Multiple handlers for the same event are called in registration order.
   *
   * @param {string}   event
   * @param {Function} handler
   * @returns {this}
   */
  on(event, handler) {
    if (!this.#listeners.has(event)) this.#listeners.set(event, []);
    this.#listeners.get(event).push(handler);
    return this;
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  /**
   * Generates the help text from the registered command list.
   * Called internally by `ctx.help()`.
   * @returns {string}
   * @internal
   */
  _help() {
    const lines = [];
    for (const [name, { desc }] of this.#commands)
      lines.push(`  \`/${name}\` — ${desc}`);
    return lines.join('\n');
  }

  /**
   * LRU deduplication check.
   * Returns `true` if the update ID was already seen (duplicate after WS reconnect).
   * @param {number|null|undefined} id
   * @returns {boolean}
   * @private
   */
  #isDupe(id) {
    if (id == null) return false;
    if (this.#seen.has(id)) return true;
    this.#seen.add(id);
    if (this.#seen.size > 1000) this.#seen.delete(this.#seen.values().next().value);
    return false;
  }

  /**
   * Dispatches a raw update without blocking the transport loop.
   * The resulting Promise is tracked in `inflight` for graceful shutdown.
   *
   * @param {object} u    Raw Yurba update object.
   * @param {string} via  Transport source: `'ws'` or `'poll'`.
   */
  dispatch(u, via) {
    if (stopping) return;
    const p = this.#handle(u, via).finally(() => inflight.delete(p));
    inflight.add(p);
  }

  /** @private */
  async #handle(u, via) {
    if (this.#isDupe(u.ID)) { stats.dupes++; return; }

    const arrivedAt = Date.now();
    stats.updates++;
    const lag = u.Timestamp ? `${Math.round(arrivedAt / 1000 - u.Timestamp)}s` : '?';
    let details;
    if (u.Type === 'message') {
      const message = u.Message ?? {};
      details = {
        author: message.Author?.Name,
        userId: message.Author?.ID,
        dialogId: message.Dialog?.ID,
        messageId: message.ID,
        text: message.Text,
        ...(u.Command ? { command: u.Command, args: u.Args } : {}),
      };
    } else if (u.Type === 'callback') {
      const callback = u.Callback ?? {};
      details = {
        callbackId: callback.ID,
        data: callback.Data,
        userId: callback.User?.ID,
        userName: callback.User?.Name,
        dialogId: callback.Message?.Dialog?.ID ?? u.Dialog?.ID,
        messageId: callback.Message?.ID,
      };
    }
    L.info('update', `#${u.ID} via=${via} lag=${lag} | ${u.Type}${u.Command ? ' /' + u.Command : ''}`, details);
    if (DEV) L.debug('update', 'raw', u);

    try {
      switch (u.Type) {
        case 'message':  await this.#handleMessage(u);             break;
        case 'callback': await this.#handleCallback(u, arrivedAt); break;
        case 'inline':   await this.#handleInline(u);              break;
        default: {
          const handlers = this.#listeners.get(u.Type) ?? [];
          for (const h of handlers) await h(u);
          if (!handlers.length) L.debug('event', u.Type);
        }
      }
    } catch (e) {
      stats.errors++;
      L.error('update', `#${u.ID} error: ${e?.stack ?? e}`);
    }
  }

  /** @private */
  async #handleMessage(u) {

    const ctx = new MessageContext(u, this);
    if (u.Command) {
      const commandName = normalizeCommandName(u.Command).normalized;
      const cmd = this.#commands.get(commandName);
      if (cmd) return cmd.handler(ctx);
      L.debug('cmd', `unknown: /${u.Command}`);
      return;
    }
    const handlers = this.#listeners.get('message') ?? [];
    for (const h of handlers) await h(ctx);
  }

  /** @private */
  async #handleCallback(u, arrivedAt) {
    const ctx  = new CallbackContext(u, arrivedAt, this);
    const data = u.Callback?.Data ?? '';

    for (const { pattern, handler } of this.#callbacks) {
      if (data === pattern || data.startsWith(pattern + ':'))
        return handler(ctx);
    }

    // No handler found — silently acknowledge to stop the loading indicator
    await ctx.answer();
    if (DEV) L.debug('cb', `unhandled data: "${data}"`);
  }

  /** @private */
  async #handleInline(u) {
    const ctx = new InlineContext(u);
    const handlers = this.#listeners.get('inline') ?? [];
    for (const h of handlers) await h(ctx);
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────

  /** @private */
  async #boot() {
    const me = await api('GET', '/bot/me');
    if (me.status === 401) { L.error('bot', '401 auth_failed — invalid token'); process.exit(1); }

    const u = me.data?.User ?? me.data ?? {};
    this.#meData = u;
    L.info('bot', `${u.Name ?? '?'} @${u.Link ?? '?'} id=${u.ID ?? '?'}`);

    const list = [...this.#commands.entries()]
      .filter(([, c]) => c.register !== false)
      .map(([Command, c]) => ({ Command, Description: c.desc, Scope: c.scope }));
    const put = await api('PUT', '/bot/commands', { commands: list });
    L.info('bot', `commands → ${put.status}`,
      Array.isArray(put.data) ? put.data.map((c) => `/${c.Command}[${c.Scope}]`).join(' ') : put.data,
    );

    const d = await api('GET', '/bot/delivery');
    L.info('bot', `delivery → ${d.status}`, d.data);
  }

  // ─── Shutdown ─────────────────────────────────────────────────────────────

  /** @private */
  #shutdown(signal) {
    if (stopping) return;
    setStopping();
    L.info('bot', `${signal}: shutting down, inflight=${inflight.size}`);
    try { activeSocket?.close(); } catch { /* ignore */ }
    Promise.race([Promise.allSettled([...inflight]), sleep(5_000)])
      .then(() => { L.info('bot', `stopped after ${fmtUptime()}`); process.exit(0); });
  }

  // ─── Start ────────────────────────────────────────────────────────────────

  /**
   * Boots the bot and starts receiving updates.
   *
   * Sequence:
   * 1. Calls `GET /bot/me` — validates the token and populates `bot.me`.
   * 2. Calls `PUT /bot/commands` — registers all commands with `register !== false`.
   * 3. Starts the WebSocket transport (or falls back to long polling after `WS_MAX_FAILS` failures).
   *
   * Never resolves under normal operation.
   *
   * @returns {Promise<never>}
   */
  async start() {
    L.info('bot', `start | MODE=${CFG.mode} | node=${process.version}${DEV ? ' | DEV' : ''}`);

    process.on('SIGINT',  () => this.#shutdown('SIGINT'));
    process.on('SIGTERM', () => this.#shutdown('SIGTERM'));
    process.on('unhandledRejection', (e) => L.error('bot', `unhandledRejection: ${e?.stack ?? e}`));

    await this.#boot();

    const dispatch = (u, via) => this.dispatch(u, via);

    if (CFG.mode === 'ws') {
      const WS = await getWebSocket();
      if (WS) {
        L.info('bot', 'starting WebSocket transport…');
        await startWs(WS, dispatch);
        try { activeSocket?.close(); } catch { /* ignore */ }
        L.warn('bot', 'WS transport ended → falling back to polling');
      } else {
        L.warn('bot', 'WebSocket unavailable (Node 22+ or npm i ws required) → polling');
      }
    }

    await startPolling(dispatch);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/**
 * The Yurst bot singleton.
 * Import this and call registration methods before `bot.start()`.
 *
 * @type {Bot}
 */
export const bot = new Bot();
