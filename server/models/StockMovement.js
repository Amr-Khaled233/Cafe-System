import mongoose from 'mongoose';

/**
 * حركة مخزون واحدة. دي مصدر الحقيقة الوحيد لأي تغيير في رصيد أي خامة.
 * qty: موجب = دخول، سالب = خروج.
 * balanceAfter: الرصيد بعد الحركة — بيخلي إعادة بناء رصيد أي لحظة ممكنة.
 * unitCost: تكلفة الوحدة وقت الحركة (متجمّدة) — تغيير تكلفة الخامة بعدين مايغيّرش القديم.
 */
const StockMovementSchema = new mongoose.Schema({
  ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  type: {
    type: String,
    enum: ['purchase', 'sale', 'waste', 'adjustment', 'stocktake', 'return'],
    required: true,
  },
  qty: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  refType: { type: String, enum: ['order', 'stocktake', 'manual'], default: 'manual' },
  refId: { type: mongoose.Schema.Types.ObjectId, default: null },
  unitCost: { type: Number, default: 0 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  note: { type: String, default: '' },
  at: { type: Date, default: Date.now },
});

StockMovementSchema.index({ ingredientId: 1, at: -1 });
StockMovementSchema.index({ at: -1 });
StockMovementSchema.index({ type: 1, at: -1 });
StockMovementSchema.index({ refType: 1, refId: 1 });

export default mongoose.models.StockMovement || mongoose.model('StockMovement', StockMovementSchema);
