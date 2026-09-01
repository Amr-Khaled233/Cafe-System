import { Router } from 'express';
import Ingredient from '../models/Ingredient.js';
import StockMovement from '../models/StockMovement.js';
import { managerOnly } from '../middleware/auth.js';
import { wrap, fail } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { buildMovementFilter, rx, oid } from '../filters.js';
import { applyMovement, withTx } from '../inventory.js';
import { sendCSV } from '../utils/csv.js';

const router = Router();
router.use(managerOnly); // 🔒 المخزون كله للمدير بس

/** GET /api/ingredients?status=low|out|all&q= — مرتّب بالأخطر الأول */
router.get(
  '/',
  wrap(async (req, res) => {
    const f = {};
    if (req.query.active !== 'all') f.active = true;
    if (req.query.q) {
      const r = rx(req.query.q);
      f.$or = [{ nameAr: r }, { nameEn: r }];
    }

    let rows = await Ingredient.find(f).lean({ virtuals: true });

    // الحالة بتتحسب من الرصيد وحد التنبيه
    rows = rows.map((i) => ({
      ...i,
      stockStatus: i.currentQty <= 0 ? 'out' : i.currentQty <= i.minQty ? 'low' : 'ok',
      stockValue: Math.round(i.currentQty * i.costPerUnit * 100) / 100,
    }));

    if (req.query.status === 'low') rows = rows.filter((i) => i.stockStatus !== 'ok');
    if (req.query.status === 'out') rows = rows.filter((i) => i.stockStatus === 'out');

    // الأخطر فوق: خلصت ← قربت تخلص ← متوفّرة
    const rank = { out: 0, low: 1, ok: 2 };
    rows.sort((a, b) => rank[a.stockStatus] - rank[b.stockStatus] || a.nameAr.localeCompare(b.nameAr, 'ar'));

    res.json(rows);
  })
);

/** POST /api/ingredients — خامة جديدة. الرصيد الابتدائي بيتسجّل كحركة purchase */
router.post(
  '/',
  wrap(async (req, res) => {
    const { nameAr, nameEn, unit, minQty, costPerUnit, openingQty } = req.body || {};
    if (!nameAr || !nameEn) return fail(res, 'MISSING_NAME', 400);
    if (!['g', 'ml', 'pc'].includes(unit)) return fail(res, 'INVALID_UNIT', 400);

    const ing = await Ingredient.create({
      nameAr,
      nameEn,
      unit,
      currentQty: 0,
      minQty: Number(minQty) || 0,
      costPerUnit: Number(costPerUnit) || 0,
    });

    // أي رصيد ابتدائي بيدخل كحركة عشان يفضل مفسّر
    const open = Number(openingQty) || 0;
    if (open > 0) {
      await applyMovement({
        ingredientId: ing._id,
        delta: open,
        type: 'purchase',
        refType: 'manual',
        userId: req.user.id,
        note: 'opening balance',
      });
    }

    const fresh = await Ingredient.findById(ing._id).lean();
    await audit({ userId: req.user.id, action: 'ingredient.create', entity: 'Ingredient', entityId: ing._id, after: fresh });
    res.status(201).json(fresh);
  })
);

/**
 * PATCH /api/ingredients/:id — الاسم والوحدة والحد والتكلفة بس.
 * ⛔ currentQty مش مسموح يتعدّل من هنا — لازم يعدّي على حركة.
 */
router.patch(
  '/:id',
  wrap(async (req, res) => {
    if (req.body?.currentQty !== undefined) return fail(res, 'USE_MOVEMENT_INSTEAD', 400);

    const before = await Ingredient.findById(req.params.id).lean();
    if (!before) return fail(res, 'NOT_FOUND', 404);

    const patch = {};
    for (const k of ['nameAr', 'nameEn', 'active']) {
      if (req.body?.[k] !== undefined) patch[k] = req.body[k];
    }
    if (req.body?.unit !== undefined) {
      if (!['g', 'ml', 'pc'].includes(req.body.unit)) return fail(res, 'INVALID_UNIT', 400);
      patch.unit = req.body.unit;
    }
    for (const k of ['minQty', 'costPerUnit']) {
      if (req.body?.[k] !== undefined) {
        const n = Number(req.body[k]);
        if (!Number.isFinite(n) || n < 0) return fail(res, 'INVALID_NUMBER', 400);
        patch[k] = n;
      }
    }

    const ing = await Ingredient.findByIdAndUpdate(req.params.id, patch, { new: true });
    await audit({ userId: req.user.id, action: 'ingredient.update', entity: 'Ingredient', entityId: ing._id, before, after: ing });
    res.json(ing);
  })
);

/**
 * POST /api/ingredients/:id/movement { type, qty, unitCost?, note }
 * وارد / هالك / تسوية / مرتجع. الإشارة بتتحدد من النوع.
 */
router.post(
  '/:id/movement',
  wrap(async (req, res) => {
    const ing = await Ingredient.findById(req.params.id).lean();
    if (!ing) return fail(res, 'NOT_FOUND', 404);

    const type = req.body?.type;
    if (!['purchase', 'waste', 'adjustment', 'return'].includes(type)) {
      return fail(res, 'INVALID_MOVEMENT_TYPE', 400);
    }

    const qty = Number(req.body?.qty);
    if (!Number.isFinite(qty) || qty === 0) return fail(res, 'INVALID_QTY', 400);

    // الوارد والمرتجع دخول (موجب)، الهالك خروج (سالب)، التسوية بإشارتها زي ما اتبعتت
    let delta;
    if (type === 'purchase' || type === 'return') delta = Math.abs(qty);
    else if (type === 'waste') delta = -Math.abs(qty);
    else delta = qty;

    const unitCost = req.body?.unitCost !== undefined ? Number(req.body.unitCost) : undefined;
    if (unitCost !== undefined && (!Number.isFinite(unitCost) || unitCost < 0)) {
      return fail(res, 'INVALID_NUMBER', 400);
    }

    const note = String(req.body?.note || '').trim();
    if (type === 'adjustment' && !note) return fail(res, 'REASON_REQUIRED', 400);

    const updated = await withTx(async (session) => {
      const out = await applyMovement(
        {
          ingredientId: ing._id,
          delta,
          type,
          refType: 'manual',
          userId: req.user.id,
          note,
          unitCost,
        },
        session
      );

      // شراء بتكلفة جديدة → بنحدّث تكلفة الوحدة للأمام بس، الحركات القديمة بتفضل بتكلفتها
      if (type === 'purchase' && unitCost !== undefined) {
        await Ingredient.findByIdAndUpdate(
          ing._id,
          { costPerUnit: unitCost },
          session ? { session } : undefined
        );
      }
      return out;
    });

    await audit({
      userId: req.user.id,
      action: `stock.${type}`,
      entity: 'Ingredient',
      entityId: ing._id,
      before: { currentQty: ing.currentQty, costPerUnit: ing.costPerUnit },
      after: { currentQty: updated.currentQty, delta, type, note },
    });

    const fresh = await Ingredient.findById(ing._id).lean();
    res.status(201).json(fresh);
  })
);

/** GET /api/ingredients/:id/movements?from=&to=&type= — سجل حركة خامة واحدة */
router.get(
  '/:id/movements',
  wrap(async (req, res) => {
    if (!oid(req.params.id)) return fail(res, 'BAD_ID', 400);
    const f = { ...buildMovementFilter(req.query), ingredientId: oid(req.params.id) };

    const rows = await StockMovement.find(f).sort({ at: -1 }).limit(500).populate('userId', 'name').lean();
    res.json(rows);
  })
);

/** GET /api/ingredients/movements — كل الحركات (شاشة حركة المخزون) */
router.get(
  '/movements/all',
  wrap(async (req, res) => {
    const f = buildMovementFilter(req.query);
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const page = Math.max(Number(req.query.page) || 1, 1);

    const [rows, total] = await Promise.all([
      StockMovement.find(f)
        .sort({ at: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('ingredientId', 'nameAr nameEn unit')
        .populate('userId', 'name')
        .lean(),
      StockMovement.countDocuments(f),
    ]);

    res.json({ rows, total, page, limit, pages: Math.ceil(total / limit) });
  })
);

/** GET /api/ingredients/movements/export.csv */
router.get(
  '/movements/export.csv',
  wrap(async (req, res) => {
    const f = buildMovementFilter(req.query);
    const rows = await StockMovement.find(f)
      .sort({ at: -1 })
      .limit(5000)
      .populate('ingredientId', 'nameAr nameEn unit')
      .populate('userId', 'name')
      .lean();

    sendCSV(res, 'stock-movements.csv', rows, [
      { key: 'at', label: 'Date', get: (r) => new Date(r.at).toISOString() },
      { key: 'ingredient', label: 'Ingredient', get: (r) => r.ingredientId?.nameAr || '' },
      { key: 'ingredientEn', label: 'Ingredient (EN)', get: (r) => r.ingredientId?.nameEn || '' },
      { key: 'unit', label: 'Unit', get: (r) => r.ingredientId?.unit || '' },
      { key: 'type', label: 'Type' },
      { key: 'qty', label: 'Qty' },
      { key: 'balanceAfter', label: 'Balance after' },
      { key: 'unitCost', label: 'Unit cost' },
      { key: 'value', label: 'Value', get: (r) => Math.round(r.qty * r.unitCost * 100) / 100 },
      { key: 'user', label: 'User', get: (r) => r.userId?.name || '' },
      { key: 'note', label: 'Note' },
    ]);
  })
);

export default router;
