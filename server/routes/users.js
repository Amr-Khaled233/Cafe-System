import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Shift from '../models/Shift.js';
import { managerOnly } from '../middleware/auth.js';
import { wrap, fail } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { rx } from '../filters.js';

const router = Router();
router.use(managerOnly); // 🔒 إدارة الحسابات للمدير بس

/** GET /api/users */
router.get(
  '/',
  wrap(async (req, res) => {
    const f = {};
    if (req.query.role) f.role = req.query.role;
    if (req.query.active === 'true') f.active = true;
    if (req.query.active === 'false') f.active = false;
    if (req.query.q) {
      const r = rx(req.query.q);
      f.$or = [{ name: r }, { username: r }];
    }

    const users = await User.find(f).sort({ name: 1 }).lean();

    // عدد الشيفتات وآخر شيفت لكل موظف
    const shifts = await Shift.aggregate([
      { $group: { _id: '$userId', count: { $sum: 1 }, lastAt: { $max: '$startedAt' } } },
    ]);
    const byId = Object.fromEntries(shifts.map((s) => [String(s._id), s]));

    res.json(
      users.map((u) => ({
        ...u,
        shiftsCount: byId[String(u._id)]?.count || 0,
        lastShiftAt: byId[String(u._id)]?.lastAt || null,
      }))
    );
  })
);

/** POST /api/users { name, username, password, role } */
router.post(
  '/',
  wrap(async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const role = req.body?.role;

    if (!name) return fail(res, 'MISSING_NAME', 400);
    if (username.length < 3) return fail(res, 'USERNAME_TOO_SHORT', 400);
    if (password.length < 6) return fail(res, 'PASSWORD_TOO_SHORT', 400);
    if (!['reception', 'manager'].includes(role)) return fail(res, 'INVALID_ROLE', 400);

    const exists = await User.findOne({ username });
    if (exists) return fail(res, 'USERNAME_TAKEN', 409);

    const user = await User.create({
      name,
      username,
      role,
      passwordHash: await bcrypt.hash(password, 10),
    });

    await audit({
      userId: req.user.id,
      action: 'user.create',
      entity: 'User',
      entityId: user._id,
      after: { name, username, role },
    });

    res.status(201).json({ _id: user._id, name, username, role, active: true });
  })
);

/** PATCH /api/users/:id { name, role, active, password } */
router.patch(
  '/:id',
  wrap(async (req, res) => {
    const before = await User.findById(req.params.id).lean();
    if (!before) return fail(res, 'NOT_FOUND', 404);

    const patch = {};
    if (req.body?.name !== undefined) patch.name = String(req.body.name).trim();

    if (req.body?.role !== undefined) {
      if (!['reception', 'manager'].includes(req.body.role)) return fail(res, 'INVALID_ROLE', 400);
      patch.role = req.body.role;
    }

    if (req.body?.active !== undefined) {
      // مانسمحش المدير يعطّل نفسه ويقفل على نفسه بره
      if (String(before._id) === req.user.id && req.body.active === false) {
        return fail(res, 'CANNOT_DISABLE_SELF', 400);
      }
      patch.active = !!req.body.active;
    }

    if (req.body?.password) {
      if (String(req.body.password).length < 6) return fail(res, 'PASSWORD_TOO_SHORT', 400);
      patch.passwordHash = await bcrypt.hash(String(req.body.password), 10);
    }

    // آخر مدير نشط لازم يفضل موجود
    if (patch.role === 'reception' || patch.active === false) {
      const managers = await User.countDocuments({ role: 'manager', active: true, _id: { $ne: before._id } });
      if (before.role === 'manager' && managers === 0) return fail(res, 'LAST_MANAGER', 400);
    }

    const user = await User.findByIdAndUpdate(req.params.id, patch, { new: true }).lean();

    await audit({
      userId: req.user.id,
      action: 'user.update',
      entity: 'User',
      entityId: user._id,
      before: { name: before.name, role: before.role, active: before.active },
      after: { name: user.name, role: user.role, active: user.active, passwordChanged: !!patch.passwordHash },
    });

    res.json(user);
  })
);

export default router;
