import mongoose from 'mongoose';

// سطر جرد لخامة واحدة على الفترة المحددة
const StocktakeLineSchema = new mongoose.Schema(
  {
    ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
    openingQty: { type: Number, default: 0 },
    purchasedQty: { type: Number, default: 0 },
    consumedQty: { type: Number, default: 0 },
    wasteQty: { type: Number, default: 0 },
    adjustedQty: { type: Number, default: 0 },
    returnedQty: { type: Number, default: 0 },
    expectedQty: { type: Number, default: 0 },
    countedQty: { type: Number, default: null },
    diffQty: { type: Number, default: null },
    diffValue: { type: Number, default: null },
    unitCost: { type: Number, default: 0 },
  },
  { _id: false }
);

const StocktakeSchema = new mongoose.Schema(
  {
    from: { type: Date, required: true },
    to: { type: Date, required: true },
    status: { type: String, enum: ['draft', 'closed'], default: 'draft' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    closedAt: { type: Date, default: null },
    lines: { type: [StocktakeLineSchema], default: [] },
    totalDiffValue: { type: Number, default: 0 },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

StocktakeSchema.index({ createdAt: -1 });
StocktakeSchema.index({ status: 1 });

export default mongoose.models.Stocktake || mongoose.model('Stocktake', StocktakeSchema);
