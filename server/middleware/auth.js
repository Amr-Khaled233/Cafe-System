import jwt from 'jsonwebtoken';
import Shift from '../models/Shift.js';
import User from '../models/User.js';

// خوارزمية واحدة مثبّتة — يمنع هجوم تبديل الخوارزمية (alg confusion / alg:none)
const ALG = 'HS256';

/** بيتأكد إن السر موجود وقوي — أحسن ما السيرفر يقع وقت أول تسجيل دخول */
export function assertJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error('JWT_SECRET missing or too short (needs 32+ characters).');
  }
  if (process.env.NODE_ENV === 'production' && /change-me|dev-local/i.test(s)) {
    throw new Error('JWT_SECRET still has its default value. Set a real secret before deploying.');
  }
}

const HOURS = Number(process.env.JWT_HOURS || 12);
export const TOKEN_TTL_SEC = HOURS * 60 * 60;

export function signToken(user) {
  return jwt.sign(
    // v = نسخة التوكن. لو الباسورد اتغيّر أو المدير عمل «خروج من كل الأجهزة»،
    // النسخة بتزيد والتوكنات القديمة بتبقى غير صالحة على طول.
    { id: String(user._id), role: user.role, name: user.name, v: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL_SEC, algorithm: ALG }
  );
}

/** إعدادات كوكي واحدة مستخدمة في اللوجين واللوجاوت والتجديد */
export function cookieOptions() {
  const prod = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true, // ⛔ الجافاسكربت في المتصفح مايقدرش يقراه
    secure: prod,
    sameSite: 'lax',
    maxAge: TOKEN_TTL_SEC * 1000,
    path: '/',
  };
}

/**
 * بيتحقق من التوكن، ويحمّل الشيفت المفتوح للمستخدم.
 * currentShiftId مهم لأن بنّاء الفلاتر بيقفل الريسبشن على شيفته هو.
 */
export async function authenticate(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: [ALG] });
  } catch {
    return res.status(401).json({ error: 'Session expired', code: 'SESSION_EXPIRED' });
  }

  // الحساب ممكن يكون اتعطّل بعد إصدار التوكن — بنتأكد كل ريكوست
  const user = await User.findById(payload.id).lean();
  if (!user || !user.active) {
    res.clearCookie('token', { ...cookieOptions(), maxAge: undefined });
    return res.status(401).json({ error: 'Account disabled', code: 'ACCOUNT_DISABLED' });
  }

  // 🔒 الجلسة اتلغت (تغيير باسورد أو خروج من كل الأجهزة)
  if ((payload.v || 0) !== (user.tokenVersion || 0)) {
    res.clearCookie('token', { ...cookieOptions(), maxAge: undefined });
    return res.status(401).json({ error: 'Session revoked', code: 'SESSION_REVOKED' });
  }

  const shift = await Shift.findOne({ userId: user._id, endedAt: null }).sort({ startedAt: -1 }).lean();

  req.user = {
    id: String(user._id),
    name: user.name,
    role: user.role,
    email: user.email || null,
    currentShiftId: shift ? String(shift._id) : null,
  };

  // تجديد صامت: كل ريكوست بيمدّ الجلسة 12 ساعة تانية
  res.cookie('token', signToken(user), cookieOptions());
  next();
}

/** بتتحط على راوترات: الإحصائيات، المخزون، الوصفات، الجرد، التقارير، الموظفين */
export const managerOnly = (req, res, next) =>
  req.user?.role === 'manager'
    ? next()
    : res.status(403).json({ error: 'Managers only', code: 'FORBIDDEN' });

/** بعض العمليات لازم يكون فيه شيفت مفتوح (فتح فاتورة، إضافة صنف، تحصيل) */
export const requireOpenShift = (req, res, next) =>
  req.user?.currentShiftId
    ? next()
    : res.status(409).json({ error: 'No open shift', code: 'NO_OPEN_SHIFT' });
