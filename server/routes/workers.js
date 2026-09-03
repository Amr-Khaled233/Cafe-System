import { Router } from 'express';
import Worker from '../models/Worker.js';
import Shift from '../models/Shift.js';
import { managerOnly } from '../middleware/auth.js';
import { wrap, fail } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { rx, oid } from '../filters.js';

const router = Router();

const JOB_TITLES = ['barista', 'kitchen', 'waiter', 'cashier', 'other'];

/**
 * GET /api/workers
 * متاح للدورين — الريسبشن محتاج القايمة عشان يختار مين موجود في شيفته.
 * بيرجّع النشطين بس، إلا لو المدير طلب الكل.
 */
router.get(
  '/',
  wrap(async (req, res) => {
    const f = {};
    const wantsAll = req.query.active === 'all' && req.user.role === 'manager';
    if (!wantsAll) f.active = true;
    if (req.query.jobTitle && JOB_TITLES.includes(req.query.jobTitle)) f.jobTitle = req.query.jobTitle;
    if (req.query.q) f.name = rx(req.query.q);

    const workers = await Worker.find(f).sort({ name: 1 }).lean();

    // 🔒 الريسبشن مايشوفش التليفونات والملاحظات — محتاج الاسم والوظيفة بس
    if (req.user.role !== 'manager') {
      return res.json(workers.map((w) => ({ _id: w._id, name: w.name, jobTitle: w.jobTitle })));
    }

    // للمدير: كم شيفت اشتغله كل واحد
    const counts = await Shift.aggregate([
      { $unwind: '$workers' },
      { $group: { _id: '$workers.workerId', shifts: { $sum: 1 }, lastAt: { $max: '$startedAt' } } },
    ]);
    const byId = Object.fromEntries(counts.map((c) => [String(c._id), c]));

    res.json(
      workers.map((w) => ({
        ...w,
        shiftsCount: byId[String(w._id)]?.shifts || 0,
        lastShiftAt: byId[String(w._id)]?.lastAt || null,
      }))
    );
  })
);

/** POST /api/workers (مدير) { name, jobTitle, phone, note } */
router.post(
  '/',
  managerOnly,
  wrap(async (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return fail(res, 'MISSING_NAME', 400);

    const jobTitle = req.body?.jobTitle || 'barista';
    if (!JOB_TITLES.includes(jobTitle)) return fail(res, 'INVALID_JOB_TITLE', 400);

    const worker = await Worker.create({
      name,
      jobTitle,
      phone: String(req.body?.phone || '').trim(),
      note: String(req.body?.note || '').trim(),
    });

    await audit({ userId: req.user.id, action: 'worker.create', entity: 'Worker', entityId: worker._id, after: worker });
    res.status(201).json(worker);
  })
);

/** PATCH /api/workers/:id (مدير) */
router.patch(
  '/:id',
  managerOnly,
  wrap(async (req, res) => {
    const before = await Worker.findById(req.params.id).lean();
    if (!before) return fail(res, 'NOT_FOUND', 404);

    const patch = {};
    if (req.body?.name !== undefined) {
      const n = String(req.body.name).trim();
      if (!n) return fail(res, 'MISSING_NAME', 400);
      patch.name = n;
    }
    if (req.body?.jobTitle !== undefined) {
      if (!JOB_TITLES.includes(req.body.jobTitle)) return fail(res, 'INVALID_JOB_TITLE', 400);
      patch.jobTitle = req.body.jobTitle;
    }
    for (const k of ['phone', 'note']) {
      if (req.body?.[k] !== undefined) patch[k] = String(req.body[k]).trim();
    }
    if (req.body?.active !== undefined) patch.active = !!req.body.active;

    const worker = await Worker.findByIdAndUpdate(req.params.id, patch, { new: true });
    await audit({
      userId: req.user.id,
      action: 'worker.update',
      entity: 'Worker',
      entityId: worker._id,
      before,
      after: worker,
    });
    res.json(worker);
  })
);

/** GET /api/workers/:id/shifts (مدير) — الشيفتات اللي العامل ده اشتغلها */
router.get(
  '/:id/shifts',
  managerOnly,
  wrap(async (req, res) => {
    if (!oid(req.params.id)) return fail(res, 'BAD_ID', 400);
    const rows = await Shift.find({ 'workers.workerId': oid(req.params.id) })
      .sort({ startedAt: -1 })
      .limit(100)
      .populate('userId', 'name')
      .lean();
    res.json({ rows });
  })
);

export default router;
