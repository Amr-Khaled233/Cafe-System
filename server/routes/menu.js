import { Router } from 'express';
import MenuItem from '../models/MenuItem.js';
import Ingredient from '../models/Ingredient.js';
import { managerOnly } from '../middleware/auth.js';
import { wrap, fail } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { oid, rx } from '../filters.js';

const router = Router();

/**
 * أقصى عدد أكواب ممكن تتعمل من وصفة معيّنة بالرصيد الحالي.
 * أقل خامة في الوصفة هي اللي بتحدد العدد.
 */
function servingsFor(recipe, ingredientsById) {
  if (!recipe?.length) return { maxServings: null, missing: [] };

  const missing = [];
  const per = recipe.map((line) => {
    const ing = ingredientsById[String(line.ingredientId)];
    if (!ing || line.qty <= 0) return Infinity;
    const n = ing.currentQty / line.qty;
    if (n < 1) missing.push({ nameAr: ing.nameAr, nameEn: ing.nameEn });
    return n;
  });

  const max = Math.floor(Math.min(...per));
  return { maxServings: Number.isFinite(max) ? Math.max(0, max) : null, missing };
}

/**
 * بيحسب المتاح للصنف ولكل نوع من أنواعه.
 * الصنف اللي ليه أنواع: المتاح بتاعه = أكبر متاح بين أنواعه، لأنه لسه ينفع
 * يتطلب طالما نوع واحد على الأقل متاح (مثلاً سادة شغّال والسكر خلص).
 */
export function withMaxServings(menuItems, ingredientsById) {
  return menuItems.map((mi) => {
    if (!mi.trackStock) return { ...mi, maxServings: null, missing: [], variants: mi.variants || [] };

    const variants = (mi.variants || []).map((v) => ({
      ...v,
      ...servingsFor(v.recipe, ingredientsById),
    }));

    if (variants.length) {
      const usable = variants.filter((v) => v.available !== false);
      const nums = usable.map((v) => v.maxServings).filter((n) => n !== null);
      return {
        ...mi,
        variants,
        maxServings: nums.length ? Math.max(...nums) : null,
        // أسباب القفل بتتجمع من الأنواع اللي مش متاحة
        missing: usable.every((v) => v.maxServings === 0)
          ? usable.flatMap((v) => v.missing).filter((m, i, a) => a.findIndex((x) => x.nameAr === m.nameAr) === i)
          : [],
      };
    }

    return { ...mi, variants: [], ...servingsFor(mi.recipe, ingredientsById) };
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

    // 🔒 الريسبشن مايشوفش الوصفة ولا التكلفة — بس يعرف المتاح وسبب القفل
    const isManager = req.user.role === 'manager';
    res.json(
      withStock.map((mi) =>
        isManager
          ? mi
          : {
              ...mi,
              recipe: undefined,
              variants: (mi.variants || []).map((v) => ({ ...v, recipe: undefined })),
            }
      )
    );
  })
);

/** بيلزق أسماء الخامات والتكلفة على سطور وصفة */
function describeRecipe(recipe, byId) {
  const lines = (recipe || []).map((l) => {
    const ing = byId[String(l.ingredientId)];
    return {
      ingredientId: String(l.ingredientId),
      qty: l.qty,
      nameAr: ing?.nameAr || '',
      nameEn: ing?.nameEn || '',
      unit: ing?.unit || 'g',
      costPerUnit: ing?.costPerUnit || 0,
      lineCost: Math.round((ing?.costPerUnit || 0) * l.qty * 1000) / 1000,
      currentQty: ing?.currentQty || 0,
    };
  });
  const cost = lines.reduce((s, l) => s + l.lineCost, 0);
  return { lines, cost: Math.round(cost * 100) / 100 };
}

/** GET /api/menu/:id/recipe (مدير) — الوصفة الأساسية وكل نوع بتكلفته وهامشه */
router.get(
  '/:id/recipe',
  managerOnly,
  wrap(async (req, res) => {
    const mi = await MenuItem.findById(req.params.id).lean();
    if (!mi) return fail(res, 'NOT_FOUND', 404);

    const ings = await Ingredient.find().lean();
    const byId = Object.fromEntries(ings.map((i) => [String(i._id), i]));

    const base = describeRecipe(mi.recipe, byId);
    const baseServings = servingsFor(mi.recipe, byId);

    const variants = (mi.variants || []).map((v) => {
      const d = describeRecipe(v.recipe, byId);
      const price = mi.price + (v.priceDelta || 0);
      const profit = price - d.cost;
      return {
        _id: String(v._id),
        nameAr: v.nameAr,
        nameEn: v.nameEn,
        priceDelta: v.priceDelta || 0,
        available: v.available !== false,
        price,
        ...d,
        profit: Math.round(profit * 100) / 100,
        marginPct: price > 0 ? Math.round((profit / price) * 1000) / 10 : 0,
        ...servingsFor(v.recipe, byId),
      };
    });

    const profit = mi.price - base.cost;

    res.json({
      menuItemId: String(mi._id),
      nameAr: mi.nameAr,
      nameEn: mi.nameEn,
      price: mi.price,
      trackStock: mi.trackStock,
      lines: base.lines,
      cost: base.cost,
      profit: Math.round(profit * 100) / 100,
      marginPct: mi.price > 0 ? Math.round((profit / mi.price) * 1000) / 10 : 0,
      maxServings: baseServings.maxServings,
      variants,
    });
  })
);

/** بيتحقق من سطور وصفة جاية من العميل ويرجّعها نضيفة، أو بيرمي كود خطأ */
function cleanRecipe(recipe) {
  const clean = [];
  for (const l of Array.isArray(recipe) ? recipe : []) {
    const id = oid(l?.ingredientId);
    const q = Number(l?.qty);
    if (!id || !Number.isFinite(q) || q < 0) return null;
    clean.push({ ingredientId: id, qty: q });
  }
  return clean;
}

/**
 * PUT /api/menu/:id/recipe (مدير)
 * { recipe: [...], variants: [{ _id?, nameAr, nameEn, priceDelta, recipe, available }] }
 * بتحفظ الوصفة الأساسية والأنواع مع بعض.
 */
router.put(
  '/:id/recipe',
  managerOnly,
  wrap(async (req, res) => {
    const before = await MenuItem.findById(req.params.id).lean();
    if (!before) return fail(res, 'NOT_FOUND', 404);

    const recipe = cleanRecipe(req.body?.recipe);
    if (recipe === null) return fail(res, 'INVALID_RECIPE_LINE', 400);

    const variants = [];
    for (const v of Array.isArray(req.body?.variants) ? req.body.variants : []) {
      if (!v?.nameAr || !v?.nameEn) return fail(res, 'MISSING_NAME', 400);

      const vr = cleanRecipe(v.recipe);
      if (vr === null) return fail(res, 'INVALID_RECIPE_LINE', 400);

      const delta = Number(v.priceDelta || 0);
      if (!Number.isFinite(delta)) return fail(res, 'INVALID_PRICE', 400);

      variants.push({
        // بنحافظ على الـ id لو النوع موجود — عشان الفواتير القديمة تفضل مربوطة بيه
        ...(oid(v._id) ? { _id: oid(v._id) } : {}),
        nameAr: String(v.nameAr).trim(),
        nameEn: String(v.nameEn).trim(),
        priceDelta: delta,
        recipe: vr,
        available: v.available !== false,
      });
    }

    const mi = await MenuItem.findByIdAndUpdate(
      req.params.id,
      { recipe, variants },
      { new: true, runValidators: true }
    );

    await audit({
      userId: req.user.id,
      action: 'menu.recipe.update',
      entity: 'MenuItem',
      entityId: mi._id,
      before: { recipe: before.recipe, variants: before.variants },
      after: { recipe: mi.recipe, variants: mi.variants },
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

    const clean = cleanRecipe(recipe);
    if (clean === null) return fail(res, 'INVALID_RECIPE_LINE', 400);

    const mi = await MenuItem.create({
      nameAr: String(nameAr).trim(),
      nameEn: String(nameEn).trim(),
      price: Number(price),
      categoryId: oid(categoryId),
      available: available !== false,
      trackStock: trackStock !== false,
      recipe: clean,
      variants: [],
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
