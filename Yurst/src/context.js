/**
 * @file context.js
 * Context objects passed to every handler.
 * Each context type wraps a raw Yurba update and exposes a clean action API.
 */

import { api, updateMarkup as patchMarkup } from './api.js';
import { resolveMarkup } from './bot.js';

/**
 * @typedef {{ buttons?: ButtonRow[], keyboard?: string[][], placeholder?: string, removeKeyboard?: boolean, replyTo?: string|null }} ReplyOpts
 * @typedef {Array<{ text: string, data?: string, url?: string, copy?: string, command?: string, style?: string }>} ButtonRow
 */

// ─── MessageContext ───────────────────────────────────────────────────────────

/**
 * Context for incoming messages and commands.
 *
 * Available in:
 * - `bot.command(name, desc, ctx => ...)` handlers
 * - `bot.on('message', ctx => ...)` handlers
 */
export class MessageContext {
  /**
   * @param {object} update      Raw Yurba update object.
   * @param {object} botInstance Reference to the Bot singleton (for `ctx.help()`).
   */
  constructor(update, botInstance) {
    const m = update.Message ?? {};

    /** Raw Yurba update. */
    this.update = update;

    /** Full Message object from the update. */
    this.message = m;

    /** Author of the message (`User` object or `null`). */
    this.user = m.Author ?? null;

    /** Dialog ID string (e.g. `"d.xxxx"`). */
    this.dialog = m.Dialog?.ID ?? null;

    /** Arguments string after the command name (empty string if none). */
    this.args = update.Args ?? '';

    /** Deep-link payload from `/start <payload>` (empty string if none). */
    this.payload = update.Payload ?? '';

    /** @private */
    this._bot = botInstance;
  }

  /**
   * Sends a reply in the same dialog.
   * By default, replies to the current message (`replyTo` = message ID).
   * Pass `replyTo: null` to send without quoting.
   *
   * @param {string}     text
   * @param {ReplyOpts}  [opts]
   * @returns {Promise<import('./api.js').ApiResponse>}
   */
  reply(text, { buttons, keyboard, placeholder, removeKeyboard, replyTo } = {}) {
    const markup = resolveMarkup(buttons, keyboard, removeKeyboard, placeholder);
    return api('POST', `/dialogs/${this.dialog}/messages`, {
      text,
      replyTo: replyTo !== undefined ? (replyTo ?? undefined) : this.message.ID,
      ...(markup ? { markup } : {}),
    });
  }

  /**
   * Sends a new message in the same dialog without replying to the current message.
   *
   * @param {string} text
   * @param {ReplyOpts} [opts]
   * @returns {Promise<import('./api.js').ApiResponse>}
   */
  send(text, { buttons, keyboard, placeholder, removeKeyboard } = {}) {
    const markup = resolveMarkup(buttons, keyboard, removeKeyboard, placeholder);
    return api('POST', `/dialogs/${this.dialog}/messages`, {
      text,
      ...(markup ? { markup } : {}),
    });
  }

  /**
   * Sends a "typing…" indicator in the dialog.
   * @returns {Promise<import('./api.js').ApiResponse>}
   */
  typing() {
    return api('POST', '/bot/typing', { dialog: this.dialog });
  }

  /**
   * Returns an auto-generated command list text from the registered commands.
   * Suitable for sending directly as a reply: `ctx.reply(ctx.help())`.
   * @returns {string}
   */
  help() {
    return this._bot._help();
  }
}

// ─── CallbackContext ──────────────────────────────────────────────────────────

/**
 * Context for inline button presses (callback queries).
 *
 * Available in `bot.callback(pattern, ctx => ...)` handlers.
 *
 * **Important:** always call `ctx.answer()` as the very first `await`,
 * before any heavy work, to avoid the 8-second Yurba timeout.
 */
export class CallbackContext {
  /**
   * @param {object} update      Raw Yurba update.
   * @param {number} arrivedAt   `Date.now()` at the moment the update was received.
   * @param {object} botInstance Bot singleton reference.
   */
  constructor(update, arrivedAt, botInstance) {
    const cb = update.Callback ?? {};

    /** Raw Yurba update. */
    this.update = update;

    /** Full Callback object (`{ ID, Data, Message, User }`). */
    this.callback = cb;

    /** User who pressed the button. */
    this.user = cb.User ?? null;

    /** Dialog ID string. */
    this.dialog = cb.Message?.Dialog?.ID ?? update.Dialog?.ID ?? null;

    /** The message that contained the button (may be `null` for inline messages). */
    this.message = cb.Message ?? null;

    /** `Data` string from the button that was pressed. */
    this.data = cb.Data ?? '';

    /** @private */
    this.arrivedAt = arrivedAt;
    /** @private */
    this._answered = false;
    /** @private */
    this._bot = botInstance;
  }

  /**
   * Acknowledges the button press. **Must be called first**, before heavy work.
   *
   * - No arguments → silently stop the loading indicator.
   * - String argument → show a brief toast notification.
   * - Object argument → fine-grained control (`text`, `alert`, `url`).
   *
   * Calling `answer()` more than once is safe — subsequent calls are ignored.
   *
   * @param {string | { text?: string, alert?: boolean, url?: string }} [textOrOpts]
   * @returns {Promise<import('./api.js').ApiResponse>}
   *
   * @example
   * await ctx.answer();                          // silent
   * await ctx.answer('Saved!');                  // toast
   * await ctx.answer({ text: 'Error', alert: true }); // modal
   */
  async answer(textOrOpts) {
    if (this._answered) return;
    this._answered = true;

    let body = {};
    if (typeof textOrOpts === 'string') {
      body = { Text: textOrOpts };
    } else if (textOrOpts && typeof textOrOpts === 'object') {
      if (textOrOpts.text)  body.Text  = textOrOpts.text;
      if (textOrOpts.alert) body.Alert = textOrOpts.alert;
      if (textOrOpts.url)   body.Url   = textOrOpts.url;
    }

    return api('POST', `/bot/callbacks/${this.callback.ID}`, body);
  }

  /**
  * Edits the current message in place.
  * Useful for updating counter messages or paginated views.
   *
   * @param {string}    text
   * @param {ReplyOpts} [opts]
   * @returns {Promise<import('./api.js').ApiResponse>}
   */
  async replace(text, { buttons, keyboard, placeholder, removeKeyboard } = {}) {
    if (!this.message?.ID)
      throw new Error('Cannot replace a callback without an original message');

    const markup = resolveMarkup(buttons, keyboard, removeKeyboard, placeholder);
    return api('POST', `/dialogs/${this.dialog}/messages`, {
      edit: this.message.ID,
      text,
      ...(markup ? { markup } : {}),
    });
  }

  /**
   * Updates only the keyboard on the current message.
   * @param {ReplyOpts} [opts]
   * @returns {Promise<import('./api.js').ApiResponse>}
   */
  editMarkup({ buttons, keyboard, placeholder, removeKeyboard } = {}) {
    if (!this.message?.ID)
      throw new Error('Cannot edit markup without an original message');

    const markup = resolveMarkup(buttons, keyboard, removeKeyboard, placeholder);
    return patchMarkup(this.message.ID, markup ?? null);
  }

  /**
   * Sends a message in the dialog without deleting the original.
   *
   * @param {string}    text
   * @param {ReplyOpts} [opts]
   * @returns {Promise<import('./api.js').ApiResponse>}
   */
  reply(text, { buttons, keyboard, placeholder, removeKeyboard } = {}) {
    const markup = resolveMarkup(buttons, keyboard, removeKeyboard, placeholder);
    return api('POST', `/dialogs/${this.dialog}/messages`, {
      text,
      ...(markup ? { markup } : {}),
    });
  }
}

// ─── InlineContext ────────────────────────────────────────────────────────────

/**
 * Context for inline queries (`@bot <text>`).
 *
 * Available in `bot.on('inline', ctx => ...)` handlers.
 */
export class InlineContext {
  /**
   * @param {object} update Raw Yurba update.
   */
  constructor(update) {
    const iq = update.Inline ?? {};

    /** Raw Yurba update. */
    this.update = update;

    /** User who sent the inline query. */
    this.user = update.User ?? null;

    /** The query text typed after the bot mention. */
    this.query = iq.Query ?? iq.Text ?? '';

    /** @private */
    this.queryId = iq.ID ?? update.ID;
  }

  /**
   * Responds to the inline query with a list of results.
   * Accepts both camelCase (`id`, `title`, `text`) and PascalCase (`ID`, `Title`, `Text`) keys.
   *
   * @param {Array<{ id?: string, ID?: string, title?: string, Title?: string, text?: string, Text?: string }>} results
   * @returns {Promise<import('./api.js').ApiResponse>}
   *
   * @example
   * await ctx.answer([
   *   { id: '1', title: 'Hello', text: 'Hello, world!' },
   * ]);
   */
  answer(results = []) {
    const normalized = results.map((r) => ({
      ID:    r.ID    ?? r.id    ?? String(Math.random()),
      Title: r.Title ?? r.title ?? '',
      Text:  r.Text  ?? r.text  ?? '',
    }));
    return api('POST', `/bot/inline/${this.queryId}`, { results: normalized });
  }
}
