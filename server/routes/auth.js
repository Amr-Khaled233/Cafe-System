import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import { authenticate, cookieOptions, signToken } from '../middleware/auth.js';
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

    res.cookie('token', signToken(user), cookieOptions());
    res.json({ id: String(user._id), name: user.name, role: user.role });
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

export default router;
