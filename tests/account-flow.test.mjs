import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { normalizeBelarusPhone, accountReturnUrl } from '../src/account-login.js';
import { verificationPayload } from '../src/verification-payload.js';

test('bot accepts own Belarus contact, confirms phone-free login and returns to account', async () => {
  const handlers = {}, replies = [], callbacks = [];
  const markup = {
    keyboard: () => ({ resize() { return this; }, oneTime() { return this; } }),
    removeKeyboard: () => ({}), inlineKeyboard: buttons => ({ buttons }),
    button: { contactRequest: text => ({ text, request_contact: true }), url: (text, url) => ({ text, url }) },
  };
  class Telegraf {
    constructor() { this.telegram = { setChatMenuButton: async () => {} }; }
    start(fn) { handlers.start = fn; } help() {} catch() {} on(event, fn) { handlers[event] = fn; }
    launch() { return Promise.resolve(); }
  }
  const context = {
    Markup: markup, Telegraf, normalizePhone: normalizeBelarusPhone, accountReturnUrl, verificationPayload,
    registerOwnerHandlers: () => Object.assign(async () => false, { showMenu: async () => false }),
    console: { log() {}, error() {} }, URL, Date, Map,
    process: { env: { TELEGRAM_BOT_TOKEN: 'test-only', VERIFICATION_API_URL: 'https://api.example.test', OWNER_BOT_SHARED_SECRET: 'test-only' }, once() {} },
    setInterval: () => ({ unref() {} }),
    fetch: async (url, options) => {
      if (!options) return { ok: true, json: async () => ({ phone: null, status: 'PENDING', expiresAt: new Date(Date.now() + 300_000).toISOString() }) };
      callbacks.push({ url, options });
      return { ok: true, json: async () => ({ ok: true, returnUrl: 'https://project-dubrovno.store/account/' }) };
    },
  };
  vm.runInNewContext((await readFile(new URL('../src/index.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, ''), context);
  const ctx = {
    from: { id: 123, username: 'test_user' }, startPayload: 'a'.repeat(43),
    reply: async (text, keyboard) => replies.push({ text, keyboard }),
    message: { contact: { user_id: 999, phone_number: '375291234567' } },
  };
  await handlers.start(ctx);
  await handlers.contact(ctx);
  assert.match(replies.at(-1).text, /только свой номер/);
  assert.equal(callbacks.length, 0);
  ctx.message.contact = { user_id: 123, phone_number: '+79123456789' };
  await handlers.contact(ctx);
  assert.match(replies.at(-1).text, /белорусский номер/);
  assert.equal(callbacks.length, 0);
  ctx.message.contact.phone_number = '375291234567';
  await handlers.contact(ctx);
  assert.equal(callbacks.length, 1);
  assert.equal(callbacks[0].options.headers['X-Owner-Bot-Secret'], 'test-only');
  assert.deepEqual(JSON.parse(callbacks[0].options.body), { phone: '+375291234567', telegramUserId: 123, telegramUsername: 'test_user' });
  assert.equal(replies.at(-1).keyboard.buttons[0].url, 'https://project-dubrovno.store/account/');
  await handlers.contact(ctx);
  assert.equal(callbacks.length, 1);
});
