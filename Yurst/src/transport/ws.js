/**
 * @file transport/ws.js
 * WebSocket transport for receiving Yurba updates.
 * Handles reconnection with exponential backoff and falls back to polling
 * after `CFG.wsMaxFails` consecutive failed connections.
 */

import { TOKEN, CFG, jitter, DEV } from '../config.js';
import { L }        from '../logger.js';
import { api }      from '../api.js';
import { stopping, setMode, setSocket } from '../state.js';

const WS_URL = `wss://api.yurba.one/ws?token=${TOKEN}`;

/**
 * Resolves the WebSocket class.
 * Uses the native global in Node 22+, otherwise tries the `ws` package.
 * @returns {Promise<typeof WebSocket|null>}
 */
export async function getWebSocket() {
  if (globalThis.WebSocket) return globalThis.WebSocket;
  try { const m = await import('ws'); return m.WebSocket ?? m.default; } catch { return null; }
}

/**
 * Starts the WebSocket transport.
 * Returns a Promise that resolves only when the fallback to polling is triggered.
 *
 * @param {typeof WebSocket} WS        WebSocket constructor.
 * @param {Function}         dispatch  `dispatch(update, via)` from the bot.
 * @returns {Promise<void>}
 */
export function startWs(WS, dispatch) {
  return new Promise((fallback) => {
    let attempt = 0, failStreak = 0;

    function connect() {
      if (stopping) return;
      L.info('ws', `connecting… (attempt ${attempt + 1})`);
      const sock = new WS(WS_URL);
      setSocket(sock);

      let openedAt = 0, frames = 0, lastFrameAt = Date.now(), watchdog = null, closed = false;
      const stopWatchdog = () => { if (watchdog) clearInterval(watchdog); watchdog = null; };

      sock.onopen = () => {
        openedAt = lastFrameAt = Date.now();
        L.info('ws', 'socket open — waiting for greeting…');

        if (CFG.wsIdleMs > 0) {
          watchdog = setInterval(() => {
            if (Date.now() - lastFrameAt > CFG.wsIdleMs) {
              L.warn('ws', `idle > ${CFG.wsIdleMs}ms — forcing reconnect`);
              stopWatchdog();
              try { sock.close(); } catch { /* ignore */ }
            }
          }, Math.min(15_000, CFG.wsIdleMs)).unref();
        }
      };

      sock.onmessage = (e) => {
        frames++;
        lastFrameAt = Date.now();

        let f;
        try {
          f = JSON.parse(String(e.data));
        } catch {
          L.warn('ws', 'received non-JSON frame', String(e.data).slice(0, 200));
          return;
        }

        if (DEV) L.debug('ws', `frame #${frames}`, f);

        if (f.ok === 1 && f.version) {
          setMode('ws');
          L.info('ws', `connected — server ${f.version}`);
          attempt = 0;
          failStreak = 0;
          api('GET', '/bot/delivery').then(({ status, data }) => {
            L.info('ws', `delivery → ${status}`, data);
            if (data?.Mode !== 'websocket')
              L.warn('ws', `expected Mode=websocket, got: ${JSON.stringify(data)}`);
          });
        } else if (f.ok === 0) {
          L.warn('ws', 'server returned an error', f);
        } else if (f.Type === 'update' && f.Message) {
          dispatch(f.Message, 'ws');
        } else {
          L.warn('ws', `unknown frame (Type=${f.Type})`, f);
        }
      };

      sock.onerror = (e) =>
        L.error('ws', `socket error: ${e.message ?? e.type ?? 'unknown'}`);

      sock.onclose = (e) => {
        if (closed) return;
        closed = true;
        stopWatchdog();
        setSocket(null);

        const livedMs = openedAt ? Date.now() - openedAt : 0;
        L.warn('ws', `closed — code=${e.code} lived=${openedAt ? Math.round(livedMs / 1000) + 's' : 'never'} frames=${frames}`);

        if (e.code === 3000) {
          L.error('ws', 'auth_failed (3000) — check TOKEN');
          process.exit(1);
        }

        if (stopping) return;

        if (livedMs > 10_000) { attempt = 0; failStreak = 0; } else failStreak++;

        if (CFG.wsMaxFails > 0 && failStreak >= CFG.wsMaxFails) {
          L.warn('ws', `${failStreak} failed connections in a row — falling back to polling`);
          return fallback();
        }

        const delay = jitter(Math.min(30_000, 1000 * 2 ** attempt++));
        L.info('ws', `reconnecting in ${delay}ms…`);
        setTimeout(connect, delay);
      };
    }

    connect();
  });
}
