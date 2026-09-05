/**
 * سكربت البيانات التجريبية.
 *   npm run seed          → بيملا القاعدة لو فاضية
 *   npm run seed:reset    → بيمسح كل حاجة ويبني من الأول
 *
 * بيعمل: 3 تصنيفات مشروبات · 16 خامة · 20 مشروب (والقهوة والشاي بأنواعهم
 *        سادة/مظبوط/زيادة) · 12 طاولة · 6 عمّال · مدير وريسبشنين ·
 *        200 فاتورة على آخر 30 يوم بحركات مخزونها · وجرد مقفول فيه فروقات.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import { connectDB } from './db.js';
import User from './models/User.js';
import Worker from './models/Worker.js';
import Category from './models/Category.js';
import Ingredient from './models/Ingredient.js';
import MenuItem from './models/MenuItem.js';
import Table from './models/Table.js';
import Shift from './models/Shift.js';
import Order from './models/Order.js';
import StockMovement from './models/StockMovement.js';
import Stocktake from './models/Stocktake.js';
import Expense from './models/Expense.js';
import AuditLog from './models/AuditLog.js';

const RESET = process.argv.includes('--reset');
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const round = (n) => Math.round(n * 100) / 100;
const day = 86400000;

/* ------------------------------------------------------------------ *
 * 1) الخامات
 * ------------------------------------------------------------------ */
const INGREDIENTS = [
  { key: 'turkishCoffee', nameAr: 'بن تركي', nameEn: 'Turkish coffee', unit: 'g', costPerUnit: 0.3, minQty: 2000, opening: 14000 },
  { key: 'espresso', nameAr: 'بن اسبريسو', nameEn: 'Espresso beans', unit: 'g', costPerUnit: 0.35, minQty: 2000, opening: 15000 },
  { key: 'nescafe', nameAr: 'نسكافيه', nameEn: 'Instant coffee', unit: 'g', costPerUnit: 0.55, minQty: 500, opening: 3000 },
  { key: 'milk', nameAr: 'لبن', nameEn: 'Milk', unit: 'ml', costPerUnit: 0.032, minQty: 8000, opening: 60000 },
  { key: 'cream', nameAr: 'كريمة', nameEn: 'Whipped cream', unit: 'ml', costPerUnit: 0.08, minQty: 1000, opening: 5000 },
  { key: 'sugar', nameAr: 'سكر', nameEn: 'Sugar', unit: 'g', costPerUnit: 0.03, minQty: 3000, opening: 25000 },
  { key: 'tea', nameAr: 'شاي', nameEn: 'Tea', unit: 'g', costPerUnit: 0.18, minQty: 500, opening: 4000 },
  { key: 'cocoa', nameAr: 'كاكاو', nameEn: 'Cocoa', unit: 'g', costPerUnit: 0.42, minQty: 500, opening: 3000 },
  { key: 'caramel', nameAr: 'كراميل', nameEn: 'Caramel syrup', unit: 'ml', costPerUnit: 0.12, minQty: 500, opening: 2500 },
  { key: 'lemon', nameAr: 'ليمون', nameEn: 'Lemon', unit: 'ml', costPerUnit: 0.045, minQty: 2000, opening: 12000 },
  { key: 'mint', nameAr: 'نعناع', nameEn: 'Mint', unit: 'g', costPerUnit: 0.09, minQty: 300, opening: 1600 },
  { key: 'orange', nameAr: 'برتقال', nameEn: 'Orange', unit: 'ml', costPerUnit: 0.05, minQty: 3000, opening: 16000 },
  { key: 'mango', nameAr: 'مانجو', nameEn: 'Mango', unit: 'ml', costPerUnit: 0.09, minQty: 2000, opening: 9000 },
  { key: 'ice', nameAr: 'تلج', nameEn: 'Ice', unit: 'g', costPerUnit: 0.004, minQty: 5000, opening: 40000 },
  { key: 'cup', nameAr: 'كوباية', nameEn: 'Cup', unit: 'pc', costPerUnit: 0.9, minQty: 200, opening: 2000 },
  { key: 'straw', nameAr: 'شاليموه', nameEn: 'Straw', unit: 'pc', costPerUnit: 0.15, minQty: 200, opening: 1200 },
];

/**
 * مكاييل الإدخال — عشان الوصفة تتكتب «معلقة» بدل «5 جرام».
 * المفتاح هو الخامة، والقيمة كام وحدة أساس في المكيال.
 */
const MEASURES = {
  sugar: [{ nameAr: 'معلقة', nameEn: 'Spoon', factor: 5 }, { nameAr: 'كيس', nameEn: 'Sachet', factor: 1000 }],
  tea: [{ nameAr: 'معلقة', nameEn: 'Spoon', factor: 4 }],
  nescafe: [{ nameAr: 'معلقة', nameEn: 'Spoon', factor: 6 }],
  cocoa: [{ nameAr: 'معلقة', nameEn: 'Spoon', factor: 8 }],
  turkishCoffee: [{ nameAr: 'معلقة', nameEn: 'Spoon', factor: 7 }],
  espresso: [{ nameAr: 'جرعة', nameEn: 'Shot', factor: 18 }],
  milk: [{ nameAr: 'كوب', nameEn: 'Cup', factor: 200 }, { nameAr: 'لتر', nameEn: 'Litre', factor: 1000 }],
  cream: [{ nameAr: 'معلقة', nameEn: 'Spoon', factor: 15 }],
  caramel: [{ nameAr: 'ضغطة', nameEn: 'Pump', factor: 25 }],
};

/* ------------------------------------------------------------------ *
 * 2) المنيو — مشروبات كافيه، والقهوة والشاي بأنواعهم
 * ------------------------------------------------------------------ */

// أنواع السكر: نفس الوصفة بس السكر بيختلف
const sugarVariants = (baseRecipe) => [
  { nameAr: 'سادة', nameEn: 'No sugar', priceDelta: 0, recipe: { ...baseRecipe, sugar: 0 } },
  { nameAr: 'مظبوط', nameEn: 'Medium sugar', priceDelta: 0, recipe: { ...baseRecipe, sugar: 10 } },
  { nameAr: 'زيادة', nameEn: 'Extra sugar', priceDelta: 0, recipe: { ...baseRecipe, sugar: 20 } },
];

const MENU = [
  // ---- ساخنة ----
  { cat: 'hot', nameAr: 'قهوة تركي', nameEn: 'Turkish coffee', price: 28, variants: sugarVariants({ turkishCoffee: 14, cup: 1 }) },
  { cat: 'hot', nameAr: 'قهوة فرنساوي', nameEn: 'French coffee', price: 35, variants: sugarVariants({ turkishCoffee: 16, milk: 60, cup: 1 }) },
  { cat: 'hot', nameAr: 'نسكافيه', nameEn: 'Nescafe', price: 30, variants: sugarVariants({ nescafe: 6, milk: 80, cup: 1 }) },
  { cat: 'hot', nameAr: 'شاي', nameEn: 'Tea', price: 20, variants: sugarVariants({ tea: 4, cup: 1 }) },
  { cat: 'hot', nameAr: 'شاي بالنعناع', nameEn: 'Mint tea', price: 25, variants: sugarVariants({ tea: 4, mint: 5, cup: 1 }) },
  { cat: 'hot', nameAr: 'اسبريسو', nameEn: 'Espresso', price: 30, recipe: { espresso: 18, cup: 1 } },
  { cat: 'hot', nameAr: 'دبل اسبريسو', nameEn: 'Double espresso', price: 40, recipe: { espresso: 36, cup: 1 } },
  { cat: 'hot', nameAr: 'كابتشينو', nameEn: 'Cappuccino', price: 45, recipe: { espresso: 18, milk: 150, cup: 1 } },
  { cat: 'hot', nameAr: 'لاتيه', nameEn: 'Latte', price: 50, recipe: { espresso: 18, milk: 200, cup: 1 } },
  { cat: 'hot', nameAr: 'مكياتو', nameEn: 'Macchiato', price: 42, recipe: { espresso: 18, milk: 40, cup: 1 } },
  { cat: 'hot', nameAr: 'موكا', nameEn: 'Mocha', price: 55, recipe: { espresso: 18, milk: 160, cocoa: 15, cup: 1 } },
  { cat: 'hot', nameAr: 'هوت شوكليت', nameEn: 'Hot chocolate', price: 50, recipe: { cocoa: 25, milk: 200, sugar: 15, cup: 1 } },

  // ---- باردة ----
  { cat: 'cold', nameAr: 'آيس كوفي', nameEn: 'Iced coffee', price: 55, recipe: { espresso: 18, milk: 120, sugar: 12, ice: 120, cup: 1, straw: 1 } },
  { cat: 'cold', nameAr: 'آيس لاتيه', nameEn: 'Iced latte', price: 58, recipe: { espresso: 18, milk: 180, sugar: 12, ice: 100, cup: 1, straw: 1 } },
  { cat: 'cold', nameAr: 'فرابتشينو كراميل', nameEn: 'Caramel frappuccino', price: 70, recipe: { espresso: 18, milk: 180, caramel: 25, cream: 30, ice: 120, cup: 1, straw: 1 } },
  { cat: 'cold', nameAr: 'ميلك شيك شوكولت', nameEn: 'Chocolate milkshake', price: 65, recipe: { cocoa: 20, milk: 250, sugar: 20, cream: 20, ice: 80, cup: 1, straw: 1 } },
  { cat: 'cold', nameAr: 'ليمون نعناع', nameEn: 'Lemon mint', price: 40, recipe: { lemon: 60, mint: 5, sugar: 20, ice: 100, cup: 1, straw: 1 } },

  // ---- عصائر ----
  { cat: 'juice', nameAr: 'عصير ليمون', nameEn: 'Lemonade', price: 35, recipe: { lemon: 70, sugar: 20, ice: 100, cup: 1, straw: 1 } },
  { cat: 'juice', nameAr: 'عصير برتقال', nameEn: 'Orange juice', price: 40, recipe: { orange: 220, ice: 60, cup: 1, straw: 1 } },
  { cat: 'juice', nameAr: 'عصير مانجو', nameEn: 'Mango juice', price: 50, recipe: { mango: 180, milk: 40, sugar: 10, ice: 60, cup: 1, straw: 1 } },
];

const WORKERS = [
  { name: 'محمود حسن', jobTitle: 'barista', phone: '01001234567' },
  { name: 'كريم سعيد', jobTitle: 'barista', phone: '01112345678' },
  { name: 'مصطفى عادل', jobTitle: 'barista', phone: '01223456789' },
  { name: 'أميرة فؤاد', jobTitle: 'kitchen', phone: '01034567890' },
  { name: 'يوسف طارق', jobTitle: 'waiter', phone: '01145678901' },
  { name: 'هبة سمير', jobTitle: 'waiter', phone: '01256789012' },
];

async function main() {
  await connectDB();
  console.log('[seed] connected');

  if (RESET) {
    await Promise.all([
      User.deleteMany({}),
      Worker.deleteMany({}),
      Category.deleteMany({}),
      Ingredient.deleteMany({}),
      MenuItem.deleteMany({}),
      Table.deleteMany({}),
      Shift.deleteMany({}),
      Order.deleteMany({}),
      StockMovement.deleteMany({}),
      Stocktake.deleteMany({}),
      Expense.deleteMany({}),
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
    email: process.env.SEED_MANAGER_EMAIL || null,
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
    passwordHash: await bcrypt.hash(process.env.SEED_RECEPTION_PASSWORD || 'reception123', 10),
    role: 'reception',
  });
  console.log('[seed] users: 3');

  /* ---------- العمّال ---------- */
  const workers = await Worker.insertMany(WORKERS);
  console.log(`[seed] workers: ${workers.length}`);

  /* ---------- التصنيفات ---------- */
  const cats = {};
  cats.hot = await Category.create({ nameAr: 'مشروبات ساخنة', nameEn: 'Hot drinks', sortOrder: 1 });
  cats.cold = await Category.create({ nameAr: 'مشروبات باردة', nameEn: 'Cold drinks', sortOrder: 2 });
  cats.juice = await Category.create({ nameAr: 'عصائر طازة', nameEn: 'Fresh juices', sortOrder: 3 });

  /* ---------- الطاولات ---------- */
  const tables = [];
  for (let i = 1; i <= 12; i += 1) {
    tables.push(await Table.create({ number: i, seats: i <= 8 ? 4 : 6 }));
  }
  console.log('[seed] tables: 12');

  /* ---------- الخامات ---------- */
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
      measures: MEASURES[spec.key] || [],
    });
    ing[spec.key] = doc;

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
  }
  console.log(`[seed] ingredients: ${INGREDIENTS.length}`);

  /* ---------- المنيو بالوصفات والأنواع ---------- */
  const toLines = (recipe) =>
    Object.entries(recipe || {})
      .filter(([, qty]) => qty > 0)
      .map(([k, qty]) => ({ ingredientId: ing[k]._id, qty }));

  const menu = [];
  for (const m of MENU) {
    menu.push(
      await MenuItem.create({
        nameAr: m.nameAr,
        nameEn: m.nameEn,
        price: m.price,
        categoryId: cats[m.cat]._id,
        available: true,
        trackStock: true,
        recipe: toLines(m.recipe),
        variants: (m.variants || []).map((v) => ({
          nameAr: v.nameAr,
          nameEn: v.nameEn,
          priceDelta: v.priceDelta || 0,
          available: true,
          recipe: toLines(v.recipe),
        })),
      })
    );
  }
  console.log(`[seed] menu items: ${menu.length} (${menu.filter((m) => m.variants.length).length} بأنواع)`);

  /* ---------- الفواتير ---------- */
  const staff = [reception, reception2, manager];
  const orders = [];
  const shiftsByDayUser = new Map();

  const move = (ingredient, delta, type, at, refId, userId) => {
    movements.push({
      ingredientId: ingredient._id,
      type,
      qty: delta,
      balanceAfter: 0, // بيتعاد حسابه في النهاية بالترتيب الزمني
      unitCost: ingredient.costPerUnit,
      refType: refId ? 'order' : 'manual',
      refId: refId || null,
      userId,
      at,
    });
  };

  for (let n = 0; n < 200; n += 1) {
    const daysAgo = Math.floor(rnd(0, 30));
    const hour = Math.floor(rnd(10, 23));
    const at = new Date(Date.now() - daysAgo * day);
    at.setHours(hour, Math.floor(rnd(0, 59)), 0, 0);

    const user = pick(staff);
    const dayKey = `${at.toDateString()}|${user._id}`;

    let shift = shiftsByDayUser.get(dayKey);
    if (!shift) {
      const startedAt = new Date(at);
      startedAt.setHours(9, 0, 0, 0);
      const endedAt = new Date(at);
      endedAt.setHours(23, 59, 0, 0);
      // مين كان شغّال في الشيفت ده — 2 لـ 3 عمّال
      const onShift = [...workers].sort(() => Math.random() - 0.5).slice(0, Math.floor(rnd(2, 4)));
      shift = await Shift.create({
        userId: user._id,
        startedAt,
        endedAt: daysAgo === 0 ? null : endedAt,
        openingCash: 500,
        workers: onShift.map((w) => ({ workerId: w._id, name: w.name, jobTitle: w.jobTitle })),
      });
      shiftsByDayUser.set(dayKey, shift);
    }

    const table = pick(tables);
    const openedAt = new Date(at.getTime() - Math.floor(rnd(15, 75)) * 60000);

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

    const count = Math.floor(rnd(1, 4.99));
    for (let k = 0; k < count; k += 1) {
      const spec = pick(MENU);
      const mi = menu[MENU.indexOf(spec)];
      const qty = Math.floor(rnd(1, 2.99));

      // الصنف اللي ليه أنواع بياخد نوع عشوائي — والوصفة بتاعته هي اللي بتتخصم
      const hasVariants = mi.variants.length > 0;
      const vIndex = hasVariants ? Math.floor(rnd(0, mi.variants.length)) : -1;
      const variant = hasVariants ? mi.variants[vIndex] : null;
      const recipeLines = variant ? variant.recipe : mi.recipe;

      order.items.push({
        menuItemId: mi._id,
        nameAr: mi.nameAr,
        nameEn: mi.nameEn,
        price: mi.price + (variant?.priceDelta || 0),
        variantId: variant?._id || null,
        variantNameAr: variant?.nameAr || '',
        variantNameEn: variant?.nameEn || '',
        qty,
        paidQty: qty,
        stockApplied: true,
        appliedQty: qty,
        appliedRecipe: recipeLines.map((l) => ({ ingredientId: l.ingredientId, qty: l.qty })),
      });

      for (const line of recipeLines) {
        const ingDoc = Object.values(ing).find((x) => String(x._id) === String(line.ingredientId));
        move(ingDoc, -line.qty * qty, 'sale', at, order._id, user._id);
      }
    }

    if (n % 12 === 0) {
      order.discount = { type: 'percent', value: 10, byUserId: manager._id, reason: 'زبون دائم' };
    }

    order.recalc();
    orders.push(order);
  }

  await Order.insertMany(orders);
  console.log(`[seed] orders: ${orders.length}`);

  /* ---------- إلغاء 6 فواتير مع رد الخامات ---------- */
  for (const o of orders.slice(0, 6)) {
    for (const item of o.items) {
      for (const line of item.appliedRecipe) {
        const ingDoc = Object.values(ing).find((x) => String(x._id) === String(line.ingredientId));
        move(ingDoc, line.qty * item.qty, 'return', o.closedAt, o._id, manager._id);
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

  /* ---------- توريدات وهالك ---------- */
  for (let d = 28; d >= 2; d -= 4) {
    const at = new Date(Date.now() - d * day);
    at.setHours(8, 30, 0, 0);
    for (const [key, amount] of [
      ['espresso', 5000],
      ['turkishCoffee', 4000],
      ['milk', 25000],
      ['sugar', 8000],
      ['cup', 600],
      ['ice', 25000],
    ]) {
      move(ing[key], amount, 'purchase', at, null, manager._id);
    }
  }
  for (let d = 26; d >= 3; d -= 7) {
    const at = new Date(Date.now() - d * day);
    at.setHours(21, 0, 0, 0);
    move(ing.cup, -Math.floor(rnd(2, 8)), 'waste', at, null, manager._id);
    move(ing.milk, -Math.floor(rnd(200, 900)), 'waste', at, null, manager._id);
  }

  movements.sort((a, b) => a.at - b.at);
  await StockMovement.insertMany(movements);
  console.log(`[seed] stock movements: ${movements.length}`);

  // خامتين تحت حد التنبيه عشان شاشة المخزون تبان فيها حالات حقيقية
  await Ingredient.updateOne({ _id: ing.mint._id }, { minQty: 5000 });
  await Ingredient.updateOne({ _id: ing.cocoa._id }, { minQty: 4000 });

  /* ---------- المصروفات ---------- */
  const EXPENSES = [
    { category: 'rent', amount: 5500, note: 'إيجار الشهر' },
    { category: 'salaries', amount: 8500, note: 'مرتبات الفريق' },
    { category: 'utilities', amount: 1400, note: 'كهربا ومياه' },
    { category: 'utilities', amount: 900, note: 'غاز' },
    { category: 'supplies', amount: 1600, note: 'أكواب وشاليموهات' },
    { category: 'supplies', amount: 750, note: 'مناديل ومنظفات' },
    { category: 'maintenance', amount: 900, note: 'صيانة ماكينة الاسبريسو' },
    { category: 'maintenance', amount: 450, note: 'تصليح تكييف' },
    { category: 'marketing', amount: 1200, note: 'إعلان مموّل' },
    { category: 'transport', amount: 600, note: 'توصيل طلبيات' },
    { category: 'other', amount: 350, note: 'نثريات' },
  ];
  const expenseDocs = [];
  for (let i = 0; i < EXPENSES.length; i += 1) {
    const e = EXPENSES[i];
    const at = new Date(Date.now() - Math.floor(rnd(1, 29)) * day);
    at.setHours(Math.floor(rnd(9, 20)), 0, 0, 0);
    expenseDocs.push({ at, category: e.category, amount: e.amount, note: e.note, userId: manager._id });
  }
  await Expense.insertMany(expenseDocs);
  console.log(`[seed] expenses: ${expenseDocs.length}`);

  await buildClosedStocktake(manager);
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

/** جرد مقفول على أول 15 يوم، بفروقات واقعية */
async function buildClosedStocktake(manager) {
  const to = new Date(Date.now() - 16 * day);
  const from = new Date(Date.now() - 31 * day);

  const ingredients = await Ingredient.find({ active: true }).lean();

  const openings = await StockMovement.aggregate([
    { $match: { at: { $lt: from } } },
    { $sort: { at: -1, _id: -1 } },
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

main()
  .catch((e) => {
    console.error('[seed] failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
