import mongoose from 'mongoose';

/**
 * مين كان شغّال في الشيفت.
 * الاسم والوظيفة متنسوخين وقت الفتح — عشان لو العامل اتشال أو اتغيّر اسمه
 * بعدين، الشيفتات القديمة تفضل مفهومة زي ما كانت.
 */
const ShiftWorkerSchema = new mongoose.Schema(
  {
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true },
    name: { type: String, required: true },
    jobTitle: { type: String, default: 'barista' },
  },
  { _id: false }
);

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
    // العمّال اللي كانوا بيعملوا المشاريب في الشيفت ده
    workers: { type: [ShiftWorkerSchema], default: [] },
  },
  { timestamps: true }
);

ShiftSchema.index({ userId: 1, endedAt: 1 });
ShiftSchema.index({ startedAt: -1 });

export default mongoose.models.Shift || mongoose.model('Shift', ShiftSchema);
