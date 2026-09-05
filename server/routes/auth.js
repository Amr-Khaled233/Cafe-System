import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import { authenticate, cookieOptions, signToken } from '../middleware/auth.js';
import { isEmailConfigured, resetPasswordEmail, sendMail } from '../utils/mailer.js';
import { createResetToken, hashResetToken, RESET_TTL_MINUTES, resetLink } from '../utils/resetToken.js';
import { audit } from '../utils/audit.js';
import { wrap, fail } from '../utils/errors.js';

const router = Router();

// hash وهمي بنقارن بيه لما المستخدم مش موجود، عشان زمن الرد يفضل واحد
// سواء الحساب موجود أو لأ — من غير كده الفرق في التوقيت بيكشف الحسابات الصح.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

// 🔒 حد للمحاولات — يمنع تجربة الباسوردات بالجملة
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => fail(res, 'TOO_MANY_ATTEMPTS', 429),
});

// طلبات إعادة التعيين أقل من محاولات الدخول — الإيميل مش مجاني وممكن يتزنّق بيه
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => fail(res, 'TOO_MANY_ATTEMPTS', 429),
});

/** POST /api/auth/login */
router.post(
  '/login',
  loginLimiter,
  wrap(async (req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!username || !password) return fail(res, 'MISSING_CREDENTIALS', 400);

    // نفس الرد للمستخدم الغلط والباسورد الغلط — عشان مايتعرفش الحسابات الموجودة
    const user = await User.findOne({ username }).select('+passwordHash');

    // بنقارن دايماً — حتى لو المستخدم مش موجود — عشان الزمن يفضل ثابت
    const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !user.active || !ok) return fail(res, 'INVALID_CREDENTIALS', 401);

    user.lastLoginAt = new Date();
    await user.save();

    res.cookie('token', signToken(user), cookieOptions());
    res.json({ id: String(user._id), name: user.name, role: user.role, email: user.email || null });
  })
);

/** POST /api/auth/logout */
router.post('/logout', (req, res) => {
  res.clearCookie('token', { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

/** GET /api/auth/me — الواجهة بتنادي عليه عند التحميل عشان تعرف الدور */
router.get(
  '/me',
  authenticate,
  wrap(async (req, res) => {
    res.json({
      id: req.user.id,
      name: req.user.name,
      role: req.user.role,
      currentShiftId: req.user.currentShiftId,
    });
  })
);

/* ================================================================
 *  نسيت الباسورد
 * ============================================================== */

/**
 * POST /api/auth/forgot-password { emailOrUsername }
 *
 * بيرجّع نفس الرد دايماً سواء الحساب موجود أو لأ — عشان الصفحة دي
 * ماتتحوّلش لأداة يعرف بيها حد الحسابات الموجودة عندك.
 */
router.post(
  '/forgot-password',
  resetLimiter,
  wrap(async (req, res) => {
    const input = String(req.body?.emailOrUsername || '').trim().toLowerCase();
    if (!input) return fail(res, 'MISSING_CREDENTIALS', 400);

    // لو الإيميل مش متظبط أصلاً، نقول كده بصراحة — ده مابيكشفش أي حساب
    if (!isEmailConfigured()) return fail(res, 'EMAIL_NOT_CONFIGURED', 503);

    const user = await User.findOne({
      active: true,
      $or: [{ username: input }, { email: input }],
    }).select('+resetTokenHash +resetTokenExpiresAt');

    // الحساب اللي مالوش إيميل مايقدرش يستقبل الرابط
    if (user && user.email) {
      const { token, hash, expiresAt } = createResetToken();
      user.resetTokenHash = hash;
      user.resetTokenExpiresAt = expiresAt;
      await user.save();

      const link = resetLink(req, token);
      const mail = resetPasswordEmail({ name: user.name, link, minutes: RESET_TTL_MINUTES });

      try {
        await sendMail({ to: user.email, ...mail });
        await audit({
          userId: user._id,
          action: 'auth.forgotPassword',
          entity: 'User',
          entityId: user._id,
          after: { sentTo: maskEmail(user.email) },
        });
      } catch (e) {
        // فشل الإرسال؟ منظّف التوكن عشان مايفضلش شغال من غير ما حد يستلمه
        user.resetTokenHash = null;
        user.resetTokenExpiresAt = null;
        await user.save();
        console.error('[mail] reset send failed:', e.message);
        return fail(res, 'EMAIL_SEND_FAILED', 502);
      }
    }

    res.json({ ok: true });
  })
);

/** GET /api/auth/reset-password/check?token= — نتأكد قبل ما نعرض الفورم */
router.get(
  '/reset-password/check',
  wrap(async (req, res) => {
    const user = await findByResetToken(req.query?.token);
    if (!user) return fail(res, 'RESET_TOKEN_INVALID', 400);
    res.json({ ok: true, name: user.name, email: maskEmail(user.email) });
  })
);

/**
 * POST /api/auth/reset-password { token, password }
 * بيغيّر الباسورد، بيلغي التوكن، وبيرفع tokenVersion فكل الجلسات القديمة بتموت.
 */
router.post(
  '/reset-password',
  resetLimiter,
  wrap(async (req, res) => {
    const password = String(req.body?.password || '');
    if (password.length < 6) return fail(res, 'PASSWORD_TOO_SHORT', 400);

    const user = await findByResetToken(req.body?.token);
    if (!user) return fail(res, 'RESET_TOKEN_INVALID', 400);

    user.passwordHash = await bcrypt.hash(password, 10);
    user.resetTokenHash = null;
    user.resetTokenExpiresAt = null;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // 🔒 أي جلسة مفتوحة بتتقفل
    await user.save();

    await audit({
      userId: user._id,
      action: 'auth.resetPassword',
      entity: 'User',
      entityId: user._id,
      after: { at: new Date() },
    });

    res.json({ ok: true });
  })
);

/** بيدوّر على الحساب بالتوكن — بيتأكد من الهاش وإن الصلاحية ما انتهتش */
async function findByResetToken(raw) {
  const token = String(raw || '');
  if (token.length < 20) return null;

  const user = await User.findOne({
    resetTokenHash: hashResetToken(token),
    resetTokenExpiresAt: { $gt: new Date() },
    active: true,
  }).select('+resetTokenHash +resetTokenExpiresAt +passwordHash');

  return user || null;
}

/** a****@gmail.com — بنطمّن الموظف إن الرابط راح فين من غير ما نعرض الإيميل كامل */
function maskEmail(email) {
  if (!email) return null;
  const [name, domain] = String(email).split('@');
  if (!domain) return null;
  const head = name.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(3, name.length - 1))}@${domain}`;
}

export default router;
