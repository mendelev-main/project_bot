import 'dotenv/config';
import { Markup, Telegraf } from 'telegraf';

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not configured');
  process.exit(1);
}

const bot = new Telegraf(token);
const uiMessages = new Map();

function normalizePhone(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `375${digits.slice(1)}`;
  if (digits.length === 9) digits = `375${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return `+${digits}`;
}

function chatKey(ctx) {
  return ctx.chat?.id;
}

async function safeDelete(ctx, messageId) {
  if (!messageId) return;
  try {
    await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
  } catch {
    // Deletion is best-effort only.
  }
}

async function replaceUi(ctx, text, extra = {}) {
  const key = chatKey(ctx);
  const previous = key ? uiMessages.get(key) : null;
  if (previous) await safeDelete(ctx, previous);
  const message = await ctx.reply(text, extra);
  if (key) uiMessages.set(key, message.message_id);
  return message;
}

const mainMenu = () => Markup.inlineKeyboard([
  [Markup.button.callback('📱 Подтвердить номер', 'verify_phone')],
  [Markup.button.callback('ℹ️ О боте', 'about')],
]);

async function showHome(ctx) {
  const firstName = ctx.from?.first_name;
  const hello = firstName ? `Здравствуйте, ${firstName}!` : 'Здравствуйте!';

  await replaceUi(
    ctx,
    `◉ ПРОЕКТ\n\n${hello}\n\nУдобный сервис для взаимодействия с Проектом прямо в Telegram.\n\nЗдесь вы можете подтвердить свой номер телефона и пользоваться доступными сервисами.`,
    mainMenu(),
  );
}

bot.start(async (ctx) => {
  // Remove a persistent keyboard left by older bot versions.
  const cleanup = await ctx.reply(' ', Markup.removeKeyboard());
  await safeDelete(ctx, cleanup.message_id);
  await showHome(ctx);
});

bot.help(async (ctx) => {
  await replaceUi(
    ctx,
    'ℹ️ О БОТЕ\n\n«Проект» — сервис в Telegram для быстрого доступа к функциям Проекта.\n\nСейчас доступно подтверждение номера телефона.',
    Markup.inlineKeyboard([[Markup.button.callback('‹ Назад', 'home')]]),
  );
});

bot.command('status', async (ctx) => {
  await replaceUi(
    ctx,
    '● ONLINE\n\nВсе системы работают.',
    Markup.inlineKeyboard([[Markup.button.callback('‹ Назад', 'home')]]),
  );
});

bot.action('home', async (ctx) => {
  await ctx.answerCbQuery();
  await showHome(ctx);
});

bot.action('about', async (ctx) => {
  await ctx.answerCbQuery();
  await replaceUi(
    ctx,
    'ℹ️ О БОТЕ\n\n«Проект» — сервис в Telegram для быстрого доступа к функциям Проекта.\n\nСейчас доступно подтверждение номера телефона.',
    Markup.inlineKeyboard([[Markup.button.callback('‹ Назад', 'home')]]),
  );
});

bot.action('verify_phone', async (ctx) => {
  await ctx.answerCbQuery();

  const contactKeyboard = Markup.keyboard([
    [Markup.button.contactRequest('📱 Поделиться номером')],
  ]).resize().oneTime();

  await replaceUi(
    ctx,
    '📱 ПОДТВЕРЖДЕНИЕ НОМЕРА\n\nПоделитесь номером телефона, привязанным к вашему Telegram-аккаунту.',
    contactKeyboard,
  );
});

bot.on('contact', async (ctx) => {
  const contact = ctx.message.contact;
  const senderId = ctx.from?.id;

  const cleanup = await ctx.reply(' ', Markup.removeKeyboard());
  await safeDelete(ctx, cleanup.message_id);

  if (!contact.user_id || contact.user_id !== senderId) {
    await replaceUi(
      ctx,
      '⚠️ Номер не подтверждён\n\nМожно подтвердить только свой номер телефона.',
      Markup.inlineKeyboard([
        [Markup.button.callback('Повторить', 'verify_phone')],
        [Markup.button.callback('‹ В меню', 'home')],
      ]),
    );
    return;
  }

  const phone = normalizePhone(contact.phone_number);
  if (!phone) {
    await replaceUi(
      ctx,
      '⚠️ Не удалось распознать номер телефона.',
      Markup.inlineKeyboard([
        [Markup.button.callback('Повторить', 'verify_phone')],
        [Markup.button.callback('‹ В меню', 'home')],
      ]),
    );
    return;
  }

  console.log(JSON.stringify({
    event: 'phone_verified',
    telegramUserId: senderId,
    phone,
    timestamp: new Date().toISOString(),
  }));

  await replaceUi(
    ctx,
    `✓ НОМЕР ПОДТВЕРЖДЁН\n\n${phone}`,
    Markup.inlineKeyboard([[Markup.button.callback('В главное меню', 'home')]]),
  );
});

bot.on('text', async (ctx) => {
  if (ctx.message?.text?.startsWith('/')) return;
  await ctx.reply(
    'Используйте меню бота.',
    mainMenu(),
  );
});

bot.catch((error, ctx) => {
  console.error('Bot error', {
    updateId: ctx.update?.update_id,
    error: error instanceof Error ? error.message : String(error),
  });
});

const shutdown = (signal) => {
  console.log(`Received ${signal}, stopping bot...`);
  bot.stop(signal);
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

bot.launch({ dropPendingUpdates: false })
  .then(() => console.log('Project bot started'))
  .catch((error) => {
    console.error('Failed to start bot', error);
    process.exit(1);
  });
