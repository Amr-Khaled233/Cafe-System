import { Router } from 'express';
import Table from '../models/Table.js';
import Order from '../models/Order.js';
import { managerOnly } from '../middleware/auth.js';
import { wrap, fail } from '../utils/errors.js';
import { audit } from '../utils/audit.js';

const router = Router();

/**
 * GET /api/tables?area=&status=
 * بيرجّع الطاولات ومعاها الفاتورة المفتوحة (الإجمالي الحالي ومدة الجلسة)
 * عشان الكارت يعرض كل حاجة من غير نداءات إضافية.
 */
router.get(
  '/',
  wrap(async (req, res) => {
    const f = {};
    if (req.query.area) f.area = req.query.area;
    if (req.query.status) f.status = req.query.status;

    const tables = await Table.find(f).sort({ number: 1 }).lean();

    const open = await Order.find({ status: 'open' })
      .select('tableId total subtotal openedAt items userId')
      .lean();
    const byTable = Object.fromEntries(open.map((o) => [String(o.tableId), o]));

    res.json(
      tables.map((t) => {
        const o = byTable[String(t._id)];
        return {
          ...t,
          openOrder: o
            ? {
                _id: String(o._id),
                total: o.total,
                openedAt: o.openedAt,
                itemsCount: o.items.reduce((s, i) => s + i.qty, 0),
              }
            : null,
        };
      })
    );
  })
);

/** GET /api/tables/areas — قائمة المناطق للفلتر */
router.get(
  '/areas',
  wrap(async (req, res) => res.json(await Table.distinct('area')))
);

/** POST /api/tables (مدير) */
router.post(
  '/',
  managerOnly,
  wrap(async (req, res) => {
    const { number, name, area, seats, note } = req.body || {};
    if (!Number.isFinite(Number(number))) return fail(res, 'INVALID_TABLE_NUMBER', 400);

    const table = await Table.create({
      number: Number(number),
      name: name || '',
      area: area || 'indoor',
      seats: Number(seats) || 4,
      note: note || '',
    });
    await audit({ userId: req.user.id, action: 'table.create', entity: 'Table', entityId: table._id, after: table });
    res.status(201).json(table);
  })
);

/** PATCH /api/tables/:id (مدير) — الحالة مابتتعدّلش من هنا، بتتظبط مع الفواتير */
router.patch(
  '/:id',
  managerOnly,
  wrap(async (req, res) => {
    const before = await Table.findById(req.params.id).lean();
    if (!before) return fail(res, 'NOT_FOUND', 404);

    const patch = {};
    for (const k of ['number', 'name', 'area', 'seats', 'note']) {
      if (req.body?.[k] !== undefined) patch[k] = req.body[k];
    }
    const table = await Table.findByIdAndUpdate(req.params.id, patch, { new: true });
    await audit({ userId: req.user.id, action: 'table.update', entity: 'Table', entityId: table._id, before, after: table });
    res.json(table);
  })
);

export default router;
