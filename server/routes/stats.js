import { Router } from 'express';
import Order from '../models/Order.js';
import StockMovement from '../models/StockMovement.js';
import Ingredient from '../models/Ingredient.js';
import Category from '../models/Category.js';
import MenuItem from '../models/MenuItem.js';
import { managerOnly } from '../middleware/auth.js';
import { wrap } from '../utils/errors.js';
import { buildOrderFilter } from '../filters.js';
import { resolveRange, previousRange, autoGranularity, TZ } from '../utils/dates.js';

const router = Router();
router.use(managerOnly); // 🔒 كل الإحصائيات للمدير بس

const round = (n) => Math.round((n || 0) * 100) / 100;

/** تكلفة الخامات لفترة = مجموع (كمية × تكلفة الحركة) لحركات البيع، ناقص المرتجع */
async function cogsFor(from, to) {
  const match = { type: { $in: ['sale', 'return'] }, refType: 'order' };
  if (from || to) {
    match.at = {};
    if (from) match.at.$gte = from;
    if (to) match.at.$lte = to;
  }
  const [agg] = await StockMovement.aggregate([
    { $match: match },
    { $group: { _id: null, v: { $sum: { $multiply: ['$qty', '$unitCost'] } } } },
  ]);
  // qty بالسالب في البيع، فبنقلب الإشارة عشان التكلفة تطلع موجبة
  return round(-(agg?.v || 0));
}

/** أرقام فترة واحدة — بتتنادى مرتين: الفترة الحالية والفترة اللي قبلها */
async function summaryFor(query, user, from, to) {
  const scoped = { ...query, range: 'custom', from: from?.toISOString(), to: to?.toISOString() };

  const paidFilter = await buildOrderFilter(scoped, user);
  const [sales] = await Order.aggregate([
    { $match: { ...paidFilter, status: 'paid' } },
    {
      $group: {
        _id: null,
        ordersCount: { $sum: 1 },
        revenue: { $sum: '$total' },
        gross: { $sum: '$subtotal' },
        itemsCount: { $sum: { $sum: '$items.qty' } },
      },
    },
  ]);

  const voidFilter = await buildOrderFilter({ ...scoped, status: 'void' }, user);
  const [voided] = await Order.aggregate([
    { $match: voidFilter },
    { $group: { _id: null, count: { $sum: 1 }, value: { $sum: '$total' } } },
  ]);

  const s = sales || { ordersCount: 0, revenue: 0, gross: 0, itemsCount: 0 };
  const cost = await cogsFor(from, to);

  return {
    revenue: round(s.revenue),
    ordersCount: s.ordersCount,
    avgOrder: s.ordersCount ? round(s.revenue / s.ordersCount) : 0,
    itemsCount: s.itemsCount || 0,
    discounts: round(s.gross - s.revenue),
    voidedCount: voided?.count || 0,
    voidedValue: round(voided?.value || 0),
    cost,
    profit: round(s.revenue - cost),
    marginPct: s.revenue > 0 ? round(((s.revenue - cost) / s.revenue) * 100) : 0,
  };
}

/** GET /api/stats/summary — الـ KPIs + الفرق عن الفترة اللي قبلها */
router.get(
  '/summary',
  wrap(async (req, res) => {
    const { from, to } = resolveRange(req.query);
    const current = await summaryFor(req.query, req.user, from, to);

    const prev = previousRange(from, to);
    const previous = prev.from ? await summaryFor(req.query, req.user, prev.from, prev.to) : null;

    // نسبة التغيّر لكل رقم — الواجهة بتعرضها كسهم + نسبة
    const change = {};
    if (previous) {
      for (const k of Object.keys(current)) {
        const a = previous[k] || 0;
        const b = current[k] || 0;
        change[k] = a === 0 ? (b === 0 ? 0 : 100) : round(((b - a) / Math.abs(a)) * 100);
      }
    }

    res.json({ current, previous, change, range: { from, to } });
  })
);

/** GET /api/stats/timeseries?granularity=hour|day — المبيعات على الوقت */
router.get(
  '/timeseries',
  wrap(async (req, res) => {
    const { from, to } = resolveRange(req.query);
    const granularity = req.query.granularity || autoGranularity(from, to);
    const f = await buildOrderFilter(req.query, req.user);

    const fmt = granularity === 'hour' ? '%Y-%m-%dT%H:00' : '%Y-%m-%d';
    const rows = await Order.aggregate([
      { $match: { ...f, status: 'paid' } },
      {
        $group: {
          _id: { $dateToString: { format: fmt, date: '$closedAt', timezone: TZ } },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
          items: { $sum: { $sum: '$items.qty' } },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, bucket: '$_id', revenue: { $round: ['$revenue', 2] }, orders: 1, items: 1 } },
    ]);

    res.json({ granularity, rows });
  })
);

/** GET /api/stats/top-items — أكتر 10 أصناف مبيعاً بالعدد وبالفلوس */
router.get(
  '/top-items',
  wrap(async (req, res) => {
    const f = await buildOrderFilter(req.query, req.user);
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    const rows = await Order.aggregate([
      { $match: { ...f, status: 'paid' } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.menuItemId',
          nameAr: { $first: '$items.nameAr' },
          nameEn: { $first: '$items.nameEn' },
          qty: { $sum: '$items.qty' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } },
        },
      },
      { $sort: { qty: -1 } },
      { $limit: limit },
      { $project: { _id: 0, menuItemId: '$_id', nameAr: 1, nameEn: 1, qty: 1, revenue: { $round: ['$revenue', 2] } } },
    ]);

    res.json({ rows });
  })
);

/** GET /api/stats/by-category — نسبة كل تصنيف من المبيعات */
router.get(
  '/by-category',
  wrap(async (req, res) => {
    const f = await buildOrderFilter(req.query, req.user);

    const rows = await Order.aggregate([
      { $match: { ...f, status: 'paid' } },
      { $unwind: '$items' },
      { $lookup: { from: 'menuitems', localField: 'items.menuItemId', foreignField: '_id', as: 'mi' } },
      { $unwind: { path: '$mi', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$mi.categoryId',
          qty: { $sum: '$items.qty' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    const cats = await Category.find().lean();
    const byId = Object.fromEntries(cats.map((c) => [String(c._id), c]));
    const total = rows.reduce((s, r) => s + r.revenue, 0);

    res.json({
      rows: rows.map((r) => ({
        categoryId: r._id ? String(r._id) : null,
        nameAr: byId[String(r._id)]?.nameAr || '—',
        nameEn: byId[String(r._id)]?.nameEn || '—',
        qty: r.qty,
        revenue: round(r.revenue),
        pct: total > 0 ? round((r.revenue / total) * 100) : 0,
      })),
      total: round(total),
    });
  })
);

/** GET /api/stats/peak-hours — heatmap يوم × ساعة */
router.get(
  '/peak-hours',
  wrap(async (req, res) => {
    const f = await buildOrderFilter(req.query, req.user);

    const rows = await Order.aggregate([
      { $match: { ...f, status: 'paid' } },
      {
        $group: {
          _id: {
            dow: { $dayOfWeek: { date: '$closedAt', timezone: TZ } }, // 1 = الأحد
            hour: { $hour: { date: '$closedAt', timezone: TZ } },
          },
          orders: { $sum: 1 },
          revenue: { $sum: '$total' },
        },
      },
      {
        $project: {
          _id: 0,
          dow: '$_id.dow',
          hour: '$_id.hour',
          orders: 1,
          revenue: { $round: ['$revenue', 2] },
        },
      },
    ]);

    res.json({ rows, max: rows.reduce((m, r) => Math.max(m, r.orders), 0) });
  })
);

/** GET /api/stats/by-staff — أداء الموظفين */
router.get(
  '/by-staff',
  wrap(async (req, res) => {
    const f = await buildOrderFilter(req.query, req.user);

    const rows = await Order.aggregate([
      { $match: { ...f, status: 'paid' } },
      {
        $group: {
          _id: '$userId',
          orders: { $sum: 1 },
          revenue: { $sum: '$total' },
          items: { $sum: { $sum: '$items.qty' } },
          discounts: { $sum: { $subtract: ['$subtotal', '$total'] } },
        },
      },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
      { $unwind: { path: '$u', preserveNullAndEmptyArrays: true } },
      { $sort: { revenue: -1 } },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          name: '$u.name',
          role: '$u.role',
          orders: 1,
          items: 1,
          revenue: { $round: ['$revenue', 2] },
          discounts: { $round: ['$discounts', 2] },
          avgOrder: { $round: [{ $divide: ['$revenue', '$orders'] }, 2] },
        },
      },
    ]);

    res.json({ rows });
  })
);

/** GET /api/stats/by-table — دوران الطاولات ومتوسط مدة الجلسة */
router.get(
  '/by-table',
  wrap(async (req, res) => {
    const f = await buildOrderFilter(req.query, req.user);

    const rows = await Order.aggregate([
      { $match: { ...f, status: 'paid' } },
      {
        $group: {
          _id: '$tableId',
          sessions: { $sum: 1 },
          revenue: { $sum: '$total' },
          // مدة الجلسة بالدقايق
          avgMinutes: { $avg: { $divide: [{ $subtract: ['$closedAt', '$openedAt'] }, 60000] } },
        },
      },
      { $lookup: { from: 'tables', localField: '_id', foreignField: '_id', as: 't' } },
      { $unwind: { path: '$t', preserveNullAndEmptyArrays: true } },
      { $sort: { revenue: -1 } },
      {
        $project: {
          _id: 0,
          tableId: '$_id',
          number: '$t.number',
          name: '$t.name',
          area: '$t.area',
          sessions: 1,
          revenue: { $round: ['$revenue', 2] },
          avgMinutes: { $round: ['$avgMinutes', 0] },
        },
      },
    ]);

    res.json({ rows });
  })
);

/** GET /api/stats/by-payment — كاش / كارت / محفظة */
router.get(
  '/by-payment',
  wrap(async (req, res) => {
    const f = await buildOrderFilter(req.query, req.user);

    const rows = await Order.aggregate([
      { $match: { ...f, status: 'paid' } },
      { $group: { _id: '$paymentMethod', orders: { $sum: 1 }, revenue: { $sum: '$total' } } },
      { $project: { _id: 0, method: '$_id', orders: 1, revenue: { $round: ['$revenue', 2] } } },
    ]);

    const total = rows.reduce((s, r) => s + r.revenue, 0);
    res.json({
      rows: rows.map((r) => ({ ...r, pct: total > 0 ? round((r.revenue / total) * 100) : 0 })),
      total: round(total),
    });
  })
);

/** GET /api/stats/top-ingredients — أعلى الخامات استهلاكاً (إيه اللي بيخلص بسرعة) */
router.get(
  '/top-ingredients',
  wrap(async (req, res) => {
    const { from, to } = resolveRange(req.query);
    const match = { type: 'sale' };
    if (from || to) {
      match.at = {};
      if (from) match.at.$gte = from;
      if (to) match.at.$lte = to;
    }

    const rows = await StockMovement.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$ingredientId',
          qty: { $sum: { $abs: '$qty' } },
          value: { $sum: { $abs: { $multiply: ['$qty', '$unitCost'] } } },
        },
      },
      { $sort: { qty: -1 } },
      { $limit: Math.min(Number(req.query.limit) || 10, 50) },
    ]);

    const ings = await Ingredient.find({ _id: { $in: rows.map((r) => r._id) } }).lean();
    const byId = Object.fromEntries(ings.map((i) => [String(i._id), i]));

    res.json({
      rows: rows.map((r) => ({
        ingredientId: String(r._id),
        nameAr: byId[String(r._id)]?.nameAr || '',
        nameEn: byId[String(r._id)]?.nameEn || '',
        unit: byId[String(r._id)]?.unit || 'g',
        qty: round(r.qty),
        value: round(r.value),
      })),
    });
  })
);

/** GET /api/stats/item-margins — هامش الربح لكل صنف، الأقل ربحاً الأول */
router.get(
  '/item-margins',
  wrap(async (req, res) => {
    const items = await MenuItem.find({ available: true }).lean();
    const ings = await Ingredient.find().lean();
    const byId = Object.fromEntries(ings.map((i) => [String(i._id), i]));

    const rows = items
      .map((mi) => {
        const cost = (mi.recipe || []).reduce(
          (s, l) => s + (byId[String(l.ingredientId)]?.costPerUnit || 0) * l.qty,
          0
        );
        const profit = mi.price - cost;
        return {
          menuItemId: String(mi._id),
          nameAr: mi.nameAr,
          nameEn: mi.nameEn,
          price: mi.price,
          cost: round(cost),
          profit: round(profit),
          marginPct: mi.price > 0 ? round((profit / mi.price) * 100) : 0,
        };
      })
      .sort((a, b) => a.marginPct - b.marginPct); // الأقل ربحاً فوق — دي اللي محتاجة انتباه

    res.json({ rows });
  })
);

export default router;
