import mongoose from 'mongoose';

/**
 * خامة (بن، لبن، كوباية...).
 * تنبيه: currentQty مايتعدّلش يدوياً من أي راوت — بيتعدّل حصراً جوّه applyMovement
 * في server/inventory.js عشان كل تغيير يبقى ليه StockMovement مفسّر ليه.
 */
const IngredientSchema = new mongoose.Schema(
  {
    nameAr: { type: String, required: true, trim: true },
    nameEn: { type: String, required: true, trim: true },
    unit: { type: String, enum: ['g', 'ml', 'pc'], required: true },
    currentQty: { type: Number, default: 0 },
    minQty: { type: Number, default: 0 },
    costPerUnit: { type: Number, default: 0, min: 0 },
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
