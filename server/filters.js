import mongoose from 'mongoose';
import MenuItem from './models/MenuItem.js';
import { resolveRange } from './utils/dates.js';

export const oid = (v) => (mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : null);

/** regex آمن للبحث النصّي — بيهرب رموز الـ regex الجاية من المستخدم */
export const rx = (q) => new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

/**
 * بنّاء فلتر الفواتير. بيتستخدم في الطلبات والإحصائيات والتقارير — مصدر واحد
 * عشان قواعد الصلاحيات ماتتكررش في كل راوت.
 *
 * opts.dateField: على أي تاريخ نفلتر (closedAt للتقارير، openedAt للفواتير المفتوحة)
 * opts.includeVoid: لو true بنسيب الملغي جوّه النتيجة (كارت الملغي في الإحصائيات)
 */
export async function buildOrderFilter(query = {}, user = {}, opts = {}) {
  const f = {};

  // حالة الفاتورة
  if (query.status && ['open', 'paid', 'void', 'merged'].includes(query.status)) {
    f.status = query.status;
  } else if (!opts.includeVoid) {
    // 🔒 الملغي والمدموج بره كل التقارير والمبيعات.
    // المدموج أصنافه اتنقلت لفاتورة تانية، فلو عدّيناه هنعدّ نفس البيع مرتين.
    f.status = { $nin: ['void', 'merged'] };
  }

  // الفترة — الفاتورة المفتوحة لسه مالهاش closedAt فبنفلتر على openedAt
  const { from, to } = resolveRange(query);
  const dateField = opts.dateField || (query.status === 'open' ? 'openedAt' : 'closedAt');
  if (from || to) {
    f[dateField] = {};
    if (from) f[dateField].$gte = from;
    if (to) f[dateField].$lte = to;
  }

  if (oid(query.shiftId)) f.shiftId = oid(query.shiftId);
  if (oid(query.userId)) f.userId = oid(query.userId);
  if (oid(query.tableId)) f.tableId = oid(query.tableId);
  if (query.paymentMethod && ['cash', 'card', 'wallet'].includes(query.paymentMethod)) {
    f.paymentMethod = query.paymentMethod;
  }
  if (oid(query.menuItemId)) f['items.menuItemId'] = oid(query.menuItemId);

  // التصنيف: بنحوّله لقائمة أصناف الأول لأن الفاتورة بتخزّن الصنف مش تصنيفه
  if (oid(query.categoryId)) {
    const ids = await MenuItem.find({ categoryId: oid(query.categoryId) }).distinct('_id');
    f['items.menuItemId'] = { $in: ids };
  }

  // بحث نصّي: رقم فاتورة أو اسم صنف
  if (query.q) {
    const r = rx(query.q);
    const or = [{ 'items.nameAr': r }, { 'items.nameEn': r }];
    if (oid(query.q)) or.push({ _id: oid(query.q) });
    f.$or = or;
  }

  // 🔒 الريسبشن: شيفته الحالي هو بس، مهما بعت في الـ query string
  if (user.role === 'reception') {
    f.userId = oid(user.id);
    f.shiftId = user.currentShiftId ? oid(user.currentShiftId) : null;
    // الفترة كمان بتتلغي — الشيفت هو حدوده، مايشوفش يوم تاني
    delete f.closedAt;
    delete f.openedAt;
  }

  return f;
}

/** فلتر حركات المخزون — للمدير بس، فمفيش قفل دور هنا */
export function buildMovementFilter(query = {}) {
  const f = {};
  const { from, to } = resolveRange(query);
  if (from || to) {
    f.at = {};
    if (from) f.at.$gte = from;
    if (to) f.at.$lte = to;
  }
  if (oid(query.ingredientId)) f.ingredientId = oid(query.ingredientId);
  if (query.type && ['purchase', 'sale', 'waste', 'adjustment', 'stocktake', 'return'].includes(query.type)) {
    f.type = query.type;
  }
  if (oid(query.userId)) f.userId = oid(query.userId);
  return f;
}
