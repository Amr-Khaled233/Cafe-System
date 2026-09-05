import mongoose from 'mongoose';

// موظف: ريسبشن أو مدير. الباسورد متخزّن hash بـ bcrypt فقط.
const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    // الإيميل اختياري — بس من غيره الموظف مايقدرش يعمل «نسيت الباسورد»
    email: { type: String, default: null, lowercase: true, trim: true },
    /**
     * بيتزوّد مع كل تغيير باسورد أو «خروج من كل الأجهزة».
     * التوكن بيحمل نسخته، فأي جلسة قديمة بتموت فوراً — من غير كده كان لازم
     * تستنى 12 ساعة لحد ما التوكن يخلص.
     */
    tokenVersion: { type: Number, default: 0 },
    // رابط إعادة التعيين: بنخزّن الهاش بس، الأصل بيتبعت في الإيميل ومابيتخزّنش
    resetTokenHash: { type: String, default: null, select: false },
    resetTokenExpiresAt: { type: Date, default: null, select: false },
    lastLoginAt: { type: Date, default: null },
    role: { type: String, enum: ['reception', 'manager'], required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/**
 * الإيميل مايتكررش — بس الحسابات اللي من غير إيميل مالهاش أي قيد.
 * لازم partial مش sparse: الـ sparse بيعتبر null قيمة، فتاني حساب من غير
 * إيميل كان بيترفض بـ duplicate key. الفهرس ده بيشمل النصوص بس.
 */
UserSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } }
);

export default mongoose.models.User || mongoose.model('User', UserSchema);
