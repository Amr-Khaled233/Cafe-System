import mongoose from 'mongoose';

/**
 * اتصال واحد مُعاد استخدامه.
 * على Vercel الفنكشن بتتنادى كذا مرة على نفس الـ instance — من غير الكاش ده
 * كنا هنفتح اتصال جديد كل ريكوست ونستهلك كل الـ connections بتاعة أطلس.
 */
let cached = globalThis.__mongoose_cache;
if (!cached) cached = globalThis.__mongoose_cache = { conn: null, promise: null };

/**
 * بندوّر على الـ connection string بأكتر من اسم.
 * تكامل MongoDB Atlas من Vercel Marketplace بيحقن MONGODB_URI لوحده،
 * فالمشروع بيشتغل بعد الربط من غير ما تكتب أي متغيّر بإيدك.
 */
export function mongoUri() {
  return (
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.DATABASE_URL ||
    null
  );
}

/**
 * اسم القاعدة اللي هنشتغل عليها.
 *
 * الرابط اللي بييجي من تكامل MongoDB Atlas على Vercel بينتهي بـ "/?" — يعني
 * من غير اسم قاعدة. لو سبناه كده، الدرايفر بيروح على قاعدة اسمها "test"،
 * والـ seed اللي شغّلته بإيدك على قاعدة تانية مايبانش في التطبيق.
 * فبنرجع لاسم افتراضي بس لما الرابط ما يحددش واحد.
 */
export function resolveDbName(uri) {
  try {
    // بنشيل البروتوكول عشان URL يعرف يقرا mongodb+srv
    const path = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, 'http://')).pathname;
    const name = path.replace(/^\//, '');
    if (name) return null; // الرابط محدد القاعدة — مانتدخلش
  } catch {
    /* رابط غريب — بنكمّل بالافتراضي */
  }
  return process.env.MONGO_DB || 'cafe';
}

export async function connectDB() {
  if (cached.conn) return cached.conn;

  const uri = mongoUri();
  if (!uri) throw new Error('MONGO_URI is not set. Copy .env.example to .env and fill it in.');

  if (!cached.promise) {
    mongoose.set('strictQuery', true);
    const dbName = resolveDbName(uri);
    cached.promise = mongoose
      .connect(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10000,
        ...(dbName ? { dbName } : {}),
      })
      .then((m) => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

/**
 * هل الاتصال الحالي بيدعم الـ transactions؟
 * الـ transactions محتاجة replica set (أطلس أو mongod --replSet).
 * لو mongod عادي على الجهاز، بنشتغل من غيرها عشان النظام يفضل شغّال محلياً.
 */
export function supportsTransactions() {
  const topology = mongoose.connection?.client?.topology;
  const type = topology?.description?.type;
  return type === 'ReplicaSetWithPrimary' || type === 'Sharded' || type === 'LoadBalanced';
}
