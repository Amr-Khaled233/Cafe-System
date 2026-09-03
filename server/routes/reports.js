import { Router } from 'express';
import Order from '../models/Order.js';
import Ingredient from '../models/Ingredient.js';
import StockMovement from '../models/StockMovement.js';
import Category from '../models/Category.js';
import { managerOnly } from '../middleware/auth.js';
import { wrap } from '../utils/errors.js';
import { buildOrderFilter } from '../filters.js';
import { resolveRange } from '../utils/dates.js';
import { sendCSV } from '../utils/csv.js';

const router = Router();
router.use(managerOnly); // 🔒 كل التقارير للمدير بس

const round = (n) => Math.round((n || 0) * 100) / 100;

/* ================================================================
 * 10.1 — تقرير المبيعات بالصنف
 * ============================================================== */

/**
 * لكل صنف: العدد المباع، الإيراد، التكلفة (من الوصفة)، مجمل الربح ونسبته.
 * الفواتير الملغية مستبعدة تلقائياً من buildOrderFilter.
 */
async function itemSales(query, user) {
  const match = await buildOrderFilter(query, user);

  const rows = await Order.aggregate([
    { $match: { ...match, status: 'paid' } },
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
    // بنجيب الوصفة عشان نحسب التكلفة والربح
    { $lookup: { from: 'menuitems', localField: '_id', foreignField: '_id', as: 'mi' } },
    { $unwind: { path: '$mi', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'ingredients',
        localField: 'mi.recipe.ingredientId',
        foreignField: '_id',
        as: 'ings',
      },
    },
    {
      $addFields: {
        // تكلفة الكوب الواحد = مجموع (كمية الخامة × تكلفة وحدتها)
        unitCost: {
          $sum: {
            $map: {
              input: { $ifNull: ['$mi.recipe', []] },
              as: 'line',
              in: {
                $multiply: [
                  '$$line.qty',
                  {
                    $ifNull: [
                      {
                        $getField: {
                          field: 'costPerUnit',
                          input: {
                            $first: {
                              $filter: {
                                input: '$ings',
                                cond: { $eq: ['$$this._id', '$$line.ingredientId'] },
                              },
                            },
                          },
                        },
                      },
                      0,
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    },
    {
      $addFields: {
        cost: { $multiply: ['$unitCost', '$qty'] },
        profit: { $subtract: ['$revenue', { $multiply: ['$unitCost', '$qty'] }] },
      },
    },
    {
      $project: {
        _id: 0,
        menuItemId: '$_id',
        categoryId: '$mi.categoryId',
        nameAr: 1,
        nameEn: 1,
        qty: 1,
        revenue: { $round: ['$revenue', 2] },
        cost: { $round: ['$cost', 2] },
        profit: { $round: ['$profit', 2] },
      },
    },
  ]);

  // الترتيب: بالعدد أو بالإيراد أو بالربح
  const sortKey = ['qty', 'revenue', 'profit'].includes(query.sort) ? query.sort : 'qty';
  rows.sort((a, b) => b[sortKey] - a[sortKey]);

  const cats = await Category.find().lean();
  const byId = Object.fromEntries(cats.map((c) => [String(c._id), c]));

  const withCat = rows.map((r) => ({
    ...r,
    categoryNameAr: byId[String(r.categoryId)]?.nameAr || '—',
    categoryNameEn: byId[String(r.categoryId)]?.nameEn || '—',
    marginPct: r.revenue > 0 ? round((r.profit / r.revenue) * 100) : 0,
  }));

  const totals = withCat.reduce(
    (t, r) => ({
      qty: t.qty + r.qty,
      revenue: round(t.revenue + r.revenue),
      cost: round(t.cost + r.cost),
      profit: round(t.profit + r.profit),
    }),
    { qty: 0, revenue: 0, cost: 0, profit: 0 }
  );
  totals.marginPct = totals.revenue > 0 ? round((totals.profit / totals.revenue) * 100) : 0;

  return { rows: withCat, totals };
}

/** GET /api/reports/item-sales?from=&to= */
router.get(
  '/item-sales',
  wrap(async (req, res) => res.json(await itemSales(req.query, req.user)))
);

/** GET /api/reports/item-sales/export.csv */
router.get(
  '/item-sales/export.csv',
  wrap(async (req, res) => {
    const { rows } = await itemSales(req.query, req.user);
    sendCSV(res, 'item-sales.csv', rows, [
      { key: 'nameAr', label: 'Item' },
      { key: 'nameEn', label: 'Item (EN)' },
      { key: 'categoryNameAr', label: 'Category' },
      { key: 'qty', label: 'Qty sold' },
      { key: 'revenue', label: 'Revenue' },
      { key: 'cost', label: 'Cost' },
      { key: 'profit', label: 'Profit' },
      { key: 'marginPct', label: 'Margin %' },
    ]);
  })
);

/* ================================================================
 * 10.2 — تقرير استهلاك الخامات
 * ============================================================== */

/**
 * لكل خامة على الفترة: افتتاحي، وارد، مستهلك، هالك، ختامي، وقيمة المستهلك.
 * كله مبني على StockMovement فالأرقام دي هي نفسها اللي الجرد بيشتغل عليها.
 */
async function consumption(query) {
  const { from, to } = resolveRange(query);
  const ingredients = await Ingredient.find({ active: true }).lean();

  // الافتتاحي: آخر balanceAfter قبل بداية الفترة
  const openings = from
    ? await StockMovement.aggregate([
        { $match: { at: { $lt: from } } },
        { $sort: { at: -1, _id: -1 } },
        { $group: { _id: '$ingredientId', balanceAfter: { $first: '$balanceAfter' } } },
      ])
    : [];
  const openingById = Object.fromEntries(openings.map((o) => [String(o._id), o.balanceAfter]));

  const match = {};
  if (from || to) {
    match.at = {};
    if (from) match.at.$gte = from;
    if (to) match.at.$lte = to;
  }

  const aggs = await StockMovement.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$ingredientId',
        purchased: { $sum: { $cond: [{ $eq: ['$type', 'purchase'] }, '$qty', 0] } },
        consumed: { $sum: { $cond: [{ $eq: ['$type', 'sale'] }, '$qty', 0] } },
        consumedValue: {
          $sum: { $cond: [{ $eq: ['$type', 'sale'] }, { $multiply: ['$qty', '$unitCost'] }, 0] },
        },
        waste: { $sum: { $cond: [{ $eq: ['$type', 'waste'] }, '$qty', 0] } },
        wasteValue: {
          $sum: { $cond: [{ $eq: ['$type', 'waste'] }, { $multiply: ['$qty', '$unitCost'] }, 0] },
        },
        returned: { $sum: { $cond: [{ $eq: ['$type', 'return'] }, '$qty', 0] } },
        adjusted: {
          $sum: {
            $cond: [{ $in: ['$type', ['adjustment', 'stocktake']] }, '$qty', 0],
          },
        },
      },
    },
  ]);
  const aggById = Object.fromEntries(aggs.map((a) => [String(a._id), a]));

  const rows = ingredients.map((ing) => {
    const opening = openingById[String(ing._id)] ?? 0;
    const a = aggById[String(ing._id)] || {
      purchased: 0,
      consumed: 0,
      consumedValue: 0,
      waste: 0,
      wasteValue: 0,
      returned: 0,
      adjusted: 0,
    };
    const closing = opening + a.purchased + a.consumed + a.waste + a.returned + a.adjusted;

    return {
      ingredientId: String(ing._id),
      nameAr: ing.nameAr,
      nameEn: ing.nameEn,
      unit: ing.unit,
      openingQty: round(opening),
      purchasedQty: round(a.purchased),
      consumedQty: round(Math.abs(a.consumed) - a.returned), // الصافي: المستهلك ناقص المرتجع
      wasteQty: round(Math.abs(a.waste)),
      adjustedQty: round(a.adjusted),
      closingQty: round(closing),
      consumedValue: round(-a.consumedValue),
      wasteValue: round(-a.wasteValue),
    };
  });

  rows.sort((a, b) => b.consumedValue - a.consumedValue);

  const totals = rows.reduce(
    (t, r) => ({
      consumedValue: round(t.consumedValue + r.consumedValue),
      wasteValue: round(t.wasteValue + r.wasteValue),
    }),
    { consumedValue: 0, wasteValue: 0 }
  );

  return { rows, totals, range: { from, to } };
}

/** GET /api/reports/consumption?from=&to= */
router.get(
  '/consumption',
  wrap(async (req, res) => res.json(await consumption(req.query)))
);

/** GET /api/reports/consumption/export.csv */
router.get(
  '/consumption/export.csv',
  wrap(async (req, res) => {
    const { rows } = await consumption(req.query);
    sendCSV(res, 'consumption.csv', rows, [
      { key: 'nameAr', label: 'Ingredient' },
      { key: 'nameEn', label: 'Ingredient (EN)' },
      { key: 'unit', label: 'Unit' },
      { key: 'openingQty', label: 'Opening' },
      { key: 'purchasedQty', label: 'Purchased' },
      { key: 'consumedQty', label: 'Consumed' },
      { key: 'wasteQty', label: 'Waste' },
      { key: 'closingQty', label: 'Closing' },
      { key: 'consumedValue', label: 'Consumed value' },
    ]);
  })
);

/* ================================================================
 * تقرير الفواتير المفصّل
 * ============================================================== */

/** GET /api/reports/orders — كل الفواتير في الفترة بكل الفلاتر */
router.get(
  '/orders',
  wrap(async (req, res) => {
    const f = await buildOrderFilter(req.query, req.user, { includeVoid: req.query.status === 'void' });
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const page = Math.max(Number(req.query.page) || 1, 1);

    const [rows, total] = await Promise.all([
      Order.find(f)
        .sort({ closedAt: -1, openedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('tableId', 'number name')
        .populate('userId', 'name')
        .lean(),
      Order.countDocuments(f),
    ]);

    const [sum] = await Order.aggregate([
      { $match: f },
      { $group: { _id: null, revenue: { $sum: '$total' }, count: { $sum: 1 } } },
    ]);

    res.json({
      rows,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      totals: { revenue: round(sum?.revenue || 0), count: sum?.count || 0 },
    });
  })
);

/** GET /api/reports/orders/export.csv */
router.get(
  '/orders/export.csv',
  wrap(async (req, res) => {
    const f = await buildOrderFilter(req.query, req.user, { includeVoid: req.query.status === 'void' });
    const rows = await Order.find(f)
      .sort({ closedAt: -1 })
      .limit(5000)
      .populate('tableId', 'number')
      .populate('userId', 'name')
      .lean();

    sendCSV(res, 'orders.csv', rows, [
      { key: 'id', label: 'Order', get: (r) => String(r._id).slice(-6).toUpperCase() },
      { key: 'openedAt', label: 'Opened', get: (r) => new Date(r.openedAt).toISOString() },
      { key: 'closedAt', label: 'Closed', get: (r) => (r.closedAt ? new Date(r.closedAt).toISOString() : '') },
      { key: 'table', label: 'Table', get: (r) => r.tableId?.number ?? '' },
      { key: 'user', label: 'Staff', get: (r) => r.userId?.name || '' },
      { key: 'status', label: 'Status' },
      { key: 'paymentMethod', label: 'Payment' },
      { key: 'items', label: 'Items', get: (r) => r.items.reduce((s, i) => s + i.qty, 0) },
      { key: 'subtotal', label: 'Subtotal' },
      { key: 'discount', label: 'Discount', get: (r) => round(r.subtotal - r.total) },
      { key: 'total', label: 'Total' },
    ]);
  })
);

export default router;
