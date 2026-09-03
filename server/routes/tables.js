import { Router } from 'express';
import Table from '../models/Table.js';
import Order from '../models/Order.js';
import { managerOnly } from '../middleware/auth.js';
import { wrap, fail } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { oid } from '../filters.js';

const router = Router();

/**
 * GET /api/tables
 * بيرجّع الطاولات ومعاها الفاتورة المفتوحة (الإجمالي ومدة الجلسة) عشان الشاشة
 * تعرض كل حاجة من غير نداءات إضافية.
 * الطاولة المدموجة بتاخد نفس فاتورة الطاولة الأساسية.
 */
router.get(
  '/',
  wrap(async (req, res) => {
    const f = {};
    if (req.query.active !== 'all') f.active = true;

    const tables = await Table.find(f).sort({ number: 1 }).lean();

    const open = await Order.find({ status: 'open' })
      .select('tableId mergedTableIds total openedAt items userId')
      .lean();

    // الفاتورة الواحدة ممكن تغطّي أكتر من طاولة
    const byTable = {};
    for (const o of open) {
      const ids = [o.tableId, ...(o.mergedTableIds || [])].map(String);
      const info = {
        _id: String(o._id),
        total: o.total,
        openedAt: o.openedAt,
        itemsCount: o.items.reduce((s, i) => s + i.qty, 0),
        tableCount: ids.length,
        primaryTableId: String(o.tableId),
      };
      for (const id of ids) byTable[id] = info;
    }

    res.json(
      tables.map((t) => {
        const o = byTable[String(t._id)];
        return {
          ...t,
          openOrder: o || null,
          // الطاولة دي مدموجة في فاتورة طاولة تانية؟
          isMerged: !!o && o.primaryTableId !== String(t._id),
        };
      })
    );
  })
);

/** POST /api/tables (مدير) { number?, seats? } — لو مبعتش رقم بياخد اللي بعد الأخير */
router.post(
  '/',
  managerOnly,
  wrap(async (req, res) => {
    let number = Number(req.body?.number);
    if (!Number.isFinite(number)) {
      const last = await Table.findOne().sort({ number: -1 }).lean();
      number = (last?.number || 0) + 1;
    }
    if (!Number.isInteger(number) || number < 1) return fail(res, 'INVALID_TABLE_NUMBER', 400);

    const exists = await Table.findOne({ number });
    if (exists) return fail(res, 'TABLE_NUMBER_TAKEN', 409);

    const table = await Table.create({
      number,
      name: String(req.body?.name || '').trim(),
      seats: Number(req.body?.seats) || 4,
      note: String(req.body?.note || '').trim(),
    });

    await audit({ userId: req.user.id, action: 'table.create', entity: 'Table', entityId: table._id, after: table });
    res.status(201).json(table);
  })
);

/**
 * POST /api/tables/set-count (مدير) { count }
 * بيظبط عدد الطاولات على رقم معيّن: بيزوّد الناقص، وبيعطّل الزيادة.
 * الطاولة اللي عليها فاتورة مفتوحة مابتتعطّلش.
 */
router.post(
  '/set-count',
  managerOnly,
  wrap(async (req, res) => {
    const count = Number(req.body?.count);
    if (!Number.isInteger(count) || count < 0 || count > 500) return fail(res, 'INVALID_COUNT', 400);

    const active = await Table.find({ active: true }).sort({ number: 1 }).lean();
    const before = active.length;
    let added = 0;
    let disabled = 0;
    const busy = [];

    if (count > before) {
      const last = await Table.findOne().sort({ number: -1 }).lean();
      let next = (last?.number || 0) + 1;
      for (let i = before; i < count; i += 1) {
        // بنتخطى الأرقام اللي متاخدة بطاولات معطّلة
        // eslint-disable-next-line no-await-in-loop
        while (await Table.findOne({ number: next })) next += 1;
        // eslint-disable-next-line no-await-in-loop
        await Table.create({ number: next, seats: 4 });
        next += 1;
        added += 1;
      }
    } else if (count < before) {
      const openOrders = await Order.find({ status: 'open' }).select('tableId mergedTableIds').lean();
      const busyIds = new Set(openOrders.flatMap((o) => [o.tableId, ...(o.mergedTableIds || [])].map(String)));

      // بنعطّل من الآخر للأول
      for (const t of active.slice().reverse()) {
        if (disabled >= before - count) break;
        if (busyIds.has(String(t._id))) {
          busy.push(t.number);
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        await Table.findByIdAndUpdate(t._id, { active: false });
        disabled += 1;
      }
    }

    const total = await Table.countDocuments({ active: true });
    await audit({
      userId: req.user.id,
      action: 'table.setCount',
      entity: 'Table',
      before: { count: before },
      after: { count: total, added, disabled, skippedBusy: busy },
    });

    res.json({ count: total, added, disabled, skippedBusy: busy });
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
    if (req.body?.number !== undefined) {
      const n = Number(req.body.number);
      if (!Number.isInteger(n) || n < 1) return fail(res, 'INVALID_TABLE_NUMBER', 400);
      const clash = await Table.findOne({ number: n, _id: { $ne: before._id } });
      if (clash) return fail(res, 'TABLE_NUMBER_TAKEN', 409);
      patch.number = n;
    }
    if (req.body?.seats !== undefined) {
      const s = Number(req.body.seats);
      if (!Number.isInteger(s) || s < 1) return fail(res, 'INVALID_NUMBER', 400);
      patch.seats = s;
    }
    for (const k of ['name', 'note']) {
      if (req.body?.[k] !== undefined) patch[k] = String(req.body[k]).trim();
    }
    if (req.body?.active !== undefined) {
      if (req.body.active === false) {
        // مانعطّلش طاولة عليها فاتورة مفتوحة
        const openOnIt = await Order.findOne({
          status: 'open',
          $or: [{ tableId: before._id }, { mergedTableIds: before._id }],
        });
        if (openOnIt) return fail(res, 'TABLE_HAS_OPEN_ORDER', 409);
      }
      patch.active = !!req.body.active;
    }

    const table = await Table.findByIdAndUpdate(req.params.id, patch, { new: true });
    await audit({ userId: req.user.id, action: 'table.update', entity: 'Table', entityId: table._id, before, after: table });
    res.json(table);
  })
);

/** DELETE /api/tables/:id (مدير) — بنعطّلها بس، عشان الفواتير القديمة تفضل مربوطة بيها */
router.delete(
  '/:id',
  managerOnly,
  wrap(async (req, res) => {
    const before = await Table.findById(req.params.id).lean();
    if (!before) return fail(res, 'NOT_FOUND', 404);

    const openOnIt = await Order.findOne({
      status: 'open',
      $or: [{ tableId: before._id }, { mergedTableIds: before._id }],
    });
    if (openOnIt) return fail(res, 'TABLE_HAS_OPEN_ORDER', 409);

    const table = await Table.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
    await audit({ userId: req.user.id, action: 'table.disable', entity: 'Table', entityId: table._id, before, after: table });
    res.json({ ok: true, table });
  })
);

export default router;
