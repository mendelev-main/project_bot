import 'dotenv/config';
import { Markup, Telegraf } from 'telegraf';

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not configured');
  process.exit(1);
}

const bot = new Telegraf(token);

function normalizePhone(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `375${digits.slice(1)}`;
  if (digits.length === 9) digits = `375${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return `+${digits}`;
}

const contactKeyboard = () => Markup.keyboard([
  [Markup.button.contactRequest('📱 Подтвердить номер')],
]).resize().oneTime();

async function showStart(ctx) {
  await ctx.reply(
    'Здравствуйте! 👋\n\nПодтвердите номер телефона, привязанный к вашему Telegram.',
    contactKeyboard(),
  );
}

bot.start(showStart);

bot.help(async (ctx) => {
  await ctx.reply('Нажмите «📱 Подтвердить номер» и разрешите Telegram передать ваш номер.', contactKeyboard());
});

bot.on('contact', async (ctx) => {
  const contact = ctx.message.contact;
  const senderId = ctx.from?.id;

  if (!contact.user_id || contact.user_id !== senderId) {
    await ctx.reply('❌ Можно подтвердить только свой номер.', contactKeyboard());
    return;
  }

  const phone = normalizePhone(contact.phone_number);
  if (!phone) {
    await ctx.reply('❌ Не удалось проверить номер. Попробуйте ещё раз.', contactKeyboard());
    return;
  }

  console.log(JSON.stringify({
    event: 'phone_verified',
    telegramUserId: senderId,
    phone,
    timestamp: new Date().toISOString(),
  }));

  await ctx.reply(
    `✅ Номер подтверждён\n${phone}`,
    Markup.removeKeyboard(),
  );
});

bot.on('text', async (ctx) => {
  if (ctx.message?.text?.startsWith('/')) return;
  await ctx.reply('Для продолжения подтвердите свой номер.', contactKeyboard());
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
