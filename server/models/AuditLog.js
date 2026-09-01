import mongoose from 'mongoose';

// سجل كل عملية حسّاسة: مين عمل إيه، والقيمة قبل وبعد
const AuditLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  action: { type: String, required: true },
  entity: { type: String, required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
  at: { type: Date, default: Date.now },
});

AuditLogSchema.index({ at: -1 });
AuditLogSchema.index({ action: 1, at: -1 });
AuditLogSchema.index({ userId: 1, at: -1 });

export default mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
