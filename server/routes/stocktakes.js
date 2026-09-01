import { Router } from 'express';
import Ingredient from '../models/Ingredient.js';
import StockMovement from '../models/StockMovement.js';
import Stocktake from '../models/Stocktake.js';
import { managerOnly } from '../middleware/auth.js';
import { wrap, fail } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { withTx } from '../inventory.js';
import { sendCSV } from '../utils/csv.js';
import { resolveRange } from '../utils/dates.js';
import { oid } from '../filters.js';

const round = (n) => Math.round((n || 0) * 1000) / 1000;

const router = Router();
router.use(managerOnly); // 🔒 الجرد للمدير بس

/**
 * POST /api/stocktakes { from, to }
 * بيبني جرد draft والمتوقّع محسوب لكل خامة:
 *   الافتتاحي + الوارد − المستهلك − الهالك ± التسويات = المتوقّع
 */
router.post(
  '/',
  wrap(async (req, res) => {
    const { from, to } = resolveRange({ from: req.body?.from, to: req.body?.to, range: 'custom' });
    if (!from || !to || !(from < to)) return fail(res, 'BAD_RANGE', 400);

    const ingredients = await Ingredient.find({ active: true }).lean();

    // الرصيد الافتتاحي لكل الخامات: آخر حركة قبل بداية الفترة
    const openings = await StockMovement.aggregate([
      { $match: { at: { $lt: from } } },
      { $sort: { at: -1 } },
      { $group: { _id: '$ingredientId', balanceAfter: { $first: '$balanceAfter' } } },
    ]);
    const openingById = Object.fromEntries(openings.map((o) => [String(o._id), o.balanceAfter]));

    // مجاميع الحركات جوّه الفترة، كل نوع لوحده
    const aggs = await StockMovement.aggregate([
      { $match: { at: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: '$ingredientId',
          purchased: { $sum: { $cond: [{ $eq: ['$type', 'purchase'] }, '$qty', 0] } },
          consumed: { $sum: { $cond: [{ $eq: ['$type', 'sale'] }, '$qty', 0] } },
          waste: { $sum: { $cond: [{ $eq: ['$type', 'waste'] }, '$qty', 0] } },
          returned: { $sum: { $cond: [{ $eq: ['$type', 'return'] }, '$qty', 0] } },
          adjusted: { $sum: { $cond: [{ $eq: ['$type', 'adjustment'] }, '$qty', 0] } },
          stocktaken: { $sum: { $cond: [{ $eq: ['$type', 'stocktake'] }, '$qty', 0] } },
        },
      },
    ]);
    const aggById = Object.fromEntries(aggs.map((a) => [String(a._id), a]));

    const lines = ingredients.map((ing) => {
      const openingQty = openingById[String(ing._id)] ?? 0;
      const a = aggById[String(ing._id)] || {
        purchased: 0,
        consumed: 0,
        waste: 0,
        returned: 0,
        adjusted: 0,
        stocktaken: 0,
      };

      // consumed و waste متخزّنين بالسالب أصلاً، فبنجمع كله بإشارته
      const expectedQty =
        openingQty + a.purchased + a.consumed + a.waste + a.returned + a.adjusted + a.stocktaken;

      return {
        ingredientId: ing._id,
        openingQty: round(openingQty),
        purchasedQty: round(a.purchased),
        consumedQty: round(Math.abs(a.consumed)), // بالموجب للعرض
        wasteQty: round(Math.abs(a.waste)),
        returnedQty: round(a.returned),
        adjustedQty: round(a.adjusted + a.stocktaken),
        expectedQty: round(expectedQty),
        countedQty: null,
        diffQty: null,
        diffValue: null,
        unitCost: ing.costPerUnit,
      };
    });

    const stocktake = await Stocktake.create({
      from,
      to,
      status: 'draft',
      createdBy: req.user.id,
      lines,
      note: req.body?.note || '',
    });

    await audit({
      userId: req.user.id,
      action: 'stocktake.create',
      entity: 'Stocktake',
      entityId: stocktake._id,
      after: { from, to, lines: lines.length },
    });

    res.status(201).json(await withIngredients(stocktake.toObject()));
  })
);

/** بيلزق بيانات الخامة مع كل سطر عشان الواجهة تعرض الاسم والوحدة من غير نداء تاني */
async function withIngredients(st) {
  const ings = await Ingredient.find({ _id: { $in: st.lines.map((l) => l.ingredientId) } }).lean();
  const byId = Object.fromEntries(ings.map((i) => [String(i._id), i]));
  return {
    ...st,
    lines: st.lines.map((l) => ({
      ...l,
      ingredient: byId[String(l.ingredientId)] || null,
    })),
  };
}

/** GET /api/stocktakes ?<فلاتر> */
router.get(
  '/',
  wrap(async (req, res) => {
    const f = {};
    if (req.query.status && ['draft', 'closed'].includes(req.query.status)) f.status = req.query.status;
    const { from, to } = resolveRange(req.query);
    if (from || to) {
      f.createdAt = {};
      if (from) f.createdAt.$gte = from;
      if (to) f.createdAt.$lte = to;
    }

    const rows = await Stocktake.find(f)
      .sort({ createdAt: -1 })
      .limit(100)
      .select('from to status createdBy closedAt totalDiffValue createdAt lines')
      .populate('createdBy', 'name')
      .lean();

    res.json(
      rows.map((r) => ({
        ...r,
        linesCount: r.lines?.length || 0,
        countedCount: (r.lines || []).filter((l) => l.countedQty !== null && l.countedQty !== undefined).length,
        lines: undefined, // القائمة مش محتاجة كل السطور
      }))
    );
  })
);

/** GET /api/stocktakes/:id */
router.get(
  '/:id',
  wrap(async (req, res) => {
    if (!oid(req.params.id)) return fail(res, 'BAD_ID', 400);
    const st = await Stocktake.findById(req.params.id).populate('createdBy', 'name').lean();
    if (!st) return fail(res, 'NOT_FOUND', 404);
    res.json(await withIngredients(st));
  })
);

/** PATCH /api/stocktakes/:id { lines: [{ ingredientId, countedQty }] } — حفظ المعدود */
router.patch(
  '/:id',
  wrap(async (req, res) => {
    const st = await Stocktake.findById(req.params.id);
    if (!st) return fail(res, 'NOT_FOUND', 404);
    if (st.status === 'closed') return fail(res, 'STOCKTAKE_CLOSED', 409); // ⛔ المقفول مايتعدّلش

    const incoming = Array.isArray(req.body?.lines) ? req.body.lines : [];
    const byId = Object.fromEntries(
      incoming.map((l) => [String(l.ingredientId), l.countedQty === null || l.countedQty === '' ? null : Number(l.countedQty)])
    );

    for (const line of st.lines) {
      const key = String(line.ingredientId);
      if (!(key in byId)) continue;

      const counted = byId[key];
      if (counted !== null && !Number.isFinite(counted)) return fail(res, 'INVALID_QTY', 400);

      line.countedQty = counted;
      line.diffQty = counted === null ? null : round(counted - line.expectedQty);
      line.diffValue = counted === null ? null : round(line.diffQty * (line.unitCost || 0));
    }

    st.totalDiffValue = round(st.lines.reduce((s, l) => s + (l.diffValue || 0), 0));
    await st.save();

    res.json(await withIngredients(st.toObject()));
  })
);

/**
 * POST /api/stocktakes/:id/close
 * بيظبط رصيد كل خامة على المعدود، وبيعمل حركة stocktake بالفرق.
 */
router.post(
  '/:id/close',
  wrap(async (req, res) => {
    const st = await Stocktake.findById(req.params.id);
    if (!st) return fail(res, 'NOT_FOUND', 404);
    if (st.status === 'closed') return fail(res, 'ALREADY_CLOSED', 409);

    const counted = st.lines.filter((l) => l.countedQty !== null && l.countedQty !== undefined);
    if (!counted.length) return fail(res, 'NOTHING_COUNTED', 400);

    const before = { status: st.status, totalDiffValue: st.totalDiffValue };

    await withTx(async (session) => {
      let totalDiffValue = 0;

      for (const line of st.lines) {
        if (line.countedQty === null || line.countedQty === undefined) continue;

        const q = Ingredient.findById(line.ingredientId);
        const ing = await (session ? q.session(session) : q);
        if (!ing) continue;

        line.unitCost = ing.costPerUnit; // بنجمّد التكلفة وقت القفل
        line.diffQty = round(line.countedQty - line.expectedQty);
        line.diffValue = round(line.diffQty * ing.costPerUnit);
        totalDiffValue += line.diffValue;

        if (line.diffQty !== 0) {
          // حركة تسوية بالفرق — والرصيد يبقى المعدود بالظبط
          await StockMovement.create(
            [
              {
                ingredientId: ing._id,
                type: 'stocktake',
                qty: line.diffQty,
                balanceAfter: line.countedQty,
                unitCost: ing.costPerUnit,
                refType: 'stocktake',
                refId: st._id,
                userId: req.user.id,
                note: 'stocktake close',
                at: new Date(),
              },
            ],
            session ? { session } : undefined
          );

          ing.currentQty = line.countedQty;
          await ing.save(session ? { session } : undefined);
        }
      }

      st.totalDiffValue = round(totalDiffValue);
      st.status = 'closed';
      st.closedAt = new Date();
      await st.save(session ? { session } : undefined);
    });

    await audit({
      userId: req.user.id,
      action: 'stocktake.close',
      entity: 'Stocktake',
      entityId: st._id,
      before,
      after: { status: 'closed', totalDiffValue: st.totalDiffValue, lines: counted.length },
    });

    res.json(await withIngredients(st.toObject()));
  })
);

/** GET /api/stocktakes/:id/export.csv */
router.get(
  '/:id/export.csv',
  wrap(async (req, res) => {
    const st = await Stocktake.findById(req.params.id).lean();
    if (!st) return fail(res, 'NOT_FOUND', 404);
    const full = await withIngredients(st);

    sendCSV(res, `stocktake-${String(st._id).slice(-6)}.csv`, full.lines, [
      { key: 'name', label: 'Ingredient', get: (r) => r.ingredient?.nameAr || '' },
      { key: 'nameEn', label: 'Ingredient (EN)', get: (r) => r.ingredient?.nameEn || '' },
      { key: 'unit', label: 'Unit', get: (r) => r.ingredient?.unit || '' },
      { key: 'openingQty', label: 'Opening' },
      { key: 'purchasedQty', label: 'Purchased' },
      { key: 'consumedQty', label: 'Consumed' },
      { key: 'wasteQty', label: 'Waste' },
      { key: 'adjustedQty', label: 'Adjustments' },
      { key: 'expectedQty', label: 'Expected' },
      { key: 'countedQty', label: 'Counted' },
      { key: 'diffQty', label: 'Difference' },
      { key: 'diffValue', label: 'Difference value' },
    ]);
  })
);

export default router;
