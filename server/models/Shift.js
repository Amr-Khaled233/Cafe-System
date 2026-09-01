import mongoose from 'mongoose';

// شيفت موظف: من فتحه لغاية قفله بعدّ الكاش
const ShiftSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },
    openingCash: { type: Number, default: 0 },
    closingCash: { type: Number, default: null },
    expectedCash: { type: Number, default: null },
    difference: { type: Number, default: null },
  },
  { timestamps: true }
);

ShiftSchema.index({ userId: 1, endedAt: 1 });
ShiftSchema.index({ startedAt: -1 });

export default mongoose.models.Shift || mongoose.model('Shift', ShiftSchema);
