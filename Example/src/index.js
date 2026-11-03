import { bot, api, fmtUptime, L } from 'yurst';

const cap = (s) => s[0].toUpperCase() + s.slice(1);

// ─── commands: short form ────────────────────────────────────────────────────

bot.command('ping', 'Connection check', (ctx) => ctx.reply('pong'));

bot.command('help', 'List of commands', (ctx) => ctx.reply(ctx.help()));

const isAccessDenied = (response) =>
  response.status === 403 && response.data?.detail === 'access_denied';

bot.command('clear', 'Delete 1–100 recent messages', async (ctx) => {
  const countText = ctx.args.trim();
  const count = Number(countText);
  if (!/^\d+$/.test(countText) || count < 1 || count > 100) {
    return ctx.reply('Usage: /clear <1-100>');
  }

  if (!ctx.dialog || !ctx.message.ID) {
    return ctx.reply('Could not identify this dialog or command message.');
  }

  const history = await api(
    'GET',
    `/dialogs/${ctx.dialog}/messages?last_id=${encodeURIComponent(ctx.message.ID)}`,
  );
  if (!history.ok || !Array.isArray(history.data)) {
    if (isAccessDenied(history)) {
      return ctx.reply('Цьому акаунту не дозволено переглядати повідомлення: немає потрібних прав.');
    }
    return ctx.reply(`Could not load messages (HTTP ${history.status}).`);
  }

  const messageIds = history.data
    .map((message) => message.ID)
    .filter((id) => id && id !== ctx.message.ID)
    .slice(0, count);

  if (!messageIds.length) return ctx.reply('No messages to delete.');

  let deleted = 0;
  let accessDenied = false;
  let failureStatus;
  for (const messageId of messageIds) {
    const result = await api(
      'DELETE',
      `/dialogs/messages/${encodeURIComponent(messageId)}?scope=everyone`,
    );
    if (result.ok) {
      deleted++;
    } else if (isAccessDenied(result)) {
      accessDenied = true;
    } else {
      failureStatus ??= result.status;
    }
  }

  let summary = `Видалено ${deleted} із ${messageIds.length} повідомлень.`;
  if (accessDenied) {
    summary += ' Цьому акаунту не дозволено видаляти деякі повідомлення: немає потрібних прав.';
  } else if (failureStatus) {
    summary += ` Частина запитів завершилася помилкою HTTP ${failureStatus}.`;
  }
  return ctx.reply(summary);
});

bot.command('testdm', 'Test sending a private message', (ctx) =>
  ctx.reply('Press the button to test whether I can message you privately.', {
    buttons: [[{ text: 'Send me a DM', data: 'test:dm', style: 'primary' }]],
  }),
);


bot.callback('test:dm', async (ctx) => {
  const userId = ctx.user?.ID;
  if (userId == null) {
    return ctx.answer({ text: 'Could not identify the user who pressed the button.', alert: true });
  }

  const dialogResponse = await api(
    'POST',
    `/dialogs/private/${userId}`,
    undefined,
    { timeout: 2500 },
  );
  const dialogId = dialogResponse.data?.ID;

  if (!dialogResponse.ok || !dialogId) {
    const detail = dialogResponse.data?.detail ?? `HTTP ${dialogResponse.status}`;
    return ctx.answer({
      text: `Could not open a private chat: ${detail}. Start the bot and try again.`,
      alert: true,
      url: bot.me.invite(),
    });
  }

  const messageResponse = await api(
    'POST',
    `/dialogs/${dialogId}/messages`,
    { text: 'Yurst test: I was able to send you a private message.' },
    { timeout: 2500 },
  );

  if (messageResponse.ok) {
    return ctx.answer({ text: 'Success: the test message was sent to your private chat.', alert: true });
  }

  const detail = messageResponse.data?.detail ?? `HTTP ${messageResponse.status}`;
  return ctx.answer({
    text: `Could not send the private message: ${detail}. Start the bot and try again.`,
    alert: true,
    url: bot.me.invite(),
  });
});

// ─── unregistered command + different button types ───────────────────────────

bot.command({
  name: 'start',
  register: false, // works, but is not listed in Yurba's command list
  run: (ctx) =>
    ctx.reply(`**Hi, ${ctx.user?.Name ?? 'there'}**\nI am **Ani**, your friendly assistant.`, {
      buttons: [
        [{ text: 'Invite', copy: bot.me.invite(`ref_${ctx.user?.ID}`) }],
        [{ text: 'Commands', style: 'danger', command: '/help' }],
      ],
    }),
});

// ─── low-level api, bot.me, fmtUptime ────────────────────────────────────────

bot.command('info', 'Bot information', async (ctx) => {
  const t = Date.now();
  await api('GET', '/bot/me');

  await ctx.reply(
    [
      `**${bot.me.name}**`,
      `Developer: Rqxsts`,
      `Latency: ${Date.now() - t}ms`,
      `Uptime: ${fmtUptime()}`,
      `Node: ${process.version}`,
    ].join('\n'),
    { buttons: [[{ text: 'Open', url: bot.me.invite('/info') }]] },
  );
});

// ─── buttons: data (with styles), url, copy, command ─────────────────────────

const MENU = { primary: false, success: false, danger: true }; // style → alert

bot.command('menu', 'Inline buttons', (ctx) =>
  ctx.reply('Menu', {
    buttons: [
      Object.keys(MENU).map((s) => ({ text: cap(s), data: `menu:${s}`, style: s })),
      [
        { text: 'Website', url: 'https://rqxsts.ashreach.dev' },
        { text: 'Copy link', copy: 'https://rqxsts.ashreach.dev' },
      ],
      [{ text: 'Counter', command: '/counter' }],
    ],
  }),
);

for (const [style, alert] of Object.entries(MENU)) {
  bot.callback(`menu:${style}`, (ctx) => ctx.answer({ text: cap(style), alert }));
}

// ─── counter: callbacks + ctx.replace ────────────────────────────────────────

const counters = new Map();

const counterButtons = (n) => [
  [
    { text: '−', data: 'cnt:dec', style: 'danger' },
    { text: String(n), data: 'cnt:noop' },
    { text: '+', data: 'cnt:inc', style: 'success' },
  ],
  [{ text: 'Reset', data: 'cnt:reset' }],
];

const bump = (fn) => async (ctx) => {
  const messageId = ctx.message?.ID;
  const next = fn(counters.get(messageId) ?? 0);
  if (messageId) counters.set(messageId, next);
  await ctx.answer();
  await ctx.replace(`Counter ${next}`, { buttons: counterButtons(next) });
};

bot.command('counter', 'Simple counter', (ctx) =>
  ctx.reply('Counter 0', { buttons: counterButtons(0) }),
);

bot.callback('cnt:inc', bump((n) => n + 1));
bot.callback('cnt:dec', bump((n) => n - 1));
bot.callback('cnt:reset', bump(() => 0));
bot.callback('cnt:noop', (ctx) =>
  ctx.answer({ text: `Current: ${counters.get(ctx.message?.ID) ?? 0}` }),
);

// ─── scope + reply keyboard + handling text replies ──────────────────────────

const CITIES = ['🏙️ Kyiv', '🏙️ Lviv', '🏙️ Odesa', '🏙️ Alexandria'];

bot.command({
  name: 'city',
  description: 'Choose a city',
  scope: 'private', // private chats only
  run: (ctx) =>
    ctx.reply('Which city?', {
      keyboard: [CITIES.slice(0, 2), CITIES.slice(2), ['Cancel']],
      placeholder: 'Choose a city or tap Cancel',
    }),
});

const testButtons = [
  [{ text: ":animated_coffee: Teadev ком'юніти", url: "https://me.yurba.one/teadev" }],
  [{ text: "Yurba.js", style: "primary", url: "https://yurba.js.org" }, { text: "Yurst", url: "https://github.com/rqxsts/yurst" }]
]
const testButtons2 = [
  [{ text: "Yurba Account", url: "https://me.yurba.one/yurbajs" }],
  [{ text: "Yurba.js", style: "primary", url: "https://yurba.js.org" }, { text: "Yurst", url: "https://github.com/rqxsts/yurst" }]
]

const uktext = `\`🇺🇦 UK\` З виходом Yurba 3.0.0 з’явилося чимало значних змін.

^^^· Повноцінний реліз Yurba.js вийде пізніше, оскільки нововведення повністю змінюють логіку роботи бібліотеки. Через це доведеться суттєво переробити її структуру та внутрішню логіку. Сама бібліотека стане масштабнішою, адже тепер буде розділена на дві частини: клієнтську та ту, що відповідає за ботів.

· Але перед цим буде створена проста бібліотека Yurst, мета якої — спростити створення ботів. Вона міститиме лише функціональність, пов’язану з ботами.^^^

— Основні зміни:

Якщо говорити конкретно про ботів, то було додано:
+ Облікові записи для ботів і токени формату b.token.
+ Спеціальні функції для ботів: кнопки в повідомленнях, клавіатури та inline-режим.

— Детальніше про нововведення

#1. Buttons:
Відтепер боти можуть надсилати повідомлення з кнопками.

Доступні різні типи кнопок:
· Data — передає боту дані після натискання (до 64 байтів).
· URL — відкриває посилання після натискання.
· Copy — копіює заданий у кнопці текст.
· App — відкриває мінізастосунок бота.
· Command — надсилає команду після натискання.

Також кнопки можуть мати різні стилі:
· Primary — білий.
· Danger — червоний.
· Success — зелений.
· Без стилю — сірий.

#2. Keyboard:
Клавіатура має поле placeholder — текст, який відображається в полі введення повідомлення замість стандартного тексту-підказки, наприклад «Повідомлення...». Це поле необов’язкове.
Також клавіатура містить текстові об’єкти. Після натискання на такий об’єкт користувач надсилає відповідний текст, який обробляється як звичайне повідомлення.

#3. Inline:
Коли ви вводите @linkbot, бот може обробляти текст після згадки та показувати різні об’єкти над полем введення повідомлення.
Після натискання на об’єкт надсилається задане вами повідомлення з приміткою «через \`@linkbot\`».
Ця функціональність доступна всюди.

#4. Мінізастосунки
Мінізастосунок відкриває сайт, який ви вказали в налаштуваннях бота.

На цьому все! Усім удачі!`

const entext = `\`🇬🇧 EN\`
Significant changes have been introduced with the release of Yurba 3.0.0.

^^^· The full release of Yurba.js will come later, as the new features completely change the library's underlying logic. As a result, its structure and internal logic will need to be significantly reworked. The library itself will become more extensive, as it will now be split into two parts: the client-side and the bot-side.

· However, before that, a simple library called Yurst will be created to make bot creation easier. It will contain only bot-related functionality.^^^

— Main changes:

Focusing specifically on bots, the following features have been added:
+ Bot accounts and tokens in the \`b.token\` format.
+ Special bot features: message buttons, keyboards, and inline mode.

— A closer look at the new features

#1. Buttons:
Bots can now send messages with buttons.

Several types of buttons are available:
· Data — sends data to the bot when clicked (up to 64 bytes).
· URL — opens a link when clicked.
· Copy — copies the text specified in the button.
· App — opens the bot's mini app.
· Command — sends a command when clicked.

Buttons can also have different styles:
· Primary — white.
· Danger — red.
· Success — green.
· No style — gray.

#2. Keyboard:
The keyboard has a \`placeholder\` field — text displayed in the message input field instead of the default placeholder, such as "Message...". This field is optional.

The keyboard also contains text-based items. When a user clicks one of these items, the corresponding text is sent and processed like a regular message.

#3. Inline:
When you type \`@linkbot\`, the bot can process the text following the mention and display various items above the message input field.

When an item is clicked, the specified message is sent with a note saying "via \`@linkbot\`".

This functionality is available everywhere.

#4. Mini Apps:
A mini app opens the website you specified in the bot's settings.

That's all for now. Good luck, everyone! :animated_coffee:
`

bot.command({
  name: 'test',
  register: false,
  run: async (ctx) => {

    const result = await api(
      'DELETE',
      `/dialogs/messages/${ctx.message.ID}?scope=everyone`,
    );
    if (!result.ok) {
      return ctx.send(`Could not delete the command message: ${result.data?.detail ?? `HTTP ${result.status}`}`);
    }

    await ctx.typing();
    await ctx.send(uktext, { buttons: testButtons });
    return ctx.send(entext, {buttons: testButtons2});
  },
});

bot.on('message', (ctx) => {
  const text = ctx.message.Text ?? '';
  if (text === 'Cancel') return ctx.reply('Cancelled.', { removeKeyboard: true });
  if (CITIES.includes(text)) return ctx.reply(`City: **${text.slice(2)}**`, { removeKeyboard: true });
});

// ─── inline ──────────────────────────────────────────────────────────────────

bot.on('inline', (ctx) => {
  const q = ctx.query.trim();
  if (!q) return;

  const queryId = ctx.update.Inline?.ID ?? ctx.update.ID;
  if (queryId == null) {
    L.error('inline', 'Inline update did not contain a query ID');
    return;
  }


const results = q === '/'
  ? [{
      ID: 'commands',
      Title: 'Commands',
      Description: 'Show the bot command list',
      Text: ctx.help(),
    }]
  : [
      {
        ID: 'echo',
        Title: 'Echo',
        Description: 'Send the query as a message',
        Text: q,
      },
      {
        ID: 'uppercase',
        Title: 'Uppercase',
        Description: 'Convert the query to uppercase',
        Text: q.toUpperCase(),
      },
      {
        ID: 'reverse',
        Title: 'Reverse',
        Description: 'Reverse the query text',
        Text: [...q].reverse().join(''),
      },
    ];


  const n = Number(q);
  if (q.trim() && Number.isFinite(n))
    results.push({
      ID: 'square',
      Title: `${n}² = ${n * n}`,
      Description: 'Calculate the square of the number',
      Text: `${n} × ${n} = ${n * n}`,
    });

  return api('POST', `/bot/inline/${encodeURIComponent(queryId)}`, { results });
});

bot.on('inline_sent', async (update) => {
  if (update.Inline?.Result !== 'echo') return;

  const message = update.Message;
  const messageId = message?.ID;
  const dialogId = message?.Dialog?.ID;
  if (!messageId || !dialogId) {
    L.warn('inline', 'Cannot replace selected Echo result: message or dialog ID is missing', update);
    return;
  }

  const removed = await api(
    'DELETE',
    `/dialogs/messages/${encodeURIComponent(messageId)}?scope=everyone`,
  );
  if (!removed.ok) {
    L.error('inline', `Could not delete selected Echo message (${removed.status})`, removed.data);
    return;
  }

  const text = `Echo processed: ${message.Text ?? ''}`;
  const sent = await api('POST', `/dialogs/${encodeURIComponent(dialogId)}/messages`, {
    text,
    markup: {
      Inline: [[
        { Text: 'Open Yurba', Url: 'https://yurba.one' },
        { Text: 'Copy message', Copy: text },
      ]],
    },
  });

  if (!sent.ok) {
    L.error('inline', `Could not send replacement Echo message (${sent.status})`, sent.data);
  }
});

const alertShowcaseUrl = 'https://yurba.one';

bot.command('testalerts', 'Show Yurba callback notification types', (ctx) =>
  ctx.send('Tap a button to test a Yurba callback response:', {
    buttons: [
      [{ text: 'Silent acknowledgement', data: 'testalerts:silent' }],
      [{ text: 'Toast', data: 'testalerts:toast' }],
      [{ text: 'Modal alert', data: 'testalerts:alert' }],
      [{ text: 'Open URL', data: 'testalerts:url' }],
      [{ text: 'Toast + URL', data: 'testalerts:toast-url' }],
      [{ text: 'Alert + URL', data: 'testalerts:alert-url' }],
    ],
  }),
);

bot.callback('testalerts:silent', (ctx) => ctx.answer());
bot.callback('testalerts:toast', (ctx) => ctx.answer('This is a Yurba toast notification.'));
bot.callback('testalerts:alert', (ctx) =>
  ctx.answer({ text: 'This is a Yurba modal alert.', alert: true }),
);
bot.callback('testalerts:url', (ctx) => ctx.answer({ url: alertShowcaseUrl }));
bot.callback('testalerts:toast-url', (ctx) =>
  ctx.answer({ text: 'Opening Yurba.', url: alertShowcaseUrl }),
);
bot.callback('testalerts:alert-url', (ctx) =>
  ctx.answer({ text: 'Open Yurba?', alert: true, url: alertShowcaseUrl }),
);

bot.command('testbuttons', 'Show button styles and types', async (ctx) => {
  await ctx.send('Button style: default', {
    buttons: [[{ text: 'Default style', data: 'showcase:default' }]],
  });
  await ctx.send('Button style: primary', {
    buttons: [[{ text: 'Primary style', data: 'showcase:primary', style: 'primary' }]],
  });
  await ctx.send('Button style: success', {
    buttons: [[{ text: 'Success style', data: 'showcase:success', style: 'success' }]],
  });
  await ctx.send('Button style: danger', {
    buttons: [[{ text: 'Danger style', data: 'showcase:danger', style: 'danger' }]],
  });
  await ctx.send('Button type: Data', {
    buttons: [[{ text: 'Send data', data: 'showcase:data' }]],
  });
  await ctx.send('Button type: URL', {
    buttons: [[{ text: 'Open Yurst on GitHub', url: 'https://github.com/rqxsts/yurst' }]],
  });
  await ctx.send('Button type: App', {
    buttons: [[{ text: 'Open Mini App', app: 'https://yurba.js.org' }]],
  });
  await ctx.send('Button type: Copy', {
    buttons: [[{ text: 'Copy text', copy: 'Yurst button showcase' }]],
  });
  return ctx.send('Button type: Command', {
    buttons: [[{ text: 'Run /help', command: '/help' }]],
  });
});

bot.command('testkeyboardurl', 'Test URL buttons in a reply keyboard', async (ctx) => {
  const response = await api('POST', `/dialogs/${ctx.dialog}/messages`, {
    text: 'Experimental reply keyboard URL test. Try the button below.',
    replyTo: ctx.message.ID,
    markup: {
      Keyboard: [[{ Text: 'Open Yurba (keyboard)', style: 'primary', Url: 'https://yurba.one' }]],
      Once: true,
    },
  });

  if (!response.ok) {
    const detail = response.data?.detail ?? JSON.stringify(response.data);
    L.error('test', `Reply keyboard URL rejected (${response.status})`, response.data);
    return ctx.send(`Yurba rejected the reply keyboard URL (HTTP ${response.status}): ${detail}`);
  }

  const returnedKeys = response.data?.Markup?.Keyboard?.flat() ?? [];
  const urlRetained = returnedKeys.some((key) => key.Url === 'https://yurba.one');

  if (urlRetained) {
    L.info('test', 'Yurba retained the URL in reply keyboard markup', response.data);
  } else {
    L.warn('test', 'Yurba accepted the request but did not retain the reply keyboard URL', response.data);
  }
});


await bot.start();
