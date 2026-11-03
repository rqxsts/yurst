/**
 * @file transport/poll.js
 * Long polling transport for receiving Yurba updates.
 * Used as the primary transport when `MODE=poll` or as a fallback from WebSocket.
 */

import { CFG, jitter, sleep } from '../config.js';
import { L }      from '../logger.js';
import { api }    from '../api.js';
import { stopping, setMode } from '../state.js';

/**
 * Starts the long polling loop.
 * Runs until `stopping` becomes true (graceful shutdown).
 *
 * - Handles HTTP 401 by exiting the process.
 * - Retries with exponential backoff on network errors and 429.
 * - Advances `offset` after each batch to acknowledge processed updates.
 *
 * @param {Function} dispatch  `dispatch(update, via)` from the bot.
 * @returns {Promise<void>}
 */
export async function startPolling(dispatch) {
  setMode('poll');
  L.info('poll', 'long polling started');

  let offset, backoff = 1_000;

  while (!stopping) {
    const path = `/bot/updates?timeout=${CFG.pollTimeoutS}${offset != null ? `&offset=${offset}` : ''}`;
    const r = await api('GET', path);

    if (r.status === 401) {
      L.error('poll', '401 auth_failed — invalid token');
      process.exit(1);
    }

    if (!r.ok || !Array.isArray(r.data)) {
      const wait = jitter(r.status === 429 ? Math.max(backoff, 5_000) : backoff);
      L.warn('poll', `request failed (${r.status}) — retrying in ${wait}ms`);
      backoff = Math.min(30_000, backoff * 2);
      await sleep(wait);
      continue;
    }

    backoff = 1_000;
    if (r.data.length) L.debug('poll', `received ${r.data.length} update(s)`);

    for (const u of r.data) {
      offset = Math.max(offset ?? 0, u.ID + 1);
      dispatch(u, 'poll');
    }
  }
}
