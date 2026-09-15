import 'dotenv/config';
import { Markup, Telegraf } from 'telegraf';

const token = process.env.TELEGRAM_BOT_TOKEN;
const backendUrl = process.env.VERIFICATION_API_URL?.replace(/\/$/, '');
const fallbackReturnUrl = process.env.ORDER_RETURN_URL?.replace(/\/$/, '');
const SESSION_TTL_MS = 5 * 60 * 1000;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not configured');
  process.exit(1);
}

const bot = new Telegraf(token);
const sessions = new Map();

function normalizePhone(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `375${digits.slice(1)}`;
  if (digits.length === 9) digits = `375${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return `+${digits}`;
}

function cleanToken(value) {
  const tokenValue = String(value || '').trim();
  return /^[A-Za-z0-9_-]{20,64}$/.test(tokenValue) ? tokenValue : null;
}

function getStartToken(ctx) {
  return cleanToken(ctx.startPayload);
}

function contactKeyboard() {
  return Markup.keyboard([
    [Markup.button.contactRequest('📱 Подтвердить номер')],
  ]).resize().oneTime();
}

function sessionForUser(userId) {
  const session = sessions.get(userId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(userId);
    return null;
  }
  return session;
}

async function loadVerification(tokenValue) {
  if (!backendUrl) return { token: tokenValue };
  const response = await fetch(`${backendUrl}/api/phone-verification/${encodeURIComponent(tokenValue)}`);
  if (!response.ok) return null;
  const data = await response.json();
  if (!data || data.status !== 'PENDING') return null;
  return data;
}

async function confirmVerification(tokenValue, phone, telegramUserId) {
  if (!backendUrl) return { ok: false };
  const response = await fetch(`${backendUrl}/api/phone-verification/${encodeURIComponent(tokenValue)}/confirm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, telegramUserId }),
  });
  if (!response.ok) return { ok: false };
  return response.json();
}

async function startCheckoutVerification(ctx, tokenValue) {
  let verification;
  try {
    verification = await loadVerification(tokenValue);
  } catch (error) {
    console.error('Verification lookup failed', error);
    await ctx.reply('⚠️ Не удалось проверить ссылку. Попробуйте ещё раз.');
    return;
  }

  if (!verification) {
    await ctx.reply('⌛ Ссылка недействительна или уже использована.');
    return;
  }

  const backendExpiry = Date.parse(verification.expiresAt || '');
  const expiresAt = Number.isFinite(backendExpiry) ? backendExpiry : Date.now() + SESSION_TTL_MS;
  if (expiresAt <= Date.now()) {
    await ctx.reply('⌛ Время подтверждения истекло. Вернитесь к заказу и попробуйте снова.');
    return;
  }

  sessions.set(ctx.from.id, {
    token: tokenValue,
    expectedPhone: normalizePhone(verification.phone),
    expiresAt,
  });

  await ctx.reply('Подтвердите номер телефона.\n\nСсылка действует 5 минут.', contactKeyboard());
}

bot.start(async (ctx) => {
  const tokenValue = getStartToken(ctx);
  if (tokenValue) return startCheckoutVerification(ctx, tokenValue);
  await ctx.reply('Здравствуйте! 👋\n\nПодтвердить номер можно при оформлении заказа на сайте.', Markup.removeKeyboard());
});

bot.help(async (ctx) => {
  const session = sessionForUser(ctx.from.id);
  if (session) return ctx.reply('Нажмите «📱 Подтвердить номер».', contactKeyboard());
  await ctx.reply('Откройте бота через кнопку подтверждения номера на сайте.');
});

bot.on('contact', async (ctx) => {
  const senderId = ctx.from?.id;
  const contact = ctx.message.contact;
  const session = sessionForUser(senderId);

  if (!session) {
    await ctx.reply('⌛ Время подтверждения истекло. Вернитесь к заказу и попробуйте снова.', Markup.removeKeyboard());
    return;
  }
  if (!contact.user_id || contact.user_id !== senderId) {
    await ctx.reply('❌ Можно подтвердить только свой номер.', contactKeyboard());
    return;
  }

  const phone = normalizePhone(contact.phone_number);
  if (!phone) {
    await ctx.reply('❌ Не удалось проверить номер. Попробуйте ещё раз.', contactKeyboard());
    return;
  }
  if (session.expectedPhone && phone !== session.expectedPhone) {
    await ctx.reply('❌ Номер Telegram не совпадает с номером в заказе.', contactKeyboard());
    return;
  }

  let result;
  try {
    result = await confirmVerification(session.token, phone, senderId);
  } catch (error) {
    console.error('Verification confirmation failed', error);
    await ctx.reply('⚠️ Не удалось завершить подтверждение. Попробуйте ещё раз.', contactKeyboard());
    return;
  }

  if (!result?.ok) {
    sessions.delete(senderId);
    await ctx.reply('⌛ Подтверждение недействительно или уже завершено.', Markup.removeKeyboard());
    return;
  }

  sessions.delete(senderId);
  const returnUrl = result.returnUrl || fallbackReturnUrl;
  const keyboard = returnUrl
    ? Markup.inlineKeyboard([[Markup.button.url('Вернуться к заказу', `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}verification=${encodeURIComponent(session.token)}`)]])
    : undefined;

  await ctx.reply('✅ Номер подтверждён.', { ...Markup.removeKeyboard(), ...(keyboard || {}) });
});

bot.on('text', async (ctx) => {
  if (ctx.message?.text?.startsWith('/')) return;
  const session = sessionForUser(ctx.from.id);
  if (session) return ctx.reply('Подтвердите номер кнопкой ниже.', contactKeyboard());
  await ctx.reply('Подтвердить номер можно при оформлении заказа на сайте.');
});

bot.catch((error, ctx) => {
  console.error('Bot error', { updateId: ctx.update?.update_id, error: error instanceof Error ? error.message : String(error) });
});

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of sessions) if (now > session.expiresAt) sessions.delete(userId);
}, 60_000);
cleanupTimer.unref();

const shutdown = signal => { console.log(`Received ${signal}, stopping bot...`); bot.stop(signal); };
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

bot.launch({ dropPendingUpdates: false })
  .then(() => console.log('Project bot started'))
  .catch(error => { console.error('Failed to start bot', error); process.exit(1); });
