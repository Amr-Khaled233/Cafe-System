import { Router } from 'express';
import Ingredient from '../models/Ingredient.js';
import StockMovement from '../models/StockMovement.js';
import { managerOnly } from '../middleware/auth.js';
import { wrap } from '../utils/errors.js';
import { sendCSV } from '../utils/csv.js';
import { addDays, startOfDay } from '../utils/dates.js';

const router = Router();
router.use(managerOnly); // 🔒 أرصدة المخزون وقيمته للمدير بس

/** GET /api/inventory/summary — كروت: خالص / قرب يخلص / قيمة المخزون */
router.get(
  '/summary',
  wrap(async (req, res) => {
    const rows = await Ingredient.find({ active: true }).select('currentQty minQty costPerUnit').lean();

    let out = 0;
    let low = 0;
    let value = 0;
    for (const i of rows) {
      if (i.currentQty <= 0) out += 1;
      else if (i.currentQty <= i.minQty) low += 1;
      value += i.currentQty * i.costPerUnit;
    }

    res.json({
      ingredientsCount: rows.length,
      outCount: out,
      lowCount: low,
      okCount: rows.length - out - low,
      stockValue: Math.round(value * 100) / 100,
    });
  })
);

/**
 * GET /api/inventory/low?days=7
 * الناقص + الكمية المقترح شراؤها:
 *   متوسط الاستهلاك اليومي في آخر 30 يوم × عدد الأيام المطلوبة − الرصيد الحالي
 */
router.get(
  '/low',
  wrap(async (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
    const since = addDays(startOfDay(new Date()), -30);

    const ings = await Ingredient.find({ active: true }).lean();

    // الاستهلاك الصافي في آخر 30 يوم (بيع + هالك) — بالموجب
    const usage = await StockMovement.aggregate([
      { $match: { at: { $gte: since }, type: { $in: ['sale', 'waste'] } } },
      { $group: { _id: '$ingredientId', used: { $sum: '$qty' } } },
    ]);
    const usedById = Object.fromEntries(usage.map((u) => [String(u._id), Math.abs(u.used)]));

    const rows = ings
      .map((i) => {
        const used30 = usedById[String(i._id)] || 0;
        const dailyAvg = used30 / 30;
        const suggested = Math.max(0, Math.ceil(dailyAvg * days - i.currentQty));
        return {
          _id: String(i._id),
          nameAr: i.nameAr,
          nameEn: i.nameEn,
          unit: i.unit,
          currentQty: i.currentQty,
          minQty: i.minQty,
          costPerUnit: i.costPerUnit,
          stockStatus: i.currentQty <= 0 ? 'out' : i.currentQty <= i.minQty ? 'low' : 'ok',
          dailyAvg: Math.round(dailyAvg * 100) / 100,
          suggestedQty: suggested,
          suggestedCost: Math.round(suggested * i.costPerUnit * 100) / 100,
        };
      })
      .filter((r) => r.stockStatus !== 'ok' || r.suggestedQty > 0);

    const rank = { out: 0, low: 1, ok: 2 };
    rows.sort((a, b) => rank[a.stockStatus] - rank[b.stockStatus] || b.suggestedCost - a.suggestedCost);

    res.json({
      days,
      rows,
      totalCost: Math.round(rows.reduce((s, r) => s + r.suggestedCost, 0) * 100) / 100,
    });
  })
);

/** GET /api/inventory/low/export.csv */
router.get(
  '/low/export.csv',
  wrap(async (req, res) => {
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
    const since = addDays(startOfDay(new Date()), -30);
    const ings = await Ingredient.find({ active: true }).lean();
    const usage = await StockMovement.aggregate([
      { $match: { at: { $gte: since }, type: { $in: ['sale', 'waste'] } } },
      { $group: { _id: '$ingredientId', used: { $sum: '$qty' } } },
    ]);
    const usedById = Object.fromEntries(usage.map((u) => [String(u._id), Math.abs(u.used)]));

    const rows = ings
      .map((i) => {
        const dailyAvg = (usedById[String(i._id)] || 0) / 30;
        const suggested = Math.max(0, Math.ceil(dailyAvg * days - i.currentQty));
        return { ...i, dailyAvg: Math.round(dailyAvg * 100) / 100, suggestedQty: suggested };
      })
      .filter((r) => r.currentQty <= r.minQty || r.suggestedQty > 0);

    sendCSV(res, 'purchase-list.csv', rows, [
      { key: 'nameAr', label: 'Ingredient' },
      { key: 'nameEn', label: 'Ingredient (EN)' },
      { key: 'unit', label: 'Unit' },
      { key: 'currentQty', label: 'Current' },
      { key: 'minQty', label: 'Min' },
      { key: 'dailyAvg', label: 'Daily avg (30d)' },
      { key: 'suggestedQty', label: 'Suggested qty' },
      { key: 'cost', label: 'Suggested cost', get: (r) => Math.round(r.suggestedQty * r.costPerUnit * 100) / 100 },
    ]);
  })
);

/** GET /api/inventory/export.csv — كل الأرصدة الحالية */
router.get(
  '/export.csv',
  wrap(async (req, res) => {
    const rows = await Ingredient.find({ active: true }).sort({ nameAr: 1 }).lean();
    sendCSV(res, 'inventory.csv', rows, [
      { key: 'nameAr', label: 'Ingredient' },
      { key: 'nameEn', label: 'Ingredient (EN)' },
      { key: 'unit', label: 'Unit' },
      { key: 'currentQty', label: 'Current qty' },
      { key: 'minQty', label: 'Min qty' },
      { key: 'costPerUnit', label: 'Cost per unit' },
      { key: 'value', label: 'Stock value', get: (r) => Math.round(r.currentQty * r.costPerUnit * 100) / 100 },
      {
        key: 'status',
        label: 'Status',
        get: (r) => (r.currentQty <= 0 ? 'out' : r.currentQty <= r.minQty ? 'low' : 'ok'),
      },
    ]);
  })
);

export default router;
