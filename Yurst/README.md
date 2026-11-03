# yurst

A lightweight Node.js library for building [Yurba.one](https://yurba.one) bots.

Includes a `bot` singleton, command registration, inline buttons, reply keyboards, callback queries, inline mode, WebSocket updates with a long-polling fallback, and a small HTTP client for the Yurba API.

## Install

```sh
npm install yurst
```

Requires Node.js 22 or newer. The package is ESM-only.

## Usage

```js
import { bot } from 'yurst';

bot.command('ping', 'Connection check', (ctx) => ctx.reply('pong'));

bot.callback('menu:open', async (ctx) => {
  await ctx.answer();
  await ctx.replace('Menu opened');
});

await bot.start();
```

Create a `.env` file with your bot token:

```dotenv
TOKEN=b.your_bot_token
```

Then run:

```sh
node --env-file=.env index.js
```

## Public exports

| Export | Description |
| --- | --- |
| `bot` | Bot singleton: `command()`, `callback()`, `on()`, `start()`, `me` |
| `ButtonsBuilder` | Builder for inline button rows |
| `api` | Low-level HTTP client for the Yurba REST API |
| `L` | Logger (`debug`, `info`, `warn`, `error`) |
| `fmtUptime` | Formats process uptime |
| `stats` | Runtime counters |

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `TOKEN` | required | Bot token (`b.xxxx`) |
| `MODE` | `ws` | Transport: `ws` or `poll` |
| `YURST` | — | Set to `dev` for verbose logs |
| `YURST_LOG` | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `LOG_FILE` | — | Append logs to a file |
| `WS_IDLE_MS` | `0` | WebSocket idle watchdog |
| `WS_MAX_FAILS` | `5` | Failed connections before polling fallback |
| `MAX_TEXT` | `4000` | Message chunk size |
| `API_TIMEOUT_MS` | `10000` | HTTP timeout |
| `POLL_TIMEOUT_S` | `30` | Long-polling timeout |
| `YURST_ENV_FILE` | — | Extra `.env` path checked first |

## Tests

```sh
npm test
```

## License

[MIT](./LICENSE)
