/**
 * كل خطأ بيرجع { error, code } — الواجهة بتترجم الـ code، مش بتعرض نص السيرفر.
 */
export class AppError extends Error {
  constructor(code, status = 400, message = code) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export const fail = (res, code, status = 400, error = code) => res.status(status).json({ error, code });

/** بتلف أي handler async عشان أي throw يوصل للـ error handler من غير try/catch مكرر */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** الـ error handler الأخير في السلسلة */
export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) return res.status(err.status).json({ error: err.message, code: err.code });

  // أخطاء body-parser: جسم أكبر من الحد، أو JSON بايظ.
  // بترمي status بتاعها، فمن غير التعامل ده كانت بترجع 500 مبهم.
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large', code: 'PAYLOAD_TOO_LARGE' });
  }
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Invalid JSON body', code: 'INVALID_JSON' });
  }

  // أخطاء التحقق من mongoose
  if (err?.name === 'ValidationError') {
    return res.status(400).json({ error: err.message, code: 'VALIDATION_ERROR' });
  }
  // مفتاح مكرر (username / رقم طاولة)
  if (err?.code === 11000) {
    return res.status(409).json({ error: 'Duplicate key', code: 'DUPLICATE' });
  }
  if (err?.name === 'CastError') {
    return res.status(400).json({ error: 'Bad id', code: 'BAD_ID' });
  }

  console.error('[api]', err);
  return res.status(500).json({ error: 'Server error', code: 'SERVER_ERROR' });
}
