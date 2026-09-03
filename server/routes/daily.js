import { Router } from 'express';
import Order from '../models/Order.js';
import Shift from '../models/Shift.js';
import StockMovement from '../models/StockMovement.js';
import Expense from '../models/Expense.js';
import { managerOnly } from '../middleware/auth.js';
import { wrap } from '../utils/errors.js';
import { resolveRange, TZ } from '../utils/dates.js';
import { sendCSV } from '../utils/csv.js';

const router = Router();
router.use(managerOnly); // 🔒 التقرير اليومي للمدير بس

const round = (n) => Math.round((n || 0) * 100) / 100;
// لازم تكون دالة: date جوّه $dateToString مش جنبه، وإلا مونجو بيرفض التعبير
const dayKey = (field) => ({ $dateToString: { format: '%Y-%m-%d', timezone: TZ, date: field } });

/**
 * التقرير اليومي: كل يوم، وكل شيفت جوّه اليوم.
 *
 * لكل شيفت بيقول: مواعيده · مين كان شغّال · الإيراد · تكلفة الخامات اللي
 * اتصرفت · اللي اتسلّم (وارد) · الهالك · ومجمل الربح.
 * ولكل يوم: الإجماليات + المصروفات + صافي الربح.
 *
 * تكلفة الخامات بتتحسب من حركات المخزون بتكلفتها المتجمّدة — نفس المصدر
 * اللي الجرد شغّال عليه، فالأرقام بتتطابق.
 */
async function dailyReport(query) {
  const { from, to } = resolveRange(query.range || query.from || query.to ? query : { range: 'last30' });

  const dateMatch = {};
  if (from) dateMatch.$gte = from;
  if (to) dateMatch.$lte = to;
  const hasRange = !!(from || to);

  /* ---------- المبيعات: باليوم وبالشيفت ---------- */
  const salesMatch = { status: 'paid' };
  if (hasRange) salesMatch.closedAt = dateMatch;

  const sales = await Order.aggregate([
    { $match: salesMatch },
    {
      $group: {
        _id: { day: dayKey('$closedAt'), shiftId: '$shiftId' },
        revenue: { $sum: '$total' },
        gross: { $sum: '$subtotal' },
        orders: { $sum: 1 },
        items: { $sum: { $sum: '$items.qty' } },
        cash: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'cash'] }, '$total', 0] } },
        card: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'card'] }, '$total', 0] } },
        wallet: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'wallet'] }, '$total', 0] } },
      },
    },
  ]);

  /* ---------- الملغي ---------- */
  const voidMatch = { status: 'void' };
  if (hasRange) voidMatch.closedAt = dateMatch;
  const voided = await Order.aggregate([
    { $match: voidMatch },
    {
      $group: {
        _id: { day: dayKey('$closedAt'), shiftId: '$shiftId' },
        count: { $sum: 1 },
        value: { $sum: '$total' },
      },
    },
  ]);

  /* ---------- حركات المخزون: المستهلك والوارد والهالك ---------- */
  const moveMatch = {};
  if (hasRange) moveMatch.at = dateMatch;
  const moves = await StockMovement.aggregate([
    { $match: moveMatch },
    {
      $group: {
        _id: { day: dayKey('$at') },
        // البيع سالب فبنقلب الإشارة؛ المرتجع بيقلّل التكلفة
        consumedCost: {
          $sum: {
            $cond: [{ $in: ['$type', ['sale', 'return']] }, { $multiply: ['$qty', '$unitCost', -1] }, 0],
          },
        },
        purchasedCost: {
          $sum: { $cond: [{ $eq: ['$type', 'purchase'] }, { $multiply: ['$qty', '$unitCost'] }, 0] },
        },
        wasteCost: {
          $sum: { $cond: [{ $eq: ['$type', 'waste'] }, { $multiply: ['$qty', '$unitCost', -1] }, 0] },
        },
        purchasedLines: { $sum: { $cond: [{ $eq: ['$type', 'purchase'] }, 1, 0] } },
        wasteLines: { $sum: { $cond: [{ $eq: ['$type', 'waste'] }, 1, 0] } },
      },
    },
  ]);
  const movesByDay = Object.fromEntries(moves.map((m) => [m._id.day, m]));

  /* ---------- المصروفات ---------- */
  const expMatch = {};
  if (hasRange) expMatch.at = dateMatch;
  const expenses = await Expense.aggregate([
    { $match: expMatch },
    {
      $group: {
        _id: { day: dayKey('$at') },
        amount: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);
  const expByDay = Object.fromEntries(expenses.map((e) => [e._id.day, e]));

  /* ---------- بيانات الشيفتات ---------- */
  const shiftIds = [...new Set(sales.map((s) => String(s._id.shiftId)).filter(Boolean))];
  const shifts = await Shift.find({ _id: { $in: shiftIds } })
    .populate('userId', 'name')
    .lean();
  const shiftById = Object.fromEntries(shifts.map((s) => [String(s._id), s]));

  const voidByKey = Object.fromEntries(voided.map((v) => [`${v._id.day}|${v._id.shiftId}`, v]));

  /* ---------- نجمع كله في أيام ---------- */
  const days = {};
  const ensureDay = (day) => {
    if (!days[day]) {
      days[day] = {
        day,
        shifts: [],
        revenue: 0,
        orders: 0,
        items: 0,
        discounts: 0,
        cash: 0,
        card: 0,
        wallet: 0,
        voidedCount: 0,
        voidedValue: 0,
      };
    }
    return days[day];
  };

  for (const s of sales) {
    const d = ensureDay(s._id.day);
    const sh = shiftById[String(s._id.shiftId)];
    const v = voidByKey[`${s._id.day}|${s._id.shiftId}`];

    d.shifts.push({
      shiftId: String(s._id.shiftId),
      staffName: sh?.userId?.name || '',
      startedAt: sh?.startedAt || null,
      endedAt: sh?.endedAt || null,
      workers: (sh?.workers || []).map((w) => w.name),
      openingCash: sh?.openingCash ?? null,
      closingCash: sh?.closingCash ?? null,
      difference: sh?.difference ?? null,
      revenue: round(s.revenue),
      orders: s.orders,
      items: s.items,
      discounts: round(s.gross - s.revenue),
      cash: round(s.cash),
      card: round(s.card),
      wallet: round(s.wallet),
      voidedCount: v?.count || 0,
      voidedValue: round(v?.value || 0),
    });

    d.revenue += s.revenue;
    d.orders += s.orders;
    d.items += s.items;
    d.discounts += s.gross - s.revenue;
    d.cash += s.cash;
    d.card += s.card;
    d.wallet += s.wallet;
    d.voidedCount += v?.count || 0;
    d.voidedValue += v?.value || 0;
  }

  // أيام فيها مصروفات أو توريدات من غير مبيعات لازم تبان برضه
  for (const day of new Set([...Object.keys(movesByDay), ...Object.keys(expByDay)])) ensureDay(day);

  const rows = Object.values(days)
    .map((d) => {
      const m = movesByDay[d.day] || { consumedCost: 0, purchasedCost: 0, wasteCost: 0, purchasedLines: 0, wasteLines: 0 };
      const e = expByDay[d.day] || { amount: 0, count: 0 };

      const revenue = round(d.revenue);
      const ingredientCost = round(m.consumedCost);
      const grossProfit = round(revenue - ingredientCost);
      const expensesAmount = round(e.amount);

      return {
        ...d,
        revenue,
        discounts: round(d.discounts),
        cash: round(d.cash),
        card: round(d.card),
        wallet: round(d.wallet),
        voidedValue: round(d.voidedValue),
        ingredientCost,
        purchasedCost: round(m.purchasedCost),
        wasteCost: round(m.wasteCost),
        purchasedLines: m.purchasedLines,
        wasteLines: m.wasteLines,
        grossProfit,
        expenses: expensesAmount,
        expensesCount: e.count,
        // صافي الربح = الإيراد − تكلفة الخامات − المصروفات
        netProfit: round(grossProfit - expensesAmount),
        shifts: d.shifts.sort((a, b) => new Date(a.startedAt || 0) - new Date(b.startedAt || 0)),
      };
    })
    .sort((a, b) => (a.day < b.day ? 1 : -1));

  const totals = rows.reduce(
    (t, r) => ({
      revenue: round(t.revenue + r.revenue),
      orders: t.orders + r.orders,
      items: t.items + r.items,
      discounts: round(t.discounts + r.discounts),
      ingredientCost: round(t.ingredientCost + r.ingredientCost),
      purchasedCost: round(t.purchasedCost + r.purchasedCost),
      wasteCost: round(t.wasteCost + r.wasteCost),
      grossProfit: round(t.grossProfit + r.grossProfit),
      expenses: round(t.expenses + r.expenses),
      netProfit: round(t.netProfit + r.netProfit),
      voidedValue: round(t.voidedValue + r.voidedValue),
    }),
    {
      revenue: 0,
      orders: 0,
      items: 0,
      discounts: 0,
      ingredientCost: 0,
      purchasedCost: 0,
      wasteCost: 0,
      grossProfit: 0,
      expenses: 0,
      netProfit: 0,
      voidedValue: 0,
    }
  );

  return { rows, totals, range: { from, to } };
}

/** GET /api/reports/daily?from=&to= */
router.get('/', wrap(async (req, res) => res.json(await dailyReport(req.query))));

/** GET /api/reports/daily/export.csv */
router.get(
  '/export.csv',
  wrap(async (req, res) => {
    const { rows } = await dailyReport(req.query);
    sendCSV(res, 'daily-report.csv', rows, [
      { key: 'day', label: 'Day' },
      { key: 'orders', label: 'Bills' },
      { key: 'items', label: 'Items' },
      { key: 'revenue', label: 'Revenue' },
      { key: 'discounts', label: 'Discounts' },
      { key: 'ingredientCost', label: 'Ingredient cost' },
      { key: 'grossProfit', label: 'Gross profit' },
      { key: 'expenses', label: 'Expenses' },
      { key: 'netProfit', label: 'Net profit' },
      { key: 'purchasedCost', label: 'Stock received' },
      { key: 'wasteCost', label: 'Waste' },
      { key: 'shifts', label: 'Shifts', get: (r) => r.shifts.length },
      { key: 'workers', label: 'Workers', get: (r) => [...new Set(r.shifts.flatMap((s) => s.workers))].join(' / ') },
    ]);
  })
);

export default router;
