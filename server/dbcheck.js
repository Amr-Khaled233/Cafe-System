/**
 * فحص سريع للاتصال قبل أي عملية كتابة.
 *   npm run db:check
 *
 * بيقولك انت متصل بأنهي سيرفر وأنهي قاعدة وفيها إيه — عشان ما تعملش
 * seed على القاعدة الغلط. مابيكتبش أي حاجة.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB, mongoUri, supportsTransactions } from './db.js';

const COLLECTIONS = ['users', 'categories', 'ingredients', 'menuitems', 'tables', 'shifts', 'orders', 'stockmovements', 'stocktakes', 'auditlogs'];

try {
  const uri = mongoUri();
  if (!uri) {
    console.error('مفيش MONGO_URI. حطه في .env أو في متغيّرات الـ shell.');
    process.exit(1);
  }

  // بنخفي الباسورد قبل الطباعة
  console.log('الرابط :', uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@'));

  await connectDB();
  const conn = mongoose.connection;

  console.log('السيرفر:', conn.host + (conn.port ? ':' + conn.port : ''));
  console.log('القاعدة:', conn.name);
  console.log('Transactions:', supportsTransactions() ? 'مدعومة ✅' : 'غير مدعومة ⚠️  (مش replica set)');

  const existing = (await conn.db.listCollections().toArray()).map((c) => c.name);
  let total = 0;
  const lines = [];
  for (const c of COLLECTIONS) {
    const n = existing.includes(c) ? await conn.db.collection(c).countDocuments() : 0;
    total += n;
    lines.push('  ' + c.padEnd(16) + n);
  }

  console.log('\nالمحتوى:');
  console.log(lines.join('\n'));

  console.log(
    total === 0
      ? '\nالقاعدة فاضية — تقدر تشغّل: npm run seed'
      : `\n⚠️  القاعدة فيها ${total} سجل بالفعل.\n   "npm run seed" هيتوقّف لوحده ومايكتبش حاجة.\n   "npm run seed:reset" هيمسح كل ده — استخدمه بحرص.`
  );
} catch (e) {
  console.error('فشل الاتصال:', e.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
