import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBelarusPhone, accountReturnUrl } from '../src/account-login.js';

test('accepts only full international Belarus contacts, with or without plus', () => {
  for (const phone of ['375291234567', '+375291234567', '+375 (29) 123-45-67']) assert.equal(normalizeBelarusPhone(phone), '+375291234567');
  for (const phone of ['+79123456789', '+380501234567', '291234567', '80291234567', '+37529123', '+3752912345678', 'abc375291234567', '++375291234567']) assert.equal(normalizeBelarusPhone(phone), null);
});
test('only returns to the configured site account and discards URL extras', () => {
  const site = 'https://project-dubrovno.store/';
  assert.equal(accountReturnUrl(`${site}account/?ignored=1#hash`, site), `${site}account/`);
  for (const url of ['https://evil.test/account/', `${site}other/`, 'javascript:alert(1)', `https://user:pass@project-dubrovno.store/account/`, 'http://project-dubrovno.store/account/']) assert.equal(accountReturnUrl(url, site), null);
  assert.equal(accountReturnUrl('http://127.0.0.1:3000/account/', 'http://127.0.0.1:3000'), 'http://127.0.0.1:3000/account/');
});
