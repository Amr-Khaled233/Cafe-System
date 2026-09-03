import mongoose from 'mongoose';
import Ingredient from './models/Ingredient.js';
import StockMovement from './models/StockMovement.js';
import Table from './models/Table.js';
import { supportsTransactions } from './db.js';
import { AppError } from './utils/errors.js';

/** الإعداد اللي بيقرر: نرفض الطلب لما الخامة تخلص، ولا نسمح ونسجّل العجز */
export const blockWhenOutOfStock = () =>
  String(process.env.BLOCK_WHEN_OUT_OF_STOCK || 'false').toLowerCase() === 'true';

/**
 * بينفّذ مجموعة عمليات كوحدة واحدة.
 * لو الاتصال replica set بنستخدم transaction حقيقية (كل حاجة أو ولا حاجة).
 * لو mongod عادي على الجهاز، بننفّذ من غير session عشان التطوير المحلي يفضل شغّال.
 */
export async function withTx(fn) {
  if (!supportsTransactions()) return fn(null);

  const session = await mongoose.startSession();
  try {
    let out;
    await session.withTransaction(async () => {
      out = await fn(session);
    });
    return out;
  } finally {
    await session.endSession();
  }
}

/**
 * بيطبّق حركة على خامة ويسجّلها.
 * delta موجب = دخول، سالب = خروج.
 * الرصيد بيتحدّث والحركة بتتسجّل مع balanceAfter — مفيش تعديل مباشر على currentQty في أي مكان تاني.
 */
export async function applyMovement(
  { ingredientId, delta, type, refType = 'manual', refId = null, userId = null, note = '', unitCost },
  session
) {
  const opts = session ? { new: true, session } : { new: true };
  const ing = await Ingredient.findByIdAndUpdate(ingredientId, { $inc: { currentQty: delta } }, opts);
  if (!ing) throw new AppError('INGREDIENT_NOT_FOUND', 404);

  const doc = [
    {
      ingredientId: ing._id,
      type,
      qty: delta,
      balanceAfter: ing.currentQty,
      unitCost: unitCost ?? ing.costPerUnit, // 📌 بنجمّد التكلفة وقت الحركة
      refType,
      refId,
      userId,
      note,
      at: new Date(),
    },
  ];
  await StockMovement.create(doc, session ? { session } : undefined);

  return ing;
}

/**
 * بيتأكد إن كل خامات الوصفة تكفي الكمية المطلوبة.
 * بيرجّع قائمة الناقص — فاضية يعني كله تمام.
 */
export async function checkAvailability(menuItem, qty, session, recipe) {
  const lines = recipe || menuItem.recipe || [];
  if (!menuItem.trackStock || !lines.length) return [];

  const ids = lines.map((l) => l.ingredientId);
  const q = Ingredient.find({ _id: { $in: ids } });
  const ings = await (session ? q.session(session) : q).lean();
  const byId = Object.fromEntries(ings.map((i) => [String(i._id), i]));

  const missing = [];
  for (const line of lines) {
    const ing = byId[String(line.ingredientId)];
    const needed = line.qty * qty;
    if (!ing) continue;
    if (ing.currentQty < needed) {
      missing.push({
        ingredientId: String(ing._id),
        nameAr: ing.nameAr,
        nameEn: ing.nameEn,
        unit: ing.unit,
        needed,
        available: ing.currentQty,
      });
    }
  }
  return missing;
}

/**
 * خصم وصفة صنف × الكمية.
 * sign = -1 للخصم (بيع)، +1 للرد (حذف صنف أو إلغاء فاتورة).
 * بيرجّع الخامات اللي رصيدها نزل تحت الصفر عشان الواجهة تنبّه المدير.
 */
export async function applyRecipe({ menuItem, recipe, qty, sign, refId, userId, note = '' }, session) {
  // لو الفاتورة مخزّنة نسخة وصفة (appliedRecipe) بنستخدمها — عشان الرد يطلع بنفس
  // الكميات اللي اتخصمت بالظبط، حتى لو المدير عدّل الوصفة بعد ما الصنف اتضاف.
  const lines = recipe || menuItem?.recipe || [];
  if (menuItem && !menuItem.trackStock) return [];
  if (!lines.length || qty <= 0) return [];

  const short = [];
  for (const line of lines) {
    if (!line.qty) continue;
    const ing = await applyMovement(
      {
        ingredientId: line.ingredientId,
        delta: sign * line.qty * qty,
        type: sign < 0 ? 'sale' : 'return',
        refType: 'order',
        refId,
        userId,
        note,
      },
      session
    );

    // الرصيد نزل تحت الصفر → بننبّه بس مابنمنعش (الزبون قاعد)، والعجز يبان في الجرد
    if (ing.currentQty < 0) {
      short.push({
        ingredientId: String(ing._id),
        nameAr: ing.nameAr,
        nameEn: ing.nameEn,
        unit: ing.unit,
        currentQty: ing.currentQty,
      });
    }
  }
  return short;
}

/* ------------------------------------------------------------------ *
 *  عمليات الفاتورة — كل واحدة فيها الخصم/الرد + تعديل الفاتورة
 *  في وحدة واحدة. لو أي خطوة فشلت، مفيش حاجة تتنفّذ.
 * ------------------------------------------------------------------ */

/** إضافة صنف للفاتورة — الخصم بيحصل هنا لأن المشروب بيتعمل دلوقتي، مش وقت الدفع */
export async function addItemWithStock({ order, menuItem, variant, qty, note = '', clientRequestId, userId }) {
  return withTx(async (session) => {
    // 🔒 نفس الريكوست اتبعت مرتين → بنرجّع الفاتورة زي ما هي من غير خصم تاني
    if (clientRequestId) {
      const dup = order.items.find((i) => i.clientRequestId === clientRequestId);
      if (dup) return { order, shortages: [], duplicate: true };
    }

    // النوع المختار (سادة/مظبوط/زيادة) بيحدد الوصفة والسعر
    const effectiveRecipe = variant ? variant.recipe || [] : menuItem.recipe || [];
    const effectivePrice = menuItem.price + (variant?.priceDelta || 0);

    // الوضع الصارم: نرفض الطلب أصلاً لو الخامة مش كافية
    if (blockWhenOutOfStock()) {
      const missing = await checkAvailability(menuItem, qty, session, effectiveRecipe);
      if (missing.length) {
        const err = new AppError('OUT_OF_STOCK', 409);
        err.details = missing;
        throw err;
      }
    }

    // نسخة الوصفة اللي هتتخصم — بتتخزّن مع السطر عشان الرد يبقى مطابق
    const snapshot = menuItem.trackStock
      ? effectiveRecipe.map((l) => ({ ingredientId: l.ingredientId, qty: l.qty }))
      : [];

    const shortages = await applyRecipe(
      { recipe: snapshot, qty, sign: -1, refId: order._id, userId },
      session
    );

    order.items.push({
      menuItemId: menuItem._id,
      nameAr: menuItem.nameAr,
      nameEn: menuItem.nameEn,
      price: effectivePrice, // 📌 سعر لحظة الإضافة، شامل فرق النوع
      variantId: variant?._id || null,
      variantNameAr: variant?.nameAr || '',
      variantNameEn: variant?.nameEn || '',
      qty,
      paidQty: 0,
      stockApplied: true, // 🔒 يمنع الخصم مرتين لو السطر اتعالج تاني
      appliedQty: qty,
      appliedRecipe: snapshot,
      clientRequestId: clientRequestId || null,
      note,
    });

    order.recalc();
    await order.save(session ? { session } : undefined);
    return { order, shortages, duplicate: false };
  });
}

/** تعديل كمية سطر — بيخصم أو يرد الفرق بس، مش الكمية كلها */
export async function changeItemQtyWithStock({ order, itemId, newQty, userId }) {
  return withTx(async (session) => {
    const item = order.items.id(itemId);
    if (!item) throw new AppError('ITEM_NOT_FOUND', 404);

    const applied = item.stockApplied ? item.appliedQty || 0 : 0;
    const delta = newQty - applied; // موجب = محتاجين نخصم زيادة، سالب = نرد

    let shortages = [];
    if (delta !== 0 && item.appliedRecipe?.length) {
      shortages = await applyRecipe(
        {
          recipe: item.appliedRecipe,
          qty: Math.abs(delta),
          sign: delta > 0 ? -1 : 1,
          refId: order._id,
          userId,
        },
        session
      );
    }

    if (newQty <= 0) {
      order.items.pull({ _id: item._id }); // الكمية صفر = حذف السطر
    } else {
      item.qty = newQty;
      item.appliedQty = newQty;
      item.stockApplied = true;
    }

    order.recalc();
    await order.save(session ? { session } : undefined);
    return { order, shortages };
  });
}

/** حذف صنف من الفاتورة — بيرد نفس الكميات اللي اتخصمت بالظبط */
export async function removeItemWithStock({ order, itemId, userId }) {
  return withTx(async (session) => {
    const item = order.items.id(itemId);
    if (!item) throw new AppError('ITEM_NOT_FOUND', 404);

    if (item.stockApplied && item.appliedQty > 0 && item.appliedRecipe?.length) {
      await applyRecipe(
        { recipe: item.appliedRecipe, qty: item.appliedQty, sign: 1, refId: order._id, userId },
        session
      );
    }

    order.items.pull({ _id: item._id });
    order.recalc();
    await order.save(session ? { session } : undefined);
    return { order };
  });
}

/** إلغاء فاتورة — بيرد كل خامات كل أصنافها ويفضّي الطاولة، والفاتورة بتفضل موجودة */
export async function voidOrderWithStock({ order, reason, userId }) {
  return withTx(async (session) => {
    for (const item of order.items) {
      if (!item.stockApplied || !(item.appliedQty > 0) || !item.appliedRecipe?.length) continue;
      await applyRecipe(
        {
          recipe: item.appliedRecipe,
          qty: item.appliedQty,
          sign: 1,
          refId: order._id,
          userId,
          note: 'void',
        },
        session
      );
      item.stockApplied = false; // اترد خلاص — يمنع الرد مرتين
      item.appliedQty = 0;
    }

    order.status = 'void';
    order.voidReason = reason || '';
    order.voidedByUserId = userId;
    order.closedAt = order.closedAt || new Date();
    await order.save(session ? { session } : undefined);

    const tOpts = session ? { session } : undefined;
    await Table.findByIdAndUpdate(order.tableId, { status: 'free' }, tOpts);

    return { order };
  });
}
