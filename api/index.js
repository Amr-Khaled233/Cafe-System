// مدخل الـ serverless function على Vercel — كل /api/* بيتحوّل هنا
import { createApp } from '../server/app.js';

const app = createApp();
export default app;
