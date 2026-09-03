import mongoose from 'mongoose';

/**
 * طاولة في الصالة — رقم وكراسي وبس.
 * الحالة بتتظبط تلقائياً مع فتح وقفل الفاتورة.
 * الطاولة مابتتمسحش لو اشتغلت عليها فواتير — بتتعطّل، عشان التقارير القديمة تفضل مفهومة.
 */
const TableSchema = new mongoose.Schema(
  {
    number: { type: Number, required: true, unique: true },
    name: { type: String, default: '' },
    seats: { type: Number, default: 4 },
    status: { type: String, enum: ['free', 'busy'], default: 'free' },
    active: { type: Boolean, default: true },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

TableSchema.index({ active: 1, number: 1 });

export default mongoose.models.Table || mongoose.model('Table', TableSchema);
