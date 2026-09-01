/**
 * سكربت البيانات التجريبية.
 *   npm run seed          → بيملا القاعدة لو فاضية
 *   npm run seed:reset    → بيمسح كل حاجة ويبني من الأول
 *
 * بيعمل: 3 تصنيفات · 12 خامة · 15 صنف بوصفاتهم · 10 طاولات ·
 *        مدير وريسبشن · 200 فاتورة على آخر 30 يوم بحركات مخزونها ·
 *        وجرد مقفول على الشهر اللي فات فيه فروقات حقيقية.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import { connectDB } from './db.js';
import User from './models/User.js';
import Category from './models/Category.js';
import Ingredient from './models/Ingredient.js';
import MenuItem from './models/MenuItem.js';
import Table from './models/Table.js';
import Shift from './models/Shift.js';
import Order from './models/Order.js';
import StockMovement from './models/StockMovement.js';
import Stocktake from './models/Stocktake.js';
import AuditLog from './models/AuditLog.js';

const RESET = process.argv.includes('--reset');
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const round = (n) => Math.round(n * 100) / 100;
const day = 86400000;

/* ------------------------------------------------------------------ *
 * 1) الخامات — الوحدة والتكلفة وحد التنبيه
 * ------------------------------------------------------------------ */
const INGREDIENTS = [
  { key: 'coffee', nameAr: 'بن', nameEn: 'Coffee beans', unit: 'g', costPerUnit: 0.28, minQty: 2000, opening: 12000 },
  { key: 'milk', nameAr: 'لبن', nameEn: 'Milk', unit: 'ml', costPerUnit: 0.032, minQty: 8000, opening: 45000 },
  { key: 'sugar', nameAr: 'سكر', nameEn: 'Sugar', unit: 'g', costPerUnit: 0.03, minQty: 3000, opening: 20000 },
  { key: 'tea', nameAr: 'شاي', nameEn: 'Tea', unit: 'g', costPerUnit: 0.18, minQty: 500, opening: 3000 },
  { key: 'lemon', nameAr: 'ليمون', nameEn: 'Lemon', unit: 'ml', costPerUnit: 0.045, minQty: 2000, opening: 9000 },
  { key: 'mint', nameAr: 'نعناع', nameEn: 'Mint', unit: 'g', costPerUnit: 0.09, minQty: 300, opening: 1400 },
  { key: 'cocoa', nameAr: 'كاكاو', nameEn: 'Cocoa', unit: 'g', costPerUnit: 0.42, minQty: 500, opening: 2600 },
  { key: 'water', nameAr: 'مياه معدنية', nameEn: 'Bottled water', unit: 'pc', costPerUnit: 3.5, minQty: 24, opening: 90 },
  { key: 'cup', nameAr: 'كوباية', nameEn: 'Cup', unit: 'pc', costPerUnit: 0.9, minQty: 200, opening: 1500 },
  { key: 'straw', nameAr: 'شاليموه', nameEn: 'Straw', unit: 'pc', costPerUnit: 0.15, minQty: 200, opening: 900 },
  { key: 'ice', nameAr: 'تلج', nameEn: 'Ice', unit: 'g', costPerUnit: 0.004, minQty: 5000, opening: 30000 },
  { key: 'cake', nameAr: 'كيك', nameEn: 'Cake slice', unit: 'pc', costPerUnit: 14, minQty: 10, opening: 40 },
];

/* ------------------------------------------------------------------ *
 * 2) المنيو — كل صنف بوصفته
 * ------------------------------------------------------------------ */
const MENU = [
  { cat: 'hot', nameAr: 'اسبريسو', nameEn: 'Espresso', price: 30, recipe: { coffee: 18, cup: 1 } },
  { cat: 'hot', nameAr: 'كابتشينو', nameEn: 'Cappuccino', price: 45, recipe: { coffee: 18, milk: 150, sugar: 8, cup: 1 } },
  { cat: 'hot', nameAr: 'لاتيه', nameEn: 'Latte', price: 50, recipe: { coffee: 18, milk: 200, sugar: 8, cup: 1 } },
  { cat: 'hot', nameAr: 'قهوة تركي', nameEn: 'Turkish coffee', price: 28, recipe: { coffee: 14, sugar: 10, cup: 1 } },
  { cat: 'hot', nameAr: 'شاي', nameEn: 'Tea', price: 20, recipe: { tea: 4, sugar: 10, cup: 1 } },
  { cat: 'hot', nameAr: 'شاي بالنعناع', nameEn: 'Mint tea', price: 25, recipe: { tea: 4, mint: 5, sugar: 10, cup: 1 } },
  { cat: 'hot', nameAr: 'هوت شوكليت', nameEn: 'Hot chocolate', price: 55, recipe: { cocoa: 25, milk: 200, sugar: 15, cup: 1 } },
  { cat: 'cold', nameAr: 'آيس كوفي', nameEn: 'Iced coffee', price: 55, recipe: { coffee: 18, milk: 120, sugar: 12, ice: 120, cup: 1, straw: 1 } },
  { cat: 'cold', nameAr: 'آيس لاتيه', nameEn: 'Iced latte', price: 58, recipe: { coffee: 18, milk: 180, sugar: 12, ice: 100, cup: 1, straw: 1 } },
  { cat: 'cold', nameAr: 'ليمون نعناع', nameEn: 'Lemon mint', price: 40, recipe: { lemon: 60, mint: 5, sugar: 20, ice: 100, cup: 1, straw: 1 } },
  { cat: 'cold', nameAr: 'عصير ليمون', nameEn: 'Lemonade', price: 35, recipe: { lemon: 70, sugar: 20, ice: 100, cup: 1, straw: 1 } },
  { cat: 'cold', nameAr: 'ميلك شيك شوكولت', nameEn: 'Chocolate milkshake', price: 65, recipe: { cocoa: 20, milk: 250, sugar: 20, ice: 80, cup: 1, straw: 1 } },
  // مشتراة جاهزة — بتتخصم كقطعة واحدة
  { cat: 'snacks', nameAr: 'مياه معدنية', nameEn: 'Bottled water', price: 10, recipe: { water: 1 } },
  { cat: 'snacks', nameAr: 'قطعة كيك', nameEn: 'Cake slice', price: 45, recipe: { cake: 1 } },
  { cat: 'snacks', nameAr: 'كيك بالشوكولت', nameEn: 'Chocolate cake', price: 55, recipe: { cake: 1, cocoa: 10 } },
];

const AREAS = ['indoor', 'outdoor', 'vip'];

async function main() {
  await connectDB();
  console.log('[seed] connected');

  if (RESET) {
    await Promise.all([
      User.deleteMany({}),
      Category.deleteMany({}),
      Ingredient.deleteMany({}),
      MenuItem.deleteMany({}),
      Table.deleteMany({}),
      Shift.deleteMany({}),
      Order.deleteMany({}),
      StockMovement.deleteMany({}),
      Stocktake.deleteMany({}),
      AuditLog.deleteMany({}),
    ]);
    console.log('[seed] wiped');
  } else if (await User.countDocuments()) {
    console.log('[seed] القاعدة فيها بيانات بالفعل. استخدم: npm run seed:reset');
    return;
  }

  /* ---------- الحسابات ---------- */
  const manager = await User.create({
    name: 'أحمد المدير',
    username: (process.env.SEED_MANAGER_USERNAME || 'manager').toLowerCase(),
    passwordHash: await bcrypt.hash(process.env.SEED_MANAGER_PASSWORD || 'manager123', 10),
    role: 'manager',
  });
  const reception = await User.create({
    name: 'سارة الريسبشن',
    username: (process.env.SEED_RECEPTION_USERNAME || 'reception').toLowerCase(),
    passwordHash: await bcrypt.hash(process.env.SEED_RECEPTION_PASSWORD || 'reception123', 10),
    role: 'reception',
  });
  const reception2 = await User.create({
    name: 'محمد الكاشير',
    username: 'reception2',
    passwordHash: await bcrypt.hash('reception123', 10),
    role: 'reception',
  });
  console.log('[seed] users: 3');

  /* ---------- التصنيفات ---------- */
  const cats = {};
  cats.hot = await Category.create({ nameAr: 'مشروبات ساخنة', nameEn: 'Hot drinks', sortOrder: 1 });
  cats.cold = await Category.create({ nameAr: 'مشروبات باردة', nameEn: 'Cold drinks', sortOrder: 2 });
  cats.snacks = await Category.create({ nameAr: 'سناكس', nameEn: 'Snacks', sortOrder: 3 });

  /* ---------- الطاولات ---------- */
  const tables = [];
  for (let i = 1; i <= 10; i += 1) {
    tables.push(
      await Table.create({
        number: i,
        name: '',
        area: i <= 5 ? AREAS[0] : i <= 8 ? AREAS[1] : AREAS[2],
        seats: i <= 8 ? 4 : 6,
      })
    );
  }

  /* ---------- الخامات + رصيدها الافتتاحي كحركة purchase ---------- */
  const start = new Date(Date.now() - 31 * day);
  const ing = {};
  const movements = [];

  for (const spec of INGREDIENTS) {
    const doc = await Ingredient.create({
      nameAr: spec.nameAr,
      nameEn: spec.nameEn,
      unit: spec.unit,
      currentQty: 0,
      minQty: spec.minQty,
      costPerUnit: spec.costPerUnit,
    });
    ing[spec.key] = doc;

    // الرصيد الابتدائي بيدخل كحركة عشان يفضل مفسّر ويظهر في الجرد
    movements.push({
      ingredientId: doc._id,
      type: 'purchase',
      qty: spec.opening,
      balanceAfter: spec.opening,
      unitCost: spec.costPerUnit,
      refType: 'manual',
      userId: manager._id,
      note: 'opening balance',
      at: start,
    });
    doc.__balance = spec.opening; // بنتابع الرصيد في الذاكرة عشان balanceAfter يطلع صح
  }
  console.log('[seed] ingredients: 12');

  /* ---------- المنيو بالوصفات ---------- */
  const menu = [];
  for (const m of MENU) {
    const recipe = Object.entries(m.recipe).map(([k, qty]) => ({ ingredientId: ing[k]._id, qty }));
    menu.push(
      await MenuItem.create({
        nameAr: m.nameAr,
        nameEn: m.nameEn,
        price: m.price,
        categoryId: cats[m.cat]._id,
        available: true,
        trackStock: true,
        recipe,
      })
    );
  }
  console.log('[seed] menu items: 15');

  /* ---------- شيفتات + 200 فاتورة على آخر 30 يوم ---------- */
  const menuByKey = Object.fromEntries(menu.map((m, i) => [MENU[i].nameEn, { doc: m, spec: MENU[i] }]));
  const staff = [reception, reception2, manager];
  const orders = [];
  const shiftsByDayUser = new Map();

  /** بيسجّل حركة ويحدّث الرصيد المتابَع */
  const move = (ingredient, delta, type, at, refId, userId) => {
    ingredient.__balance = round(ingredient.__balance + delta);
    movements.push({
      ingredientId: ingredient._id,
      type,
      qty: delta,
      balanceAfter: ingredient.__balance,
      unitCost: ingredient.costPerUnit,
      refType: refId ? 'order' : 'manual',
      refId: refId || null,
      userId,
      at,
    });
  };

  const TOTAL_ORDERS = 200;
  for (let n = 0; n < TOTAL_ORDERS; n += 1) {
    // موزّعة على آخر 30 يوم، وساعات الذروة بين 10ص و 11م
    const daysAgo = Math.floor(rnd(0, 30));
    const hour = Math.floor(rnd(10, 23));
    const at = new Date(Date.now() - daysAgo * day);
    at.setHours(hour, Math.floor(rnd(0, 59)), 0, 0);

    const user = pick(staff);
    const dayKey = `${at.toDateString()}|${user._id}`;

    // شيفت واحد لكل موظف في اليوم
    let shift = shiftsByDayUser.get(dayKey);
    if (!shift) {
      const startedAt = new Date(at);
      startedAt.setHours(9, 0, 0, 0);
      const endedAt = new Date(at);
      endedAt.setHours(23, 59, 0, 0);
      shift = await Shift.create({
        userId: user._id,
        startedAt,
        endedAt: daysAgo === 0 ? null : endedAt, // شيفت النهاردة سايبينه مفتوح
        openingCash: 500,
      });
      shiftsByDayUser.set(dayKey, shift);
    }

    const table = pick(tables);
    const openedAt = new Date(at.getTime() - Math.floor(rnd(15, 75)) * 60000);

    // 1 لـ 4 أصناف في الفاتورة
    const lines = [];
    const count = Math.floor(rnd(1, 4.99));
    for (let k = 0; k < count; k += 1) {
      const entry = pick(MENU);
      const qty = Math.floor(rnd(1, 2.99));
      lines.push({ entry, qty });
    }

    const order = new Order({
      tableId: table._id,
      shiftId: shift._id,
      userId: user._id,
      status: 'paid',
      openedAt,
      closedAt: at,
      paymentMethod: pick(['cash', 'cash', 'cash', 'card', 'wallet']),
      items: [],
    });

    for (const { entry, qty } of lines) {
      const mi = menuByKey[entry.nameEn].doc;
      const snapshot = mi.recipe.map((l) => ({ ingredientId: l.ingredientId, qty: l.qty }));

      order.items.push({
        menuItemId: mi._id,
        nameAr: mi.nameAr,
        nameEn: mi.nameEn,
        price: mi.price,
        qty,
        paidQty: qty,
        stockApplied: true,
        appliedQty: qty,
        appliedRecipe: snapshot,
      });

      // الخصم من المخزون بيحصل وقت إضافة الصنف
      for (const [key, per] of Object.entries(entry.recipe)) {
        move(ing[key], -per * qty, 'sale', at, order._id, user._id);
      }
    }

    // خصم على واحدة من كل 12 فاتورة، والمدير هو اللي بيعمله
    if (n % 12 === 0) {
      order.discount = { type: 'percent', value: 10, byUserId: manager._id, reason: 'زبون دائم' };
    }

    order.recalc();
    orders.push(order);
  }

  await Order.insertMany(orders);
  console.log(`[seed] orders: ${orders.length}`);

  /* ---------- إلغاء 6 فواتير مع رد الخامات ---------- */
  const toVoid = orders.slice(0, 6);
  for (const o of toVoid) {
    for (const item of o.items) {
      const spec = MENU.find((m) => m.nameEn === item.nameEn);
      if (!spec) continue;
      for (const [key, per] of Object.entries(spec.recipe)) {
        move(ing[key], per * item.qty, 'return', o.closedAt, o._id, manager._id);
      }
    }
    await Order.updateOne(
      { _id: o._id },
      {
        $set: {
          status: 'void',
          voidReason: 'الزبون مشي من غير ما يشرب',
          voidedByUserId: manager._id,
          'items.$[].stockApplied': false,
          'items.$[].appliedQty': 0,
        },
      }
    );
  }
  console.log('[seed] voided orders: 6');

  /* ---------- توريدات ومهدر على مدار الشهر ---------- */
  for (let d = 28; d >= 2; d -= 4) {
    const at = new Date(Date.now() - d * day);
    at.setHours(8, 30, 0, 0);
    for (const key of ['coffee', 'milk', 'sugar', 'cup', 'ice']) {
      const amount = { coffee: 5000, milk: 20000, sugar: 8000, cup: 500, ice: 20000 }[key];
      move(ing[key], amount, 'purchase', at, null, manager._id);
    }
  }
  for (let d = 26; d >= 3; d -= 7) {
    const at = new Date(Date.now() - d * day);
    at.setHours(21, 0, 0, 0);
    move(ing.cup, -Math.floor(rnd(2, 8)), 'waste', at, null, manager._id);
    move(ing.milk, -Math.floor(rnd(200, 900)), 'waste', at, null, manager._id);
  }

  // نرتّب الحركات بالتاريخ ونعيد بناء balanceAfter عشان السجل يبقى متسق زمنياً
  movements.sort((a, b) => a.at - b.at);
  const running = {};
  for (const m of movements) {
    const k = String(m.ingredientId);
    running[k] = round((running[k] || 0) + m.qty);
    m.balanceAfter = running[k];
  }
  await StockMovement.insertMany(movements);

  // الرصيد الحالي = آخر balanceAfter لكل خامة
  for (const [k, balance] of Object.entries(running)) {
    await Ingredient.updateOne({ _id: k }, { currentQty: balance });
  }
  console.log(`[seed] stock movements: ${movements.length}`);

  // نخلّي خامتين تحت حد التنبيه عشان شاشة المخزون تبان فيها حالات حقيقية
  await Ingredient.updateOne({ _id: ing.mint._id }, { minQty: 5000 });
  await Ingredient.updateOne({ _id: ing.cocoa._id }, { minQty: 4000 });

  /* ---------- جرد مقفول على الشهر اللي فات، فيه فروقات ---------- */
  await buildClosedStocktake(manager, ing);

  // بعد ما اتزوّدت حركات الجرد، بنعيد بناء balanceAfter لكل السجل بالترتيب الزمني
  // عشان أي رصيد في أي لحظة يفضل قابل للتفسير، والرصيد الحالي يطابق آخر حركة.
  await rebuildLedger();

  await AuditLog.create({
    userId: manager._id,
    action: 'seed.run',
    entity: 'System',
    after: { orders: orders.length, movements: movements.length },
  });

  console.log('\n[seed] تم. بيانات الدخول:');
  console.log(`  مدير:    ${manager.username} / ${process.env.SEED_MANAGER_PASSWORD || 'manager123'}`);
  console.log(`  ريسبشن:  ${reception.username} / ${process.env.SEED_RECEPTION_PASSWORD || 'reception123'}`);
}

/**
 * بيبني جرد على أول 15 يوم من الفترة ويقفله بفروقات.
 * بنحسب المتوقّع من الحركات نفسها زي ما الراوت بيعمل بالظبط.
 */
async function buildClosedStocktake(manager, ing) {
  const to = new Date(Date.now() - 16 * day);
  const from = new Date(Date.now() - 31 * day);

  const ingredients = await Ingredient.find({ active: true }).lean();

  const openings = await StockMovement.aggregate([
    { $match: { at: { $lt: from } } },
    { $sort: { at: -1 } },
    { $group: { _id: '$ingredientId', balanceAfter: { $first: '$balanceAfter' } } },
  ]);
  const openingById = Object.fromEntries(openings.map((o) => [String(o._id), o.balanceAfter]));

  const aggs = await StockMovement.aggregate([
    { $match: { at: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: '$ingredientId',
        purchased: { $sum: { $cond: [{ $eq: ['$type', 'purchase'] }, '$qty', 0] } },
        consumed: { $sum: { $cond: [{ $eq: ['$type', 'sale'] }, '$qty', 0] } },
        waste: { $sum: { $cond: [{ $eq: ['$type', 'waste'] }, '$qty', 0] } },
        returned: { $sum: { $cond: [{ $eq: ['$type', 'return'] }, '$qty', 0] } },
        adjusted: { $sum: { $cond: [{ $eq: ['$type', 'adjustment'] }, '$qty', 0] } },
      },
    },
  ]);
  const aggById = Object.fromEntries(aggs.map((a) => [String(a._id), a]));

  let totalDiffValue = 0;
  const lines = ingredients.map((i) => {
    const opening = openingById[String(i._id)] ?? 0;
    const a = aggById[String(i._id)] || { purchased: 0, consumed: 0, waste: 0, returned: 0, adjusted: 0 };
    const expected = round(opening + a.purchased + a.consumed + a.waste + a.returned + a.adjusted);

    // فرق واقعي: أغلب الخامات فيها عجز بسيط، وواحدة فيها زيادة
    const drift = i.unit === 'pc' ? Math.round(rnd(-4, 1)) : round(expected * rnd(-0.02, 0.005));
    const counted = round(expected + drift);
    const diffQty = round(counted - expected);
    const diffValue = round(diffQty * i.costPerUnit);
    totalDiffValue += diffValue;

    return {
      ingredientId: i._id,
      openingQty: round(opening),
      purchasedQty: round(a.purchased),
      consumedQty: round(Math.abs(a.consumed)),
      wasteQty: round(Math.abs(a.waste)),
      returnedQty: round(a.returned),
      adjustedQty: round(a.adjusted),
      expectedQty: expected,
      countedQty: counted,
      diffQty,
      diffValue,
      unitCost: i.costPerUnit,
    };
  });

  const st = await Stocktake.create({
    from,
    to,
    status: 'closed',
    createdBy: manager._id,
    closedAt: new Date(to.getTime() + 3600000),
    lines,
    totalDiffValue: round(totalDiffValue),
    note: 'جرد نصف الشهر',
  });

  // حركات التسوية الناتجة عن قفل الجرد
  const stMoves = lines
    .filter((l) => l.diffQty !== 0)
    .map((l) => ({
      ingredientId: l.ingredientId,
      type: 'stocktake',
      qty: l.diffQty,
      balanceAfter: l.countedQty,
      unitCost: l.unitCost,
      refType: 'stocktake',
      refId: st._id,
      userId: manager._id,
      note: 'stocktake close',
      at: st.closedAt,
    }));
  if (stMoves.length) await StockMovement.insertMany(stMoves);

  await AuditLog.create({
    userId: manager._id,
    action: 'stocktake.close',
    entity: 'Stocktake',
    entityId: st._id,
    after: { totalDiffValue: st.totalDiffValue, lines: lines.length },
  });

  console.log(`[seed] closed stocktake with ${stMoves.length} adjustments`);
}

/** بيعيد حساب balanceAfter لكل الحركات بالترتيب، ويظبط الرصيد الحالي على آخر واحدة */
async function rebuildLedger() {
  const all = await StockMovement.find().sort({ at: 1, _id: 1 }).select('ingredientId qty').lean();
  const running = {};
  const ops = [];
  for (const m of all) {
    const k = String(m.ingredientId);
    running[k] = round((running[k] || 0) + m.qty);
    ops.push({ updateOne: { filter: { _id: m._id }, update: { balanceAfter: running[k] } } });
  }
  if (ops.length) await StockMovement.bulkWrite(ops);
  for (const [k, balance] of Object.entries(running)) {
    await Ingredient.updateOne({ _id: k }, { currentQty: balance });
  }
  console.log('[seed] ledger rebuilt:', ops.length, 'movements');
}

main()
  .catch((e) => {
    console.error('[seed] failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
