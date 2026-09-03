import { Router } from 'express';
import Expense from '../models/Expense.js';
import { managerOnly } from '../middleware/auth.js';
import { wrap, fail } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { oid, rx } from '../filters.js';
import { resolveRange, startOfDay, TZ } from '../utils/dates.js';
import { sendCSV } from '../utils/csv.js';

const router = Router();
router.use(managerOnly); // 🔒 المصروفات للمدير بس

export const CATEGORIES = [
  'rent',
  'salaries',
  'utilities',
  'supplies',
  'maintenance',
  'marketing',
  'transport',
  'other',
];

const round = (n) => Math.round((n || 0) * 100) / 100;

function buildFilter(query) {
  const f = {};
  const { from, to } = resolveRange(query);
  if (from || to) {
    f.at = {};
    if (from) f.at.$gte = from;
    if (to) f.at.$lte = to;
  }
  if (query.category && CATEGORIES.includes(query.category)) f.category = query.category;
  if (oid(query.userId)) f.userId = oid(query.userId);
  if (query.q) f.note = rx(query.q);
  return f;
}

/** GET /api/expenses ?<فلاتر> — القايمة + الإجمالي */
router.get(
  '/',
  wrap(async (req, res) => {
    const f = buildFilter(req.query);
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const page = Math.max(Number(req.query.page) || 1, 1);

    const [rows, total, agg] = await Promise.all([
      Expense.find(f)
        .sort({ at: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'name')
        .lean(),
      Expense.countDocuments(f),
      Expense.aggregate([{ $match: f }, { $group: { _id: null, sum: { $sum: '$amount' } } }]),
    ]);

    res.json({
      rows,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      totalAmount: round(agg[0]?.sum || 0),
    });
  })
);

/**
 * GET /api/expenses/summary — بتصرف في إيه أكتر حاجة؟
 * بيرجّع كل بند بإجماليه ونسبته، بالإضافة لتوزيع يومي.
 */
router.get(
  '/summary',
  wrap(async (req, res) => {
    const f = buildFilter(req.query);

    const byCategory = await Expense.aggregate([
      { $match: f },
      { $group: { _id: '$category', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } },
    ]);

    const byDay = await Expense.aggregate([
      { $match: f },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$at', timezone: TZ } },
          amount: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, day: '$_id', amount: { $round: ['$amount', 2] } } },
    ]);

    const total = byCategory.reduce((s, r) => s + r.amount, 0);

    res.json({
      total: round(total),
      byCategory: byCategory.map((r) => ({
        category: r._id,
        amount: round(r.amount),
        count: r.count,
        pct: total > 0 ? round((r.amount / total) * 100) : 0,
      })),
      byDay,
      // أكتر بند بتصرف فيه
      top: byCategory[0] ? { category: byCategory[0]._id, amount: round(byCategory[0].amount) } : null,
    });
  })
);

/** POST /api/expenses { at, category, amount, note } */
router.post(
  '/',
  wrap(async (req, res) => {
    const category = req.body?.category;
    if (!CATEGORIES.includes(category)) return fail(res, 'INVALID_EXPENSE_CATEGORY', 400);

    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return fail(res, 'INVALID_AMOUNT', 400);

    // من غير تاريخ = النهاردة بتوقيت الكافيه
    const at = req.body?.at ? new Date(req.body.at) : new Date();
    if (Number.isNaN(at.getTime())) return fail(res, 'BAD_RANGE', 400);

    const expense = await Expense.create({
      at,
      category,
      amount: round(amount),
      note: String(req.body?.note || '').trim(),
      userId: req.user.id,
    });

    await audit({
      userId: req.user.id,
      action: 'expense.create',
      entity: 'Expense',
      entityId: expense._id,
      after: { category, amount: expense.amount, at, note: expense.note },
    });

    res.status(201).json(expense);
  })
);

/** PATCH /api/expenses/:id */
router.patch(
  '/:id',
  wrap(async (req, res) => {
    const before = await Expense.findById(req.params.id).lean();
    if (!before) return fail(res, 'NOT_FOUND', 404);

    const patch = {};
    if (req.body?.category !== undefined) {
      if (!CATEGORIES.includes(req.body.category)) return fail(res, 'INVALID_EXPENSE_CATEGORY', 400);
      patch.category = req.body.category;
    }
    if (req.body?.amount !== undefined) {
      const a = Number(req.body.amount);
      if (!Number.isFinite(a) || a <= 0) return fail(res, 'INVALID_AMOUNT', 400);
      patch.amount = round(a);
    }
    if (req.body?.at !== undefined) {
      const d = new Date(req.body.at);
      if (Number.isNaN(d.getTime())) return fail(res, 'BAD_RANGE', 400);
      patch.at = d;
    }
    if (req.body?.note !== undefined) patch.note = String(req.body.note).trim();

    const expense = await Expense.findByIdAndUpdate(req.params.id, patch, { new: true });
    await audit({
      userId: req.user.id,
      action: 'expense.update',
      entity: 'Expense',
      entityId: expense._id,
      before: { category: before.category, amount: before.amount, at: before.at },
      after: { category: expense.category, amount: expense.amount, at: expense.at },
    });
    res.json(expense);
  })
);

/** DELETE /api/expenses/:id — المصروف بيتشال فعلاً، بس بيتسجّل في السجل */
router.delete(
  '/:id',
  wrap(async (req, res) => {
    const before = await Expense.findById(req.params.id).lean();
    if (!before) return fail(res, 'NOT_FOUND', 404);

    await Expense.deleteOne({ _id: before._id });
    await audit({
      userId: req.user.id,
      action: 'expense.delete',
      entity: 'Expense',
      entityId: before._id,
      before,
    });
    res.json({ ok: true });
  })
);

/** GET /api/expenses/export.csv */
router.get(
  '/export.csv',
  wrap(async (req, res) => {
    const rows = await Expense.find(buildFilter(req.query))
      .sort({ at: -1 })
      .limit(5000)
      .populate('userId', 'name')
      .lean();

    sendCSV(res, 'expenses.csv', rows, [
      { key: 'at', label: 'Date', get: (r) => new Date(r.at).toISOString().slice(0, 10) },
      { key: 'category', label: 'Category' },
      { key: 'amount', label: 'Amount' },
      { key: 'note', label: 'Note' },
      { key: 'user', label: 'Added by', get: (r) => r.userId?.name || '' },
    ]);
  })
);

export default router;
