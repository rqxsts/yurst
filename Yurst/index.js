/**
 * @module yurst
 * Lightweight library for building Yurba.one bots.
 *
 * @example
 * import { bot } from 'yurst';
 *
 * bot.command('ping', 'Check connection', ctx => ctx.reply('pong'));
 * bot.start();
 */

/**
 * The bot singleton — the primary API surface.
 * Call `.command()`, `.callback()`, `.on()`, then `.start()`.
 */
export { bot } from './src/bot.js';

/** Builder for composing inline button rows and menus from data. */
export { ButtonsBuilder } from './src/builders/buttons.js';

/**
 * Low-level HTTP client for direct Yurba API calls.
 * @see {@link https://yurba.one/projects/yurba/api} Yurba API docs
 */
export { api } from './src/api.js';

/** Structured logger: `L.info(tag, msg, data?)`. */
export { L } from './src/logger.js';

/** Returns a human-readable uptime string, e.g. `"1h 23m 4s"`. */
export { fmtUptime } from './src/state.js';

/** Runtime counters: `{ updates, errors, apiCalls, apiErrors, dupes }`. */
export { stats } from './src/state.js';
