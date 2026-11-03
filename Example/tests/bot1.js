import { api, bot, fmtUptime, L } from '../../Yurst/index.js';

function loadAttachments() {
  const raw = process.env.YURST_TEST_ATTACHMENTS;
  if (!raw) return undefined;

  const attachments = JSON.parse(raw);
  if (!Array.isArray(attachments)) {
    throw new TypeError('YURST_TEST_ATTACHMENTS must be a JSON array');
  }

  for (const attachment of attachments) {
    if (
      typeof attachment?.item?.Code !== 'boolean' ||
      !Number.isInteger(attachment?.item?.ID) ||
      typeof attachment?.type !== 'string'
    ) {
      throw new TypeError(
        'Each attachment must have item.Code, item.ID, and type fields',
      );
    }
  }

  return attachments;
}

const attachments = loadAttachments();

bot.command('info', 'Test bot replies and buttons in this chat', async (ctx) => {
  const startedAt = Date.now();
  const meResponse = await api('GET', '/bot/me');
  const response = await ctx.send(
    [
      `**${bot.me.name ?? 'Yurst test bot'}**`,
      'Channel delivery test',
      `Dialog: ${ctx.dialog ?? '?'}`,
      `Dialog type: ${ctx.message.Dialog?.Type ?? '?'}`,
      `Message: ${ctx.message.ID ?? '?'}`,
      `Bot API: ${meResponse.status}`,
      `Uptime: ${fmtUptime()}`,
      `Node: ${process.version}`,
    ].join('\n'),
    {
      buttons: [
        [
          { text: 'Test callback', data: 'info:channel', style: 'success' },
          { text: 'Open Yurba', url: 'https://yurba.one' },
        ],
        [
          { text: 'Copy dialog ID', copy: ctx.dialog ?? '' },
          { text: 'Run /info', command: '/info' },
        ],
      ],
    },
  );

  if (response?.ok) {
    L.info('test', `info message sent to ${ctx.dialog} (${ctx.message.Dialog?.Type ?? 'unknown'})`, {
      ms: Date.now() - startedAt,
    });
  } else {
    L.error('test', `info send failed (${response?.status ?? 0})`, response?.data);
  }
});

bot.callback('info:channel', async (ctx) => {
  await ctx.answer('Callback received');
  const response = await ctx.reply(
    `Callback works\nDialog: ${ctx.dialog ?? '?'}\nUser: ${ctx.user?.Name ?? '?'}`,
  );

  if (!response?.ok) {
    L.error('test', `callback reply failed (${response?.status ?? 0})`, response?.data);
  }
});

bot.on('inline', async (ctx) => {
  const query = ctx.query.trim();
  const queryId = ctx.update.Inline?.ID ?? ctx.update.ID;
  if (queryId == null) {
    L.error('test', 'Inline update did not contain a query ID');
    return;
  }

  const result = {
    ID: 'yurst-full-test',
    Title: 'Yurst full payload test',
    Description: 'Tests Description, Text, and Markup fields',
    Text: query
      ? `Full payload test for query: ${query}`
      : 'This inline result was sent with the raw API payload.',
    Markup: {
      Inline: [[
        { Text: 'Open Yurba', Url: 'https://yurba.one' },
        { Text: 'Copy test', Copy: 'Yurst inline payload test' },
      ]],
      Keyboard: [[{ Text: 'Reply keyboard test' }]],
      Once: true,
      Placeholder: 'Yurst test keyboard',
    },
  };

  if (attachments?.length) result.Attachments = attachments;

  const response = await api('POST', `/bot/inline/${queryId}`, {
    results: [result],
  });

  if (!response.ok) {
    L.error('test', `Full inline response failed (${response.status})`, response.data);
    return;
  }

  L.info('test', `Full inline response sent for query ${queryId}`, {
    attachments: attachments?.length ?? 0,
  });
});

L.info('test', 'Inline test bot started', {
  attachmentCount: attachments?.length ?? 0,
});

await bot.start();