import mongoose from 'mongoose';

/**
 * خامة (بن، لبن، كوباية...).
 * تنبيه: currentQty مايتعدّلش يدوياً من أي راوت — بيتعدّل حصراً جوّه applyMovement
 * في server/inventory.js عشان كل تغيير يبقى ليه StockMovement مفسّر ليه.
 */
/**
 * مكيال للخامة — زي المعلقة أو الكوب أو الكيس.
 * factor = كام وحدة أساس في المكيال الواحد (معلقة سكر = 5 جم).
 * التخزين والحسابات كلها بتفضل بوحدة الأساس؛ المكيال ده للإدخال والعرض بس،
 * عشان اللي بيكتب الوصفة يقول «معلقة» مش «5 جرام».
 */
const MeasureSchema = new mongoose.Schema({
  nameAr: { type: String, required: true, trim: true },
  nameEn: { type: String, required: true, trim: true },
  factor: { type: Number, required: true, min: 0.000001 },
});

const IngredientSchema = new mongoose.Schema(
  {
    nameAr: { type: String, required: true, trim: true },
    nameEn: { type: String, required: true, trim: true },
    unit: { type: String, enum: ['g', 'ml', 'pc'], required: true },
    currentQty: { type: Number, default: 0 },
    minQty: { type: Number, default: 0 },
    costPerUnit: { type: Number, default: 0, min: 0 },
    // مكاييل اختيارية للإدخال (معلقة / كوب / كيس)
    measures: { type: [MeasureSchema], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

IngredientSchema.index({ active: 1, nameAr: 1 });

// حالة الخامة المشتقّة — بتستخدم في الفرز والتلوين
IngredientSchema.virtual('stockStatus').get(function () {
  if (this.currentQty <= 0) return 'out';
  if (this.currentQty <= this.minQty) return 'low';
  return 'ok';
});
IngredientSchema.set('toJSON', { virtuals: true });
IngredientSchema.set('toObject', { virtuals: true });

export default mongoose.models.Ingredient || mongoose.model('Ingredient', IngredientSchema);
