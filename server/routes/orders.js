import { Router } from 'express';
import Order from '../models/Order.js';
import Table from '../models/Table.js';
import MenuItem from '../models/MenuItem.js';
import { managerOnly, requireOpenShift } from '../middleware/auth.js';
import { wrap, fail } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { buildOrderFilter, oid } from '../filters.js';
import {
  addItemWithStock,
  changeItemQtyWithStock,
  removeItemWithStock,
  voidOrderWithStock,
} from '../inventory.js';

const router = Router();

/**
 * بترجّع الفاتورة بشكل واحد ثابت مهما كانت العملية.
 * مهم: لو رجّعنا الفاتورة الخام بعد الإضافة، الـ tableId بيرجع ObjectId مش
 * كائن، والواجهة بتفقد أرقام الطاولات — وده كان بيخلي نافذة الدمج تعرض
 * طاولة الفاتورة نفسها كأنها متاحة للدمج.
 */
async function populated(orderId) {
  return Order.findById(orderId)
    .populate('tableId', 'number name seats')
    .populate('mergedTableIds', 'number name seats')
    .lean();
}

/** الريسبشن يقدر يشوف أي فاتورة مفتوحة (بيخدم كل الطاولات)، بس المقفولة بتاعت شيفته بس */
function canSee(order, user) {
  if (user.role === 'manager') return true;
  if (order.status === 'open') return true;
  return String(order.shiftId) === String(user.currentShiftId);
}

/** POST /api/orders { tableId } — فتح فاتورة على طاولة */
router.post(
  '/',
  requireOpenShift,
  wrap(async (req, res) => {
    if (!oid(req.body?.tableId)) return fail(res, 'INVALID_TABLE', 400);

    const table = await Table.findById(req.body.tableId);
    if (!table) return fail(res, 'TABLE_NOT_FOUND', 404);

    // الطاولة ليها فاتورة مفتوحة؟ بنرجّعها بدل ما نفتح واحدة تانية
    const existing = await Order.findOne({ tableId: table._id, status: 'open' });
    if (existing) return res.json(existing);

    const order = await Order.create({
      tableId: table._id,
      shiftId: req.user.currentShiftId,
      userId: req.user.id,
      status: 'open',
      openedAt: new Date(),
    });

    table.status = 'busy';
    await table.save();

    res.status(201).json(order);
  })
);

/** GET /api/orders?<كل الفلاتر> */
router.get(
  '/',
  wrap(async (req, res) => {
    const f = await buildOrderFilter(req.query, req.user, { includeVoid: req.query.status === 'void' });
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const page = Math.max(Number(req.query.page) || 1, 1);

    const [rows, total] = await Promise.all([
      Order.find(f)
        .sort({ openedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('tableId', 'number name')
        .populate('userId', 'name')
        .lean(),
      Order.countDocuments(f),
    ]);

    res.json({ rows, total, page, limit, pages: Math.ceil(total / limit) });
  })
);

/** GET /api/orders/:id */
router.get(
  '/:id',
  wrap(async (req, res) => {
    const order = await populated(req.params.id);
    if (!order) return fail(res, 'NOT_FOUND', 404);
    if (!canSee(order, req.user)) return fail(res, 'FORBIDDEN', 403);
    res.json(order);
  })
);

/**
 * POST /api/orders/:id/items { menuItemId, qty, note, clientRequestId }
 * الخصم من المخزون بيحصل هنا — لأن المشروب اتعمل دلوقتي، مش لما يتدفع.
 */
router.post(
  '/:id/items',
  requireOpenShift,
  wrap(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) return fail(res, 'NOT_FOUND', 404);
    if (order.status !== 'open') return fail(res, 'ORDER_NOT_OPEN', 409);

    const qty = Number(req.body?.qty ?? 1);
    if (!Number.isInteger(qty) || qty < 1) return fail(res, 'INVALID_QTY', 400);
    if (!oid(req.body?.menuItemId)) return fail(res, 'INVALID_MENU_ITEM', 400);

    const menuItem = await MenuItem.findById(req.body.menuItemId).lean();
    if (!menuItem) return fail(res, 'MENU_ITEM_NOT_FOUND', 404);
    if (!menuItem.available) return fail(res, 'ITEM_UNAVAILABLE', 409);

    // الصنف اللي ليه أنواع (سادة/مظبوط/زيادة) لازم يتحدد نوعه — الوصفة بتختلف
    let variant = null;
    if (menuItem.variants?.length) {
      if (!oid(req.body?.variantId)) return fail(res, 'VARIANT_REQUIRED', 400);
      variant = menuItem.variants.find((v) => String(v._id) === String(req.body.variantId));
      if (!variant) return fail(res, 'VARIANT_NOT_FOUND', 404);
      if (variant.available === false) return fail(res, 'VARIANT_UNAVAILABLE', 409);
    } else if (req.body?.variantId) {
      return fail(res, 'VARIANT_NOT_FOUND', 404);
    }

    const { order: saved, shortages, duplicate } = await addItemWithStock({
      order,
      menuItem,
      variant,
      qty,
      note: req.body?.note || '',
      clientRequestId: req.body?.clientRequestId,
      userId: req.user.id,
    });

    res.status(duplicate ? 200 : 201).json({ order: await populated(saved._id), shortages, duplicate });
  })
);

/** PATCH /api/orders/:id/items/:itemId { qty } — بيخصم أو يرد الفرق بس */
router.patch(
  '/:id/items/:itemId',
  requireOpenShift,
  wrap(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) return fail(res, 'NOT_FOUND', 404);
    if (order.status !== 'open') return fail(res, 'ORDER_NOT_OPEN', 409);

    const qty = Number(req.body?.qty);
    if (!Number.isInteger(qty) || qty < 0) return fail(res, 'INVALID_QTY', 400);

    const { order: saved, shortages } = await changeItemQtyWithStock({
      order,
      itemId: req.params.itemId,
      newQty: qty,
      userId: req.user.id,
    });
    res.json({ order: await populated(saved._id), shortages });
  })
);

/** DELETE /api/orders/:id/items/:itemId — بيرد نفس الكميات للمخزون */
router.delete(
  '/:id/items/:itemId',
  requireOpenShift,
  wrap(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) return fail(res, 'NOT_FOUND', 404);
    if (order.status !== 'open') return fail(res, 'ORDER_NOT_OPEN', 409);

    const { order: saved } = await removeItemWithStock({
      order,
      itemId: req.params.itemId,
      userId: req.user.id,
    });
    res.json({ order: await populated(saved._id) });
  })
);

/**
 * POST /api/orders/:id/merge { tableIds: [...] }
 * بيضم طاولات تانية على نفس الفاتورة — الحساب بيبقى عليهم كلهم سوا.
 * لو الطاولة عليها فاتورة مفتوحة، أصنافها بتتنقل هنا وفاتورتها بتتقفل كـ merged.
 * المخزون مابيتأثرش: الأصناف اتخصمت وقت إضافتها وهي بتتنقل زي ما هي.
 */
router.post(
  '/:id/merge',
  requireOpenShift,
  wrap(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) return fail(res, 'NOT_FOUND', 404);
    if (order.status !== 'open') return fail(res, 'ORDER_NOT_OPEN', 409);

    const ids = Array.isArray(req.body?.tableIds) ? req.body.tableIds : [];
    if (!ids.length) return fail(res, 'NO_TABLES_SELECTED', 400);

    const current = new Set([String(order.tableId), ...order.mergedTableIds.map(String)]);
    const absorbed = [];

    for (const raw of ids) {
      const tid = oid(raw);
      if (!tid) return fail(res, 'INVALID_TABLE', 400);
      if (current.has(String(tid))) continue;

      const table = await Table.findById(tid);
      if (!table || !table.active) return fail(res, 'TABLE_NOT_FOUND', 404);

      // الطاولة عليها فاتورة مفتوحة؟ ننقل أصنافها هنا
      const other = await Order.findOne({
        status: 'open',
        _id: { $ne: order._id },
        $or: [{ tableId: tid }, { mergedTableIds: tid }],
      });

      if (other) {
        for (const item of other.items) order.items.push(item.toObject());
        // كل طاولات الفاتورة التانية بتيجي معاها
        for (const extra of [other.tableId, ...other.mergedTableIds]) {
          if (!current.has(String(extra))) {
            order.mergedTableIds.push(extra);
            current.add(String(extra));
          }
        }
        other.items = [];
        other.status = 'merged';
        other.mergedIntoId = order._id;
        other.closedAt = new Date();
        other.recalc();
        await other.save();
        absorbed.push(String(other._id));
      } else {
        order.mergedTableIds.push(tid);
        current.add(String(tid));
      }

      table.status = 'busy';
      await table.save();
    }

    order.recalc();
    await order.save();

    await audit({
      userId: req.user.id,
      action: 'order.merge',
      entity: 'Order',
      entityId: order._id,
      after: { tables: [...current], absorbedOrders: absorbed },
    });

    res.json(await populated(order._id));
  })
);

/** POST /api/orders/:id/unmerge { tableId } — بيشيل طاولة من الفاتورة وتفضى */
router.post(
  '/:id/unmerge',
  requireOpenShift,
  wrap(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) return fail(res, 'NOT_FOUND', 404);
    if (order.status !== 'open') return fail(res, 'ORDER_NOT_OPEN', 409);

    const tid = oid(req.body?.tableId);
    if (!tid) return fail(res, 'INVALID_TABLE', 400);
    // الطاولة الأساسية ماتتشالش — هي أساس الفاتورة
    if (String(order.tableId) === String(tid)) return fail(res, 'CANNOT_REMOVE_PRIMARY_TABLE', 400);
    if (!order.mergedTableIds.some((x) => String(x) === String(tid))) return fail(res, 'TABLE_NOT_IN_ORDER', 404);

    order.mergedTableIds = order.mergedTableIds.filter((x) => String(x) !== String(tid));
    await order.save();
    await Table.findByIdAndUpdate(tid, { status: 'free' });

    res.json(await populated(order._id));
  })
);

/** POST /api/orders/:id/discount (مدير) { type, value, reason } */
router.post(
  '/:id/discount',
  managerOnly,
  wrap(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) return fail(res, 'NOT_FOUND', 404);
    if (order.status !== 'open') return fail(res, 'ORDER_NOT_OPEN', 409);

    const type = req.body?.type;
    const value = Number(req.body?.value);
    if (!['percent', 'amount'].includes(type)) return fail(res, 'INVALID_DISCOUNT_TYPE', 400);
    if (!Number.isFinite(value) || value < 0) return fail(res, 'INVALID_DISCOUNT_VALUE', 400);
    if (type === 'percent' && value > 100) return fail(res, 'INVALID_DISCOUNT_VALUE', 400);

    const before = { discount: order.discount, total: order.total };
    order.discount = { type, value, byUserId: req.user.id, reason: req.body?.reason || '' };
    order.recalc();
    await order.save();

    await audit({
      userId: req.user.id,
      action: 'order.discount',
      entity: 'Order',
      entityId: order._id,
      before,
      after: { discount: order.discount, total: order.total },
    });
    res.json(await populated(order._id));
  })
);

/** POST /api/orders/:id/pay { paymentMethod } — قفل الفاتورة وتفضية الطاولة */
router.post(
  '/:id/pay',
  requireOpenShift,
  wrap(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) return fail(res, 'NOT_FOUND', 404);
    if (order.status !== 'open') return fail(res, 'ORDER_NOT_OPEN', 409);
    if (!order.items.length) return fail(res, 'EMPTY_ORDER', 400);

    const pm = req.body?.paymentMethod;
    if (!['cash', 'card', 'wallet'].includes(pm)) return fail(res, 'INVALID_PAYMENT_METHOD', 400);

    order.recalc();
    order.status = 'paid';
    order.paymentMethod = pm;
    order.closedAt = new Date();
    order.items.forEach((i) => (i.paidQty = i.qty));
    // الفاتورة بتتنسب للشيفت اللي قفلها فعلاً
    order.shiftId = req.user.currentShiftId;
    await order.save();

    // كل الطاولات اللي على الفاتورة بتفضى مع بعض
    await Table.updateMany(
      { _id: { $in: [order.tableId, ...order.mergedTableIds] } },
      { status: 'free' }
    );
    res.json(order);
  })
);

/** POST /api/orders/:id/void (مدير) { reason } — بيرد كل الخامات والفاتورة بتفضل موجودة */
router.post(
  '/:id/void',
  managerOnly,
  wrap(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) return fail(res, 'NOT_FOUND', 404);
    if (order.status === 'void') return fail(res, 'ALREADY_VOID', 409);

    const reason = String(req.body?.reason || '').trim();
    if (!reason) return fail(res, 'REASON_REQUIRED', 400);

    const before = { status: order.status, total: order.total };
    const { order: saved } = await voidOrderWithStock({ order, reason, userId: req.user.id });

    await audit({
      userId: req.user.id,
      action: 'order.void',
      entity: 'Order',
      entityId: saved._id,
      before,
      after: { status: saved.status, reason },
    });
    res.json(saved);
  })
);

export default router;
