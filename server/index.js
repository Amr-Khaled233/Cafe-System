import 'dotenv/config';
import { createApp } from './app.js';
import { connectDB, supportsTransactions } from './db.js';

const port = Number(process.env.PORT || 4100);
const app = createApp();

// بنتصل الأول عشان نعرف نقول للمطوّر لو الـ transactions مش متاحة
try {
  await connectDB();
  console.log('[db] connected');
  if (!supportsTransactions()) {
    console.warn(
      '[db] mongod عادي مش replica set — الـ transactions متعطّلة والعمليات هتتنفّذ من غيرها.\n' +
        '     للتطوير ده تمام. للإنتاج استخدم MongoDB Atlas عشان الخصم والفاتورة يبقوا ذرّة واحدة.'
    );
  }
} catch (e) {
  console.error('[db] connection failed:', e.message);
}

app.listen(port, () => console.log(`[api] http://localhost:${port}`));
