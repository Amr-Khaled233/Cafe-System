import { Router } from 'express';
import MenuItem from '../models/MenuItem.js';
import Ingredient from '../models/Ingredient.js';
import { managerOnly } from '../middleware/auth.js';
import { wrap, fail } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { oid, rx } from '../filters.js';

const router = Router();

/**
 * بيحسب أقصى عدد أكواب ممكن تتعمل من الرصيد الحالي.
 * أقل خامة في الوصفة هي اللي بتحدد العدد.
 * بيرجّع null للأصناف اللي مابتخصمش من المخزون.
 */
export function withMaxServings(menuItems, ingredientsById) {
  return menuItems.map((mi) => {
    if (!mi.trackStock || !mi.recipe?.length) return { ...mi, maxServings: null, missing: [] };

    const missing = [];
    const per = mi.recipe.map((line) => {
      const ing = ingredientsById[String(line.ingredientId)];
      if (!ing || line.qty <= 0) return Infinity;
      const n = ing.currentQty / line.qty;
      if (n < 1) missing.push({ nameAr: ing.nameAr, nameEn: ing.nameEn });
      return n;
    });

    const maxServings = Math.floor(Math.min(...per));
    return {
      ...mi,
      maxServings: Number.isFinite(maxServings) ? Math.max(0, maxServings) : null,
      missing, // الخامات اللي مش كفاية لكوب واحد — الواجهة بتعرضها كسبب القفل
    };
  });
}

/**
 * GET /api/menu?categoryId=&q=&available=
 * متاح للدورين — الريسبشن محتاج يعرف الصنف خلص ولا لأ، بس من غير أرقام مخزون.
 */
router.get(
  '/',
  wrap(async (req, res) => {
    const f = {};
    if (oid(req.query.categoryId)) f.categoryId = oid(req.query.categoryId);
    if (req.query.available === 'true') f.available = true;
    if (req.query.available === 'false') f.available = false;
    if (req.query.q) {
      const r = rx(req.query.q);
      f.$or = [{ nameAr: r }, { nameEn: r }];
    }

    const items = await MenuItem.find(f).sort({ nameAr: 1 }).lean();
    const ings = await Ingredient.find().select('nameAr nameEn unit currentQty costPerUnit').lean();
    const byId = Object.fromEntries(ings.map((i) => [String(i._id), i]));

    const withStock = withMaxServings(items, byId);

    // 🔒 الريسبشن مايشوفش الوصفة ولا التكلفة — بس يعرف العدد المتاح وسبب القفل
    const isManager = req.user.role === 'manager';
    res.json(
      withStock.map((mi) => (isManager ? mi : { ...mi, recipe: undefined }))
    );
  })
);

/** GET /api/menu/:id/recipe (مدير) — الوصفة + التكلفة + الهامش + أقصى عدد أكواب */
router.get(
  '/:id/recipe',
  managerOnly,
  wrap(async (req, res) => {
    const mi = await MenuItem.findById(req.params.id).lean();
    if (!mi) return fail(res, 'NOT_FOUND', 404);

    const ings = await Ingredient.find({ _id: { $in: (mi.recipe || []).map((l) => l.ingredientId) } }).lean();
    const byId = Object.fromEntries(ings.map((i) => [String(i._id), i]));

    const lines = (mi.recipe || []).map((l) => {
      const ing = byId[String(l.ingredientId)];
      return {
        ingredientId: String(l.ingredientId),
        qty: l.qty,
        nameAr: ing?.nameAr || '',
        nameEn: ing?.nameEn || '',
        unit: ing?.unit || 'g',
        costPerUnit: ing?.costPerUnit || 0,
        lineCost: (ing?.costPerUnit || 0) * l.qty, // تكلفة الخامة دي في الكوب الواحد
        currentQty: ing?.currentQty || 0,
      };
    });

    const cost = lines.reduce((s, l) => s + l.lineCost, 0);
    const profit = mi.price - cost;
    const [{ maxServings }] = withMaxServings([mi], byId);

    res.json({
      menuItemId: String(mi._id),
      nameAr: mi.nameAr,
      nameEn: mi.nameEn,
      price: mi.price,
      trackStock: mi.trackStock,
      lines,
      cost: Math.round(cost * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      marginPct: mi.price > 0 ? Math.round((profit / mi.price) * 1000) / 10 : 0,
      maxServings,
    });
  })
);

/** PUT /api/menu/:id/recipe (مدير) */
router.put(
  '/:id/recipe',
  managerOnly,
  wrap(async (req, res) => {
    const before = await MenuItem.findById(req.params.id).lean();
    if (!before) return fail(res, 'NOT_FOUND', 404);

    const recipe = Array.isArray(req.body?.recipe) ? req.body.recipe : [];
    const clean = [];
    for (const l of recipe) {
      const id = oid(l.ingredientId);
      const q = Number(l.qty);
      if (!id || !Number.isFinite(q) || q < 0) return fail(res, 'INVALID_RECIPE_LINE', 400);
      clean.push({ ingredientId: id, qty: q });
    }

    const mi = await MenuItem.findByIdAndUpdate(req.params.id, { recipe: clean }, { new: true });
    await audit({
      userId: req.user.id,
      action: 'menu.recipe.update',
      entity: 'MenuItem',
      entityId: mi._id,
      before: { recipe: before.recipe },
      after: { recipe: mi.recipe },
    });
    res.json(mi);
  })
);

/** POST /api/menu (مدير) */
router.post(
  '/',
  managerOnly,
  wrap(async (req, res) => {
    const { nameAr, nameEn, price, categoryId, available, trackStock, recipe } = req.body || {};
    if (!nameAr || !nameEn) return fail(res, 'MISSING_NAME', 400);
    if (!oid(categoryId)) return fail(res, 'INVALID_CATEGORY', 400);
    if (!Number.isFinite(Number(price)) || Number(price) < 0) return fail(res, 'INVALID_PRICE', 400);

    // نفس تحقق PUT /recipe — مانقبلش سطور ناقصة أو كميات سالبة
    const clean = [];
    for (const l of Array.isArray(recipe) ? recipe : []) {
      const iid = oid(l?.ingredientId);
      const q = Number(l?.qty);
      if (!iid || !Number.isFinite(q) || q < 0) return fail(res, 'INVALID_RECIPE_LINE', 400);
      clean.push({ ingredientId: iid, qty: q });
    }

    const mi = await MenuItem.create({
      nameAr: String(nameAr).trim(),
      nameEn: String(nameEn).trim(),
      price: Number(price),
      categoryId: oid(categoryId),
      available: available !== false,
      trackStock: trackStock !== false,
      recipe: clean,
    });
    await audit({ userId: req.user.id, action: 'menu.create', entity: 'MenuItem', entityId: mi._id, after: mi });
    res.status(201).json(mi);
  })
);

/**
 * PATCH /api/menu/:id (مدير)
 * تغيير السعر هنا مايأثرش على أي فاتورة قديمة — السعر متنسوخ جوّه سطر الفاتورة.
 */
router.patch(
  '/:id',
  managerOnly,
  wrap(async (req, res) => {
    const before = await MenuItem.findById(req.params.id).lean();
    if (!before) return fail(res, 'NOT_FOUND', 404);

    const patch = {};
    for (const k of ['nameAr', 'nameEn', 'available', 'trackStock']) {
      if (req.body?.[k] !== undefined) patch[k] = req.body[k];
    }
    if (req.body?.price !== undefined) {
      const p = Number(req.body.price);
      if (!Number.isFinite(p) || p < 0) return fail(res, 'INVALID_PRICE', 400);
      patch.price = p;
    }
    if (req.body?.categoryId !== undefined) {
      if (!oid(req.body.categoryId)) return fail(res, 'INVALID_CATEGORY', 400);
      patch.categoryId = oid(req.body.categoryId);
    }

    const mi = await MenuItem.findByIdAndUpdate(req.params.id, patch, { new: true });
    await audit({ userId: req.user.id, action: 'menu.update', entity: 'MenuItem', entityId: mi._id, before, after: mi });
    res.json(mi);
  })
);

/** DELETE /api/menu/:id (مدير) — بنعطّله بس، عشان الفواتير القديمة تفضل مفهومة */
router.delete(
  '/:id',
  managerOnly,
  wrap(async (req, res) => {
    const before = await MenuItem.findById(req.params.id).lean();
    if (!before) return fail(res, 'NOT_FOUND', 404);
    const mi = await MenuItem.findByIdAndUpdate(req.params.id, { available: false }, { new: true });
    await audit({ userId: req.user.id, action: 'menu.disable', entity: 'MenuItem', entityId: mi._id, before, after: mi });
    res.json({ ok: true, item: mi });
  })
);

export default router;
