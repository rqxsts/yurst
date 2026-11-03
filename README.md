# Yurst

Yurst is a small ESM library for building [Yurba.one](https://yurba.one) bots with Node.js 22 or newer. It provides commands, inline buttons, reply keyboards, callback queries, inline mode, WebSocket updates and a long-polling fallback.

## Requirements

- Node.js 22+
- A Yurba bot token (`b.xxxx`)

## Quick start

```sh
npm install yurst
```

Create `.env`:

```dotenv
TOKEN=b.your_bot_token
```

```js
import { bot } from 'yurst';

bot.command('ping', 'Connection check', (ctx) => ctx.reply('pong'));
bot.command('help', 'List of commands', (ctx) => ctx.reply(ctx.help()));

await bot.start();
```

Run it:

```sh
node --env-file=.env index.js
```

## Repository layout

| Path | Purpose |
| --- | --- |
| `Yurst/` | The published `yurst` package |
| `Example/` | Demo bot (`yarix`) using the package |
| `Docs/` | Next.js + Fumadocs documentation site |

## Development

This repository uses pnpm workspaces.

```sh
pnpm install
pnpm test          # unit tests for the library
pnpm dev           # run the example bot in watch mode
pnpm docs:dev      # run the documentation site
```

## License

[MIT](./LICENSE)
