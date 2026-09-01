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
        .populate('tableId', 'number name area')
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
    const order = await Order.findById(req.params.id).populate('tableId', 'number name area').lean();
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

    const { order: saved, shortages, duplicate } = await addItemWithStock({
      order,
      menuItem,
      qty,
      note: req.body?.note || '',
      clientRequestId: req.body?.clientRequestId,
      userId: req.user.id,
    });

    res.status(duplicate ? 200 : 201).json({ order: saved, shortages, duplicate });
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
    res.json({ order: saved, shortages });
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
    res.json({ order: saved });
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
    res.json(order);
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

    await Table.findByIdAndUpdate(order.tableId, { status: 'free' });
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
