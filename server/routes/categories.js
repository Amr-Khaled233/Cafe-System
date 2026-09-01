import { Router } from 'express';
import Category from '../models/Category.js';
import { managerOnly } from '../middleware/auth.js';
import { wrap, fail } from '../utils/errors.js';
import { audit } from '../utils/audit.js';

const router = Router();

/** GET /api/categories — متاح للدورين (شاشة الطلب محتاجاه) */
router.get(
  '/',
  wrap(async (req, res) => res.json(await Category.find().sort({ sortOrder: 1, nameAr: 1 }).lean()))
);

/** POST /api/categories (مدير) */
router.post(
  '/',
  managerOnly,
  wrap(async (req, res) => {
    const { nameAr, nameEn, sortOrder } = req.body || {};
    if (!nameAr || !nameEn) return fail(res, 'MISSING_NAME', 400);
    const cat = await Category.create({ nameAr, nameEn, sortOrder: Number(sortOrder) || 0 });
    await audit({ userId: req.user.id, action: 'category.create', entity: 'Category', entityId: cat._id, after: cat });
    res.status(201).json(cat);
  })
);

/** PATCH /api/categories/:id (مدير) */
router.patch(
  '/:id',
  managerOnly,
  wrap(async (req, res) => {
    const before = await Category.findById(req.params.id).lean();
    if (!before) return fail(res, 'NOT_FOUND', 404);
    // بنسمح بالحقول دي بس — مانمررش req.body كله عشان مايتحقنش فيه حقول تانية
    const patch = {};
    for (const k of ['nameAr', 'nameEn']) {
      if (req.body?.[k] !== undefined) patch[k] = String(req.body[k]).trim();
    }
    if (req.body?.sortOrder !== undefined) {
      const n = Number(req.body.sortOrder);
      if (!Number.isFinite(n)) return fail(res, 'INVALID_NUMBER', 400);
      patch.sortOrder = n;
    }

    const cat = await Category.findByIdAndUpdate(req.params.id, patch, { new: true });
    await audit({ userId: req.user.id, action: 'category.update', entity: 'Category', entityId: cat._id, before, after: cat });
    res.json(cat);
  })
);

export default router;
