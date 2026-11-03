
<div align="center">
  <br />
  <p>
    <h1> Yurst </h1>
    A lightweight Node.js library for building Yurba.one bots
  </p>
  <br />
  <p align="center">
    <a href="https://github.com/rqxsts/yurst/stargazers"><img src="https://img.shields.io/github/stars/rqxsts/yurst?colorA=363a4f&colorB=b7bdf8&style=for-the-badge" alt="GitHub stars"/></a>  ˖
    <a href="https://github.com/rqxsts/yurst/issues"><img src="https://img.shields.io/github/issues/rqxsts/yurst?colorA=363a4f&colorB=f5a97f&style=for-the-badge" alt="GitHub issues"/></a>  ˖
    <a href="https://github.com/rqxsts/yurst/contributors"><img src="https://img.shields.io/github/contributors/rqxsts/yurst?colorA=363a4f&colorB=a6da95&style=for-the-badge" alt="GitHub contributors"/></a>
  </p>
  <p>
    <a href="https://www.npmjs.com/package/yurst.js"><img src="https://img.shields.io/npm/v/yurst.js.svg?colorA=363a4f&colorB=a6da95&style=flat-square" alt="npm version"/></a>
  </p>
</div>

## Requirements

- Node.js 22+
- A Yurba bot token (`b.xxxx`)

## Quick start

```sh
npm install yurst.js
```

Create `.env`:

```dotenv
TOKEN=b.your_bot_token
```

```js
import { bot } from 'yurst.js';

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
| `Yurst/` | The published `yurst.js` package |
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
