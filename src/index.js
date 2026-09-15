import 'dotenv/config';
import { Markup, Telegraf } from 'telegraf';

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not configured');
  process.exit(1);
}

const bot = new Telegraf(token);

const mainKeyboard = Markup.keyboard([
  ['📱 Подтвердить номер'],
  ['ℹ️ Помощь'],
]).resize();

const contactKeyboard = Markup.keyboard([
  [Markup.button.contactRequest('📱 Поделиться номером телефона')],
  ['⬅️ Назад'],
]).resize().oneTime();

function normalizePhone(phone) {
  if (!phone) return null;

  let digits = String(phone).replace(/\D/g, '');

  // Convenient normalization for Belarusian numbers entered/received locally.
  if (digits.length === 11 && digits.startsWith('8')) {
    digits = `375${digits.slice(1)}`;
  }

  if (digits.length === 9) {
    digits = `375${digits}`;
  }

  if (digits.length < 10 || digits.length > 15) return null;

  return `+${digits}`;
}

async function showWelcome(ctx) {
  const firstName = ctx.from?.first_name;
  const greeting = firstName ? `Привет, ${firstName}!` : 'Привет!';

  await ctx.reply(
    `${greeting}\n\nЭто бот «Проект». Здесь можно подтвердить номер телефона.`,
    mainKeyboard,
  );
}

bot.start(showWelcome);

bot.help(async (ctx) => {
  await ctx.reply(
    'Нажмите «Подтвердить номер», затем поделитесь своим номером через специальную кнопку Telegram. Обычное текстовое сообщение с номером не считается подтверждением.',
    mainKeyboard,
  );
});

bot.command('status', async (ctx) => {
  await ctx.reply('✅ Бот работает.', mainKeyboard);
});

bot.hears('ℹ️ Помощь', async (ctx) => {
  await ctx.reply(
    'Для подтверждения номера нажмите «Подтвердить номер» и затем «Поделиться номером телефона». Telegram попросит ваше разрешение перед отправкой контакта.',
    mainKeyboard,
  );
});

bot.hears('📱 Подтвердить номер', async (ctx) => {
  await ctx.reply(
    'Нажмите кнопку ниже, чтобы передать номер телефона, привязанный к вашему Telegram-аккаунту.',
    contactKeyboard,
  );
});

bot.hears('⬅️ Назад', async (ctx) => {
  await ctx.reply('Главное меню', mainKeyboard);
});

bot.on('contact', async (ctx) => {
  const contact = ctx.message.contact;
  const senderId = ctx.from?.id;

  // Telegram includes user_id for a contact that represents a Telegram user.
  // For verification we accept only the sender's own contact.
  if (!contact.user_id || contact.user_id !== senderId) {
    await ctx.reply(
      '❌ Можно подтвердить только свой номер телефона. Используйте кнопку «Поделиться номером телефона».',
      mainKeyboard,
    );
    return;
  }

  const phone = normalizePhone(contact.phone_number);

  if (!phone) {
    await ctx.reply(
      '❌ Не удалось распознать номер телефона. Попробуйте ещё раз.',
      mainKeyboard,
    );
    return;
  }

  console.log(
    JSON.stringify({
      event: 'phone_verified',
      telegramUserId: senderId,
      phone,
      timestamp: new Date().toISOString(),
    }),
  );

  await ctx.reply(
    `✅ Номер подтверждён\n\n${phone}`,
    Markup.removeKeyboard(),
  );

  await ctx.reply('Готово. Вы можете продолжить работу с ботом.', mainKeyboard);
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
