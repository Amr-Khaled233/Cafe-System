import crypto from 'node:crypto';

/** الرابط صالح نص ساعة — طويل كفاية إن الموظف يلحق، وقصير كفاية إنه ما يفضلش شغال */
export const RESET_TTL_MINUTES = Number(process.env.RESET_TTL_MINUTES || 30);

/**
 * بيولّد توكن إعادة تعيين.
 * بنرجّع الأصل (بيتبعت في الإيميل ومابيتخزّنش) والهاش (اللي بيتخزّن).
 * لو قاعدة البيانات اتسربت، التوكنات اللي فيها ماتنفعش تستخدم.
 */
export function createResetToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return {
    token,
    hash: hashResetToken(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
  };
}

/** SHA-256 كفاية هنا: التوكن عشوائي 256 بت، مفيش هجوم قاموس عليه */
export function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** مقارنة ثابتة الزمن — مانسربش معلومة من فرق التوقيت */
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * الرابط اللي بيتبعت في الإيميل.
 * APP_URL هو الأصل الصح في الإنتاج؛ ولو مش متظبط بناخد أصل الريكوست.
 */
export function resetLink(req, token) {
  const base = (process.env.APP_URL || '').replace(/\/+$/, '') || originOf(req);
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

function originOf(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return `${proto}://${host}`;
}
