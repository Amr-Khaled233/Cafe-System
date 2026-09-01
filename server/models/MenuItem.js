import mongoose from 'mongoose';

// سطر في الوصفة: خامة + الكمية اللي بياخدها الصنف الواحد بوحدة أساس الخامة
const RecipeLineSchema = new mongoose.Schema(
  {
    ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
    qty: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const MenuItemSchema = new mongoose.Schema(
  {
    nameAr: { type: String, required: true, trim: true },
    nameEn: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    available: { type: Boolean, default: true },
    recipe: { type: [RecipeLineSchema], default: [] },
    trackStock: { type: Boolean, default: true },
  },
  { timestamps: true }
);

MenuItemSchema.index({ categoryId: 1, available: 1 });

export default mongoose.models.MenuItem || mongoose.model('MenuItem', MenuItemSchema);
