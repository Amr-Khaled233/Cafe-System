import mongoose from 'mongoose';

/**
 * عامل في الكافيه: باريستا، مطبخ، ويتر...
 * دول مش مستخدمين النظام — مالهمش يوزر ولا باسورد ومابيدخلوش.
 * المدير بيضيفهم، والريسبشن بيحدد مين منهم موجود في الشيفت.
 */
const WorkerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    jobTitle: {
      type: String,
      enum: ['barista', 'kitchen', 'waiter', 'cashier', 'other'],
      default: 'barista',
    },
    phone: { type: String, default: '', trim: true },
    note: { type: String, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

WorkerSchema.index({ active: 1, name: 1 });

export default mongoose.models.Worker || mongoose.model('Worker', WorkerSchema);
