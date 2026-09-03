import { Router } from 'express';
import Shift from '../models/Shift.js';
import Worker from '../models/Worker.js';
import Order from '../models/Order.js';
import { managerOnly } from '../middleware/auth.js';
import { wrap, fail } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { oid } from '../filters.js';
import { resolveRange } from '../utils/dates.js';

const router = Router();

/**
 * بيحوّل قائمة معرّفات لعمّال بأسمائهم ووظايفهم منسوخة.
 * النسخ مقصود: لو العامل اتشال أو اتغيّر اسمه بعدين، الشيفت القديم يفضل مفهوم.
 */
async function resolveWorkers(ids) {
  const list = Array.isArray(ids) ? ids.map((x) => oid(x)).filter(Boolean) : [];
  if (!list.length) return [];
  const workers = await Worker.find({ _id: { $in: list }, active: true }).lean();
  return workers.map((w) => ({ workerId: w._id, name: w.name, jobTitle: w.jobTitle }));
}

/**
 * ملخّص شيفت: عدد الفواتير، اللي اتحصّل، والتقسيم بطريقة الدفع.
 * الكاش المتوقّع = الافتتاحي + مبيعات الكاش بس (الكارت والمحفظة مابيدخلوش الدرج).
 */
async function summarizeShift(shift) {
  const [agg] = await Order.aggregate([
    { $match: { shiftId: shift._id, status: 'paid' } },
    {
      $group: {
        _id: null,
        ordersCount: { $sum: 1 },
        total: { $sum: '$total' },
        itemsCount: { $sum: { $sum: '$items.qty' } },
        cash: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'cash'] }, '$total', 0] } },
        card: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'card'] }, '$total', 0] } },
        wallet: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'wallet'] }, '$total', 0] } },
      },
    },
  ]);

  const voided = await Order.countDocuments({ shiftId: shift._id, status: 'void' });
  const openCount = await Order.countDocuments({ shiftId: shift._id, status: 'open' });
  const a = agg || { ordersCount: 0, total: 0, itemsCount: 0, cash: 0, card: 0, wallet: 0 };

  return {
    ...a,
    _id: undefined,
    voidedCount: voided,
    openCount,
    avgOrder: a.ordersCount ? Math.round((a.total / a.ordersCount) * 100) / 100 : 0,
    expectedCash: Math.round(((shift.openingCash || 0) + a.cash) * 100) / 100,
  };
}

/** POST /api/shifts/open { openingCash } */
router.post(
  '/open',
  wrap(async (req, res) => {
    const existing = await Shift.findOne({ userId: req.user.id, endedAt: null });
    if (existing) return fail(res, 'SHIFT_ALREADY_OPEN', 409);

    const openingCash = Number(req.body?.openingCash ?? 0);
    if (!Number.isFinite(openingCash) || openingCash < 0) return fail(res, 'INVALID_CASH', 400);

    const workers = await resolveWorkers(req.body?.workers);
    const shift = await Shift.create({
      userId: req.user.id,
      openingCash,
      startedAt: new Date(),
      workers,
    });
    await audit({
      userId: req.user.id,
      action: 'shift.open',
      entity: 'Shift',
      entityId: shift._id,
      after: { openingCash, workers: workers.map((w) => w.name) },
    });
    res.status(201).json(shift);
  })
);

/** POST /api/shifts/close { closingCash } — بيقارن المعدود بالمتوقّع */
router.post(
  '/close',
  wrap(async (req, res) => {
    const shift = await Shift.findOne({ userId: req.user.id, endedAt: null });
    if (!shift) return fail(res, 'NO_OPEN_SHIFT', 409);

    const closingCash = Number(req.body?.closingCash);
    if (!Number.isFinite(closingCash) || closingCash < 0) return fail(res, 'INVALID_CASH', 400);

    // فاتورة مفتوحة لسه = الشيفت مايتقفلش، عشان مايضيعش تحصيل
    const stillOpen = await Order.countDocuments({ shiftId: shift._id, status: 'open' });
    if (stillOpen > 0) return fail(res, 'OPEN_ORDERS_EXIST', 409);

    const summary = await summarizeShift(shift);

    shift.closingCash = closingCash;
    shift.expectedCash = summary.expectedCash;
    shift.difference = Math.round((closingCash - summary.expectedCash) * 100) / 100;
    shift.endedAt = new Date();
    await shift.save();

    await audit({
      userId: req.user.id,
      action: 'shift.close',
      entity: 'Shift',
      entityId: shift._id,
      after: { closingCash, expectedCash: shift.expectedCash, difference: shift.difference },
    });

    res.json({ shift, summary });
  })
);

/**
 * PATCH /api/shifts/current/workers { workers: [ids] }
 * الريسبشن يقدر يعدّل مين موجود في شيفته وهو شغّال — حد جه متأخر أو مشي بدري.
 */
router.patch(
  '/current/workers',
  wrap(async (req, res) => {
    const shift = await Shift.findOne({ userId: req.user.id, endedAt: null });
    if (!shift) return fail(res, 'NO_OPEN_SHIFT', 409);

    const before = shift.workers.map((w) => w.name);
    shift.workers = await resolveWorkers(req.body?.workers);
    await shift.save();

    await audit({
      userId: req.user.id,
      action: 'shift.workers.update',
      entity: 'Shift',
      entityId: shift._id,
      before: { workers: before },
      after: { workers: shift.workers.map((w) => w.name) },
    });

    res.json({ shift, summary: await summarizeShift(shift) });
  })
);

/** GET /api/shifts/current — الشيفت المفتوح وملخّصه (كل موظف بيشوف شيفته هو) */
router.get(
  '/current',
  wrap(async (req, res) => {
    const shift = await Shift.findOne({ userId: req.user.id, endedAt: null });
    if (!shift) return res.json({ shift: null, summary: null });
    res.json({ shift, summary: await summarizeShift(shift) });
  })
);

/** GET /api/shifts (مدير) ?<فلاتر> — كل الشيفتات بملخّصاتها */
router.get(
  '/',
  managerOnly,
  wrap(async (req, res) => {
    const f = {};
    const { from, to } = resolveRange(req.query);
    if (from || to) {
      f.startedAt = {};
      if (from) f.startedAt.$gte = from;
      if (to) f.startedAt.$lte = to;
    }
    if (oid(req.query.userId)) f.userId = oid(req.query.userId);
    if (req.query.status === 'open') f.endedAt = null;
    if (req.query.status === 'closed') f.endedAt = { $ne: null };

    const shifts = await Shift.find(f).sort({ startedAt: -1 }).limit(200).populate('userId', 'name role').lean();

    const rows = await Promise.all(
      shifts.map(async (s) => ({ ...s, summary: await summarizeShift({ _id: s._id, openingCash: s.openingCash }) }))
    );
    res.json({ rows });
  })
);

/** GET /api/shifts/:id (مدير) */
router.get(
  '/:id',
  managerOnly,
  wrap(async (req, res) => {
    const shift = await Shift.findById(req.params.id).populate('userId', 'name role').lean();
    if (!shift) return fail(res, 'NOT_FOUND', 404);
    res.json({ shift, summary: await summarizeShift({ _id: shift._id, openingCash: shift.openingCash }) });
  })
);

export default router;
