// Telegram may send an international contact without the leading '+'.
export function normalizeBelarusPhone(value) {
  const raw = String(value || '').trim();
  if (!/^\+?[\d\s()-]+$/.test(raw)) return null;
  const digits = raw.replace(/[^\d]/g, '');
  return /^375\d{9}$/.test(digits) ? `+${digits}` : null;
}

export function accountReturnUrl(value, siteUrl) {
  try {
    const url = new URL(value);
    const site = new URL(siteUrl);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.origin !== site.origin || url.pathname !== '/account/' || url.username || url.password) return null;
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
    url.search = ''; url.hash = '';
    return url.href;
  } catch { return null; }
}
