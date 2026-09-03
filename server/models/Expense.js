import mongoose from 'mongoose';

/**
 * مصروف يومي — إيجار، مرتبات، كهرباء، صيانة...
 * ده مصروف تشغيلي، مختلف عن شراء الخامات (اللي بيتسجّل كحركة مخزون)،
 * عشان صافي الربح يطلع صح: الإيراد − تكلفة الخامات − المصروفات.
 */
const ExpenseSchema = new mongoose.Schema(
  {
    // تاريخ المصروف نفسه (مش وقت التسجيل) — التقارير بتشتغل عليه
    at: { type: Date, required: true },
    category: {
      type: String,
      enum: ['rent', 'salaries', 'utilities', 'supplies', 'maintenance', 'marketing', 'transport', 'other'],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    note: { type: String, default: '', trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

ExpenseSchema.index({ at: -1 });
ExpenseSchema.index({ category: 1, at: -1 });

export default mongoose.models.Expense || mongoose.model('Expense', ExpenseSchema);
