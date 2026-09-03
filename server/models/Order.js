import mongoose from 'mongoose';

/**
 * سطر في الفاتورة.
 * الاسم والسعر متنسوخين وقت الإضافة — تغيير المنيو بعد كده مايأثرش على الفاتورة دي.
 */
const OrderItemSchema = new mongoose.Schema({
  menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
  nameAr: { type: String, required: true },
  nameEn: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  // نوع الصنف وقت الطلب (سادة / مظبوط / زيادة) — الاسم متنسوخ زي السعر
  variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
  variantNameAr: { type: String, default: '' },
  variantNameEn: { type: String, default: '' },
  qty: { type: Number, required: true, min: 1 },
  paidQty: { type: Number, default: 0 },
  stockApplied: { type: Boolean, default: false },
  appliedQty: { type: Number, default: 0 },
  note: { type: String, default: '' },
  // نسخة الوصفة وقت الخصم — الرد بيستخدمها فيرجع نفس الكميات حتى لو الوصفة اتغيّرت بعدين
  appliedRecipe: { type: [{ ingredientId: mongoose.Schema.Types.ObjectId, qty: Number, _id: false }], default: [] },
  // مفتاح الطلب من الواجهة — لو نفس الريكوست اتبعت مرتين، بنرجّع نفس السطر من غير خصم تاني
  clientRequestId: { type: String, default: null },
});

const OrderSchema = new mongoose.Schema(
  {
    // الطاولة الأساسية للفاتورة
    tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'Table', required: true },
    // طاولات اتدمجت على نفس الفاتورة — الحساب بيبقى عليهم كلهم مع بعض
    mergedTableIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Table' }], default: [] },
    // لو الفاتورة دي اتدمجت جوّه فاتورة تانية، بنسجّل فين راحت
    mergedIntoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // merged = اتدمجت في فاتورة تانية، فهي بره المبيعات زي الملغية بالظبط
    status: { type: String, enum: ['open', 'paid', 'void', 'merged'], default: 'open' },
    items: { type: [OrderItemSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    discount: {
      type: { type: String, enum: ['percent', 'amount', null], default: null },
      value: { type: Number, default: 0 },
      byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      reason: { type: String, default: '' },
    },
    total: { type: Number, default: 0 },
    paymentMethod: { type: String, enum: ['cash', 'card', 'wallet', null], default: null },
    voidReason: { type: String, default: '' },
    voidedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

OrderSchema.index({ status: 1, closedAt: -1 });
OrderSchema.index({ shiftId: 1 });
OrderSchema.index({ userId: 1, closedAt: -1 });
OrderSchema.index({ tableId: 1, status: 1 });

/** إعادة حساب الإجماليات — بتتنادى قبل أي حفظ فيه تغيير أصناف أو خصم */
OrderSchema.methods.recalc = function () {
  this.subtotal = this.items.reduce((s, i) => s + i.price * i.qty, 0);
  let d = 0;
  if (this.discount && this.discount.type === 'percent') {
    d = (this.subtotal * (this.discount.value || 0)) / 100;
  } else if (this.discount && this.discount.type === 'amount') {
    d = this.discount.value || 0;
  }
  // الخصم مايزيدش عن قيمة الفاتورة ولا يبقى بالسالب
  d = Math.min(Math.max(d, 0), this.subtotal);
  this.subtotal = Math.round(this.subtotal * 100) / 100;
  this.total = Math.round((this.subtotal - d) * 100) / 100;
  return this;
};

export default mongoose.models.Order || mongoose.model('Order', OrderSchema);
