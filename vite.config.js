import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// الواجهة بتتبني static، والـ API بيتنادى على /api
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // في التطوير: أي /api بيتحوّل للسيرفر المحلي عشان الكوكيز تشتغل على نفس الأصل
    proxy: { '/api': { target: 'http://localhost:4100', changeOrigin: true } },
  },
  // نفس الـ proxy لسيرفر المعاينة عشان نقدر نختبر البناء النهائي
  preview: {
    port: 4173,
    proxy: { '/api': { target: 'http://localhost:4100', changeOrigin: true } },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // الرسوم البيانية مكتبة تقيلة وبتتحمّل في شاشات المدير بس
        manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], charts: ['recharts'] },
      },
    },
  },
});
