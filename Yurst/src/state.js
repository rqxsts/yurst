/**
 * @file state.js
 * Global mutable state shared across bot modules.
 * All mutations go through exported setters to keep changes traceable.
 */

/** Unix timestamp (ms) of process start. Used to compute uptime. */
export const startedAt = Date.now();

/**
 * Runtime counters.
 * @type {{ updates: number, errors: number, apiCalls: number, apiErrors: number, dupes: number }}
 */
export const stats = { updates: 0, errors: 0, apiCalls: 0, apiErrors: 0, dupes: 0 };

/** Current delivery mode: `'ws'` or `'poll'`. */
export let currentMode = 'ws';
/** @param {'ws'|'poll'} m */
export const setMode = (m) => { currentMode = m; };

/** Whether a graceful shutdown is in progress. */
export let stopping = false;
/** Mark the process as shutting down — no new updates will be accepted. */
export const setStopping = () => { stopping = true; };

/** Reference to the active WebSocket instance (null if not connected). */
export let activeSocket = null;
/** @param {WebSocket|null} s */
export const setSocket = (s) => { activeSocket = s; };

/**
 * Set of in-flight handler Promises.
 * Graceful shutdown waits for all of these to settle.
 * @type {Set<Promise<void>>}
 */
export const inflight = new Set();

/**
 * Returns a human-readable uptime string, e.g. `"2h 15m 4s"` or `"1d 0h 3m 9s"`.
 * @returns {string}
 */
export function fmtUptime() {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d ? d + 'd ' : ''}${h}h ${m}m ${s % 60}s`;
}
