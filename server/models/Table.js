import mongoose from 'mongoose';

// طاولة في الصالة. status بيتظبط تلقائياً مع فتح وقفل الفاتورة.
const TableSchema = new mongoose.Schema(
  {
    number: { type: Number, required: true, unique: true },
    name: { type: String, default: '' },
    area: { type: String, default: 'indoor' },
    seats: { type: Number, default: 4 },
    status: { type: String, enum: ['free', 'busy'], default: 'free' },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

TableSchema.index({ area: 1, number: 1 });

export default mongoose.models.Table || mongoose.model('Table', TableSchema);
