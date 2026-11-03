/**
 * @file logger.js
 * Coloured, levelled logger with token redaction and optional file output.
 *
 * Logging is opt-in via environment variables:
 *   - `YURST=dev`          — enables all Yurst logs (default level: info)
 *   - `YURST_LOG=debug`    — sets the log level (only works when YURST=dev)
 *   - Without `YURST=dev`  — regular logs are silent; command diagnostics remain visible
 */

import { appendFileSync } from 'node:fs';
import { TOKEN, CFG, DEV } from './config.js';

/** @type {Record<string, number>} */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

// Silent unless YURST=dev. YURST_LOG sets the level (default: info).
const LVL = DEV
  ? (LEVELS[process.env.YURST_LOG?.toLowerCase()] ?? LEVELS.info)
  : Infinity;

const MAXLEN = LVL <= LEVELS.debug ? 4000 : 500;

// ANSI colours — only when stdout is a real TTY
const C = process.stdout.isTTY
  ? {
      debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m',
      jsonKey: '\x1b[36m', jsonString: '\x1b[32m', jsonNumber: '\x1b[35m', jsonLiteral: '\x1b[33m',
      reset: '\x1b[0m',
    }
  : {
      debug: '', info: '', warn: '', error: '',
      jsonKey: '', jsonString: '', jsonNumber: '', jsonLiteral: '', reset: '',
    };

function colorizeJson(json) {
  return json.replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    (token, quoted, colon, literal) => {
      if (quoted !== undefined) {
        const color = colon ? C.jsonKey : C.jsonString;
        return `${color}${quoted}${C.reset}${colon ?? ''}`;
      }
      const color = literal !== undefined ? C.jsonLiteral : C.jsonNumber;
      return `${color}${token}${C.reset}`;
    });
}

/**
 * Removes the bot token from any string to prevent accidental leaks in logs.
 * @param {string} s
 * @returns {string}
 */
const redact = (s) => String(s).split(TOKEN).join('***');

/**
 * Core log function.
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} tag    Short module/context label shown in brackets.
 * @param {string} msg    Human-readable message.
 * @param {*}      [data] Optional extra data — serialised as JSON.
 */
function log(level, tag, msg, data) {
  if (LEVELS[level] < LVL) return;

  const ts = new Date().toISOString();
  let body = `${level.toUpperCase().padEnd(5)} [${tag}] ${msg}`;
  let consoleData = '';

  if (data !== undefined) {
    let s;
    try { s = typeof data === 'string' ? data : JSON.stringify(data, null, 2); } catch { s = String(data); }
    s = s.length > MAXLEN ? s.slice(0, MAXLEN) + `…(+${s.length - MAXLEN})` : s;
    consoleData = `\n  ${typeof data === 'string' ? s : colorizeJson(s).replace(/\n/g, '\n  ')}`;
    body += `\n  ${s.replace(/\n/g, '\n  ')}`;
  }

  body = redact(body);
  const prefix = `${C[level]}${ts.slice(11, 23)} ${level.toUpperCase().padEnd(5)} [${tag}] ${C.reset}`;
  const consoleMessage = String(msg).replace(/\n/g, '\n  ');
  console.log(`${prefix}${consoleMessage}${consoleData}`);

  if (CFG.logFile)
    try { appendFileSync(CFG.logFile, `${ts} ${redact(body)}\n`); } catch { /* ignore */ }
}

/**
 * Logger object with a method per level.
 *
 * @type {{ debug: LogFn, info: LogFn, warn: LogFn, error: LogFn }}
 * @typedef {(tag: string, msg: string, data?: any) => void} LogFn
 */
export const L = Object.fromEntries(
  Object.keys(LEVELS).map((k) => [k, (tag, msg, data) => log(k, tag, msg, data)]),
);

L.always = (level, msg, data, sourceLines) => {
  const stack = new Error().stack?.split('\n').slice(1) ?? [];
  const source = stack.find((frame) =>
    !frame.includes('/src/logger.js') &&
    !frame.includes('/src/bot.js') &&
    !frame.includes('node:internal'),
  )?.trim().replace(/^at /, '');
  let output = `${level === 'error' ? 'ERR' : level.toUpperCase()}: ${msg}`;

  if (data !== undefined) {
    try {
      output += `\n  ${typeof data === 'string' ? data : JSON.stringify(data, null, 2).replace(/\n/g, '\n  ')}`;
    } catch {
      output += `\n  ${String(data)}`;
    }
  }
  if (sourceLines?.length) output += `\n${sourceLines.join('\n')}\n`;
  else if (source) output += `\n  at ${source}\n`;

  output = redact(output);
  const coloredOutput = output.split('\n').map((line, index) => {
    if (index === 0) return line.replace(`${level === 'error' ? 'ERR' : level.toUpperCase()}:`, `${C[level]}${level === 'error' ? 'ERR' : level.toUpperCase()}${C.reset}:`);
    if (/^  (?:at |(?:first|second|third|\d+(?:st|nd|rd|th)) at )/.test(line)) {
      return line.replace(/(file:\/\/\/\S+?:\d+:\d+|\/\S+?:\d+:\d+)/g, `${C.info}$1${C.reset}`);
    }
    return line;
  }).join('\n');

  console.log(coloredOutput);
  if (CFG.logFile)
    try { appendFileSync(CFG.logFile, `${output}\n`); } catch { /* ignore */ }
};
