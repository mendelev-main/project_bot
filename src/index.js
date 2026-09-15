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
    // A message may already be gone or may be too old to delete.
  }
}

async function cleanupPreviousUi(ctx) {
  const key = chatKey(ctx);
  if (!key) return;
  const previous = uiMessages.get(key);
  if (previous) await safeDelete(ctx, previous);
}

async function sendUi(ctx, text, extra = {}) {
  await cleanupPreviousUi(ctx);
  const message = await ctx.reply(text, extra);
  uiMessages.set(chatKey(ctx), message.message_id);
  return message;
}

async function typing(ctx, delay = 350) {
  try {
    await ctx.sendChatAction('typing');
    await new Promise((resolve) => setTimeout(resolve, delay));
  } catch {
    // Typing status is cosmetic and must never break the flow.
  }
}

const mainMenu = () => Markup.inlineKeyboard([
  [Markup.button.callback('📱 Подтвердить номер', 'verify_phone')],
  [Markup.button.callback('ℹ️ Помощь', 'help')],
]);

async function showWelcome(ctx) {
  await typing(ctx);
  const firstName = ctx.from?.first_name;
  const greeting = firstName ? `Привет, ${firstName}.` : 'Привет.';
  await sendUi(
    ctx,
    `◉ ПРОЕКТ\n\n${greeting}\n\nВыберите действие:`,
    mainMenu(),
  );
}

bot.start(async (ctx) => {
  // Remove the old persistent reply keyboard from previous bot versions.
  await ctx.reply('Обновляю интерфейс…', Markup.removeKeyboard())
    .then((message) => safeDelete(ctx, message.message_id));
  await safeDelete(ctx, ctx.message?.message_id);
  await showWelcome(ctx);
});

bot.help(async (ctx) => {
  await safeDelete(ctx, ctx.message?.message_id);
  await typing(ctx);
  await sendUi(
    ctx,
    'ℹ️ ПОДТВЕРЖДЕНИЕ НОМЕРА\n\nTelegram передаст номер только после вашего разрешения. Для подтверждения принимается только ваш собственный контакт.',
    Markup.inlineKeyboard([[Markup.button.callback('‹ Назад', 'home')]]),
  );
});

bot.command('status', async (ctx) => {
  await safeDelete(ctx, ctx.message?.message_id);
  await typing(ctx, 200);
  await sendUi(
    ctx,
    '● ONLINE\n\nСистема работает нормально.',
    Markup.inlineKeyboard([[Markup.button.callback('‹ Назад', 'home')]]),
  );
});

bot.action('home', async (ctx) => {
  await ctx.answerCbQuery();
  await showWelcome(ctx);
});

bot.action('help', async (ctx) => {
  await ctx.answerCbQuery();
  await typing(ctx);
  await sendUi(
    ctx,
    'ℹ️ ПОДТВЕРЖДЕНИЕ НОМЕРА\n\nНажмите «Продолжить», затем разрешите Telegram отправить номер телефона, привязанный к вашему аккаунту.\n\nОбычный номер, отправленный текстом, не считается подтверждением.',
    Markup.inlineKeyboard([
      [Markup.button.callback('Продолжить →', 'verify_phone')],
      [Markup.button.callback('‹ Назад', 'home')],
    ]),
  );
});

bot.action('verify_phone', async (ctx) => {
  await ctx.answerCbQuery();
  await typing(ctx);

  // Telegram can request a contact only through a reply-keyboard button.
  // Make it one-time and immediately remove it after the contact arrives.
  const contactKeyboard = Markup.keyboard([
    [Markup.button.contactRequest('Поделиться номером')],
  ]).resize().oneTime();

  await sendUi(
    ctx,
    '◌ ПОДТВЕРЖДЕНИЕ\n\nНа один шаг внизу появится системная кнопка Telegram. Нажмите её и подтвердите передачу своего номера.',
    contactKeyboard,
  );
});

bot.on('contact', async (ctx) => {
  const contact = ctx.message.contact;
  const senderId = ctx.from?.id;

  await typing(ctx, 450);

  // Hide the temporary contact keyboard immediately.
  const cleanup = await ctx.reply('Проверяю…', Markup.removeKeyboard());
  await safeDelete(ctx, cleanup.message_id);
  await safeDelete(ctx, ctx.message?.message_id);

  if (!contact.user_id || contact.user_id !== senderId) {
    await sendUi(
      ctx,
      '⚠️ НЕ ПОДТВЕРЖДЕНО\n\nМожно подтвердить только номер, принадлежащий вашему Telegram-аккаунту.',
      Markup.inlineKeyboard([
        [Markup.button.callback('Повторить', 'verify_phone')],
        [Markup.button.callback('‹ В меню', 'home')],
      ]),
    );
    return;
  }

  const phone = normalizePhone(contact.phone_number);
  if (!phone) {
    await sendUi(
      ctx,
      '⚠️ ОШИБКА\n\nНе удалось корректно распознать номер телефона.',
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

  await sendUi(
    ctx,
    `✓ ПОДТВЕРЖДЕНО\n\n${phone}\n\nНомер успешно подтверждён.`,
    Markup.inlineKeyboard([[Markup.button.callback('Готово', 'home')]]),
  );
});

bot.on('text', async (ctx) => {
  // Keep the private bot chat clean: commands are handled above, other text is removed.
  if (ctx.message?.text?.startsWith('/')) return;
  await safeDelete(ctx, ctx.message?.message_id);
  await typing(ctx, 200);
  await sendUi(
    ctx,
    'Введите действие кнопками ниже.',
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
