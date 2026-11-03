/**
 * @file api.js
 * Low-level HTTP client for the Yurba REST API.
 * Handles timeouts, automatic 429 retry, logging, and token auth.
 */

import { TOKEN, CFG, BASE_URL, sleep, jitter } from './config.js';
import { L }     from './logger.js';
import { stats } from './state.js';

const HEADERS = {
  Authorization: `Bot ${TOKEN}`,
  'Content-Type': 'application/json',
};

/**
 * @typedef {{ status: number, ok: boolean, data: any, ms: number }} ApiResponse
 */

/**
 * Makes an authenticated HTTP request to the Yurba API.
 *
 * - Automatically sets `AbortSignal.timeout` (longer for long polling).
 * - Retries once on HTTP 429 using the `Retry-After` header value.
 * - Logs every non-2xx response as a warning.
 *
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} method
 * @param {string}  path     API path, e.g. `'/bot/me'`.
 * @param {object}  [body]   Request body — serialised to JSON.
 * @param {{ retried?: boolean, timeout?: number }} [opts]
 * @returns {Promise<ApiResponse>}
 */
export async function api(method, path, body, { retried = false, timeout } = {}) {
  const isPoll = path.startsWith('/bot/updates');
  const t0 = Date.now();
  let status = 0, data, retryAfter;

  try {
    const res = await fetch(BASE_URL + path, {
      method,
      headers: HEADERS,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(
        timeout ?? (isPoll ? (CFG.pollTimeoutS + 15) * 1000 : CFG.apiTimeoutMs),
      ),
    });
    L.debug('api', `${method} ${path}:`, body);
    status     = res.status;
    retryAfter = res.headers.get('retry-after');
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = text; }
  } catch (e) {
    data = { error: e.name === 'TimeoutError' ? 'timeout' : e.message };
  }

  const ms = Date.now() - t0;
  const ok = status >= 200 && status < 300;
  stats.apiCalls++;

  if (!ok) {
    stats.apiErrors++;
    L.warn('api', `${method} ${path} → ${status} (${ms}ms)`, { body, response: data });
  } else if (!isPoll) {
    L.debug('api', `${method} ${path} → ${status} (${ms}ms)`, data);
  }

  // Single retry on rate limit
  if (status === 429 && !retried) {
    const wait = jitter((Number(retryAfter) || 1) * 1000);
    L.warn('api', `429 rate-limit — waiting ${wait}ms before retry`);
    await sleep(wait);
    return api(method, path, body, { retried: true, timeout });
  }

  return { status, ok, data, ms };
}

/**
 * Splits a long string into chunks that fit within `max` characters.
 * Prefers splitting on `\n`, then on spaces, then hard-cuts.
 *
 * @param {string} text
 * @param {number} [max]  Defaults to `CFG.maxText`.
 * @returns {string[]}
 */
export function splitText(text, max = CFG.maxText) {
  text = String(text ?? '');
  if (text.length <= max) return [text];
  const parts = [];
  while (text.length > max) {
    let cut = text.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = text.lastIndexOf(' ', max);
    if (cut < max * 0.5) cut = max;
    parts.push(text.slice(0, cut));
    text = text.slice(cut).trimStart();
  }
  if (text) parts.push(text);
  return parts;
}

/**
 * Sends a message to a dialog, splitting automatically if the text is too long.
 * `replyTo` is attached to the first chunk, `markup` to the last.
 *
 * @param {string} dialogId
 * @param {string} text
 * @param {{ replyTo?: string, markup?: object }} [opts]
 * @returns {Promise<ApiResponse>}
 */
export async function send(dialogId, text, { replyTo, markup } = {}) {
  if (!dialogId) { L.warn('send', 'missing dialogId — skipped'); return { status: 0, ok: false }; }
  const parts = splitText(text);
  let last;
  for (let i = 0; i < parts.length; i++) {
    const extra = {};
    if (i === 0 && replyTo)               extra.replyTo = replyTo;
    if (i === parts.length - 1 && markup) extra.markup  = markup;
    const preview = parts[i].replace(/\n/g, ' ⏎ ').slice(0, 80);
    L.info('send', `→ ${dialogId} [${i + 1}/${parts.length}] "${preview}"${extra.markup ? ' [+markup]' : ''}${extra.replyTo ? ` reply=${extra.replyTo}` : ''}`);
    last = await api('POST', `/dialogs/${dialogId}/messages`, { text: parts[i], ...extra });
    if (!last.ok) break;
  }
  return last;
}

/**
 * Sends a typing indicator to the dialog.
 * @param {string} dialogId
 */
export const sendTyping = (dialogId) =>
  api('POST', '/bot/typing', { dialog: dialogId });

/**
 * Deletes a message for everyone.
 * @param {string} messageId
 */
export const deleteMessage = (messageId) =>
  api('DELETE', `/dialogs/messages/${messageId}?scope=everyone`);

/**
 * Updates the inline keyboard of an already-sent message.
 * Pass `null` as `markup` to remove the keyboard entirely.
 * @param {string} messageId
 * @param {object|null} markup
 */
export const updateMarkup = (messageId, markup) =>
  api('PATCH', `/dialogs/messages/${messageId}/markup`, { markup });

/**
 * Responds to an inline button press (callback query).
 * Must be called within ~8 seconds of receiving the callback update.
 * @param {string} callbackId
 * @param {{ Text?: string, Alert?: boolean, Url?: string }} [body]
 */
export const answerCallback = (callbackId, body = {}) =>
  api('POST', `/bot/callbacks/${callbackId}`, body);

/**
 * Responds to an inline query (`@bot text`).
 * @param {string} queryId
 * @param {Array<{ ID: string, Title: string, Text: string }>} results
 */
export const answerInline = (queryId, results) =>
  api('POST', `/bot/inline/${queryId}`, { results });
