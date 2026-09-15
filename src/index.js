import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Markup, Telegraf } from 'telegraf';

const token = process.env.TELEGRAM_BOT_TOKEN;
const port = Number(process.env.PORT || 3000);
const publicUrl = process.env.PUBLIC_URL?.replace(/\/$/, '');

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not configured');
  process.exit(1);
}

const bot = new Telegraf(token);
const uiMessages = new Map();
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.listen(port, '0.0.0.0', () => console.log(`Web server listening on ${port}`));

function normalizePhone(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `375${digits.slice(1)}`;
  if (digits.length === 9) digits = `375${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return `+${digits}`;
}

async function safeDelete(ctx, messageId) {
  if (!messageId) return;
  try { await ctx.telegram.deleteMessage(ctx.chat.id, messageId); } catch {}
}

async function replaceUi(ctx, text, extra = {}) {
  const key = ctx.chat?.id;
  const previous = key ? uiMessages.get(key) : null;
  if (previous) await safeDelete(ctx, previous);
  const message = await ctx.reply(text, extra);
  if (key) uiMessages.set(key, message.message_id);
  return message;
}

function homeKeyboard() {
  const rows = [];
  if (publicUrl) {
    rows.push([Markup.button.webApp('📱 Подтвердить номер', `${publicUrl}/verify.html`)]);
  } else {
    rows.push([Markup.button.callback('📱 Подтвердить номер', 'miniapp_not_ready')]);
  }
  rows.push([Markup.button.callback('ℹ️ О боте', 'about')]);
  return Markup.inlineKeyboard(rows);
}

async function showHome(ctx) {
  const firstName = ctx.from?.first_name;
  const hello = firstName ? `Здравствуйте, ${firstName}!` : 'Здравствуйте!';
  await replaceUi(
    ctx,
    `◉ ПРОЕКТ\n\n${hello}\n\nСервисы Проекта в Telegram.`,
    homeKeyboard(),
  );
}

bot.start(showHome);

bot.help(async (ctx) => {
  await replaceUi(
    ctx,
    'ℹ️ О БОТЕ\n\nБот «Проект» предоставляет быстрый доступ к сервисам Проекта прямо в Telegram.',
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
    'ℹ️ О БОТЕ\n\nБот «Проект» предоставляет быстрый доступ к сервисам Проекта прямо в Telegram.',
    Markup.inlineKeyboard([[Markup.button.callback('‹ Назад', 'home')]]),
  );
});

bot.action('miniapp_not_ready', async (ctx) => {
  await ctx.answerCbQuery('Сервис подтверждения настраивается.', { show_alert: true });
});

// requestContact() in the Mini App makes Telegram send the user's own contact to this bot.
bot.on('contact', async (ctx) => {
  const contact = ctx.message.contact;
  const senderId = ctx.from?.id;

  if (!contact.user_id || contact.user_id !== senderId) {
    await replaceUi(
      ctx,
      '⚠️ Номер не подтверждён.\n\nМожно подтвердить только свой номер телефона.',
      Markup.inlineKeyboard([[Markup.button.callback('‹ В меню', 'home')]]),
    );
    return;
  }

  const phone = normalizePhone(contact.phone_number);
  if (!phone) {
    await replaceUi(
      ctx,
      '⚠️ Не удалось распознать номер телефона.',
      Markup.inlineKeyboard([[Markup.button.callback('‹ В меню', 'home')]]),
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
    `✅ Номер подтверждён\n\n${phone}`,
    Markup.inlineKeyboard([[Markup.button.callback('Готово', 'home')]]),
  );
});

bot.on('text', async (ctx) => {
  if (ctx.message?.text?.startsWith('/')) return;
  await ctx.reply('Используйте меню бота.', homeKeyboard());
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
