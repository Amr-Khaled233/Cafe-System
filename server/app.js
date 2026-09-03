import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import 'dotenv/config';

import { connectDB, supportsTransactions } from './db.js';
import { assertJwtSecret, authenticate } from './middleware/auth.js';
import { errorHandler } from './utils/errors.js';

import authRoutes from './routes/auth.js';
import tableRoutes from './routes/tables.js';
import categoryRoutes from './routes/categories.js';
import menuRoutes from './routes/menu.js';
import orderRoutes from './routes/orders.js';
import shiftRoutes from './routes/shifts.js';
import ingredientRoutes from './routes/ingredients.js';
import inventoryRoutes from './routes/inventory.js';
import stocktakeRoutes from './routes/stocktakes.js';
import statsRoutes from './routes/stats.js';
import reportRoutes from './routes/reports.js';
import dailyRoutes from './routes/daily.js';
import expenseRoutes from './routes/expenses.js';
import workerRoutes from './routes/workers.js';
import userRoutes from './routes/users.js';
import auditRoutes from './routes/audit.js';

export function createApp() {
  assertJwtSecret(); // بيوقّع بدري لو السر ناقص أو ضعيف بدل ما يفشل وقت أول دخول
  const app = express();

  app.set('trust proxy', 1); // ورا Vercel — عشان الـ rate limit يشوف الـ IP الحقيقي
  app.use(express.json({ limit: '1mb' }));

  // هيدرات أمان أساسية على كل رد من الـ API
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');       // مايخمّنش نوع المحتوى
    res.setHeader('X-Frame-Options', 'DENY');                 // مايتحطّش في iframe (clickjacking)
    res.setHeader('Referrer-Policy', 'same-origin');          // مايسرّبش الروابط لبرّه
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');               // ردود الـ API مش بتتكاش
    res.removeHeader('X-Powered-By');                         // مانعلنش إننا Express
    next();
  });
  app.use(cookieParser());

  // في التطوير الواجهة على بورت تاني، فمحتاجين نسمح بالكوكيز عبر الأصلين
  if (process.env.NODE_ENV !== 'production') {
    app.use(cors({ origin: ['http://localhost:5174', 'http://127.0.0.1:5174'], credentials: true }));
  }

  // أي ريكوست بيتأكد إن الاتصال بقاعدة البيانات جاهز الأول
  app.use(async (req, res, next) => {
    try {
      await connectDB();
      next();
    } catch (e) {
      console.error('[db]', e.message);
      res.status(503).json({ error: 'Database unavailable', code: 'DB_UNAVAILABLE' });
    }
  });

  app.get('/api/health', (req, res) =>
    res.json({ ok: true, transactions: supportsTransactions(), time: new Date().toISOString() })
  );

  // اللوجين بره الحماية — هو اللي بيديك التوكن أصلاً
  app.use('/api/auth', authRoutes);

  // 🔒 من هنا ورايح: لازم تكون مسجّل دخول. صلاحية المدير بتتحط جوّه كل راوتر.
  app.use('/api', authenticate);

  app.use('/api/tables', tableRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/menu', menuRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/shifts', shiftRoutes);
  app.use('/api/ingredients', ingredientRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/stocktakes', stocktakeRoutes);
  app.use('/api/stats', statsRoutes);
  // الأخص قبل الأعم: /reports/daily لازم يتسجّل قبل /reports
  app.use('/api/reports/daily', dailyRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/workers', workerRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/audit', auditRoutes);

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' }));
  app.use(errorHandler);

  return app;
}

export default createApp;
