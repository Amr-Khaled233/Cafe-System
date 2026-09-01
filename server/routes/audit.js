import { Router } from 'express';
import AuditLog from '../models/AuditLog.js';
import { managerOnly } from '../middleware/auth.js';
import { wrap } from '../utils/errors.js';
import { oid, rx } from '../filters.js';
import { resolveRange } from '../utils/dates.js';
import { sendCSV } from '../utils/csv.js';

const router = Router();
router.use(managerOnly); // 🔒 سجل العمليات للمدير بس

function buildFilter(query) {
  const f = {};
  const { from, to } = resolveRange(query);
  if (from || to) {
    f.at = {};
    if (from) f.at.$gte = from;
    if (to) f.at.$lte = to;
  }
  if (oid(query.userId)) f.userId = oid(query.userId);
  if (query.action) f.action = rx(query.action);
  if (query.entity) f.entity = query.entity;
  return f;
}

/** GET /api/audit ?<فلاتر> */
router.get(
  '/',
  wrap(async (req, res) => {
    const f = buildFilter(req.query);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const page = Math.max(Number(req.query.page) || 1, 1);

    const [rows, total] = await Promise.all([
      AuditLog.find(f)
        .sort({ at: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'name role')
        .lean(),
      AuditLog.countDocuments(f),
    ]);

    res.json({ rows, total, page, limit, pages: Math.ceil(total / limit) });
  })
);

/** GET /api/audit/actions — قائمة الأنواع الموجودة، للفلتر */
router.get(
  '/actions',
  wrap(async (req, res) => res.json(await AuditLog.distinct('action')))
);

/** GET /api/audit/export.csv */
router.get(
  '/export.csv',
  wrap(async (req, res) => {
    const rows = await AuditLog.find(buildFilter(req.query))
      .sort({ at: -1 })
      .limit(5000)
      .populate('userId', 'name')
      .lean();

    sendCSV(res, 'audit-log.csv', rows, [
      { key: 'at', label: 'Date', get: (r) => new Date(r.at).toISOString() },
      { key: 'user', label: 'User', get: (r) => r.userId?.name || '' },
      { key: 'action', label: 'Action' },
      { key: 'entity', label: 'Entity' },
      { key: 'entityId', label: 'Entity id' },
      { key: 'before', label: 'Before', get: (r) => JSON.stringify(r.before ?? '') },
      { key: 'after', label: 'After', get: (r) => JSON.stringify(r.after ?? '') },
    ]);
  })
);

export default router;
