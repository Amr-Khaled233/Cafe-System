import mongoose from 'mongoose';

// تصنيف المنيو (مشروبات ساخنة / باردة / مأكولات...)
const CategorySchema = new mongoose.Schema(
  {
    nameAr: { type: String, required: true, trim: true },
    nameEn: { type: String, required: true, trim: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

CategorySchema.index({ sortOrder: 1 });

export default mongoose.models.Category || mongoose.model('Category', CategorySchema);
