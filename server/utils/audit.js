import AuditLog from '../models/AuditLog.js';

/**
 * بيسجّل عملية حسّاسة. مابيرميش خطأ لبرّه — فشل التسجيل مايوقّعش العملية الأصلية،
 * بس بيتطبع في اللوج عشان يتاخد بالنا منه.
 */
export async function audit({ userId, action, entity, entityId, before, after }, session) {
  try {
    const doc = [{ userId, action, entity, entityId, before: before ?? null, after: after ?? null, at: new Date() }];
    await AuditLog.create(doc, session ? { session } : undefined);
  } catch (e) {
    console.error('[audit] failed:', action, e.message);
  }
}
