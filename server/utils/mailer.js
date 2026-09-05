import nodemailer from 'nodemailer';

/**
 * إرسال الإيميلات عن طريق Gmail (أو أي SMTP تاني).
 *
 * ⚠️ جيميل مابيقبلش باسورد الحساب العادي من 2022 — لازم «App Password»:
 * فعّل التحقق بخطوتين على الحساب، وبعدين
 * myaccount.google.com/apppasswords وولّد باسورد 16 حرف وحطه في
 * SMTP_PASS. تفاصيل أكتر في الـ README.
 */
let cached = null;

export function isEmailConfigured() {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function transport() {
  if (cached) return cached;
  if (!isEmailConfigured()) return null;

  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    // 465 = SSL مباشر، 587 = STARTTLS
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return cached;
}

/** بيتأكد إن بيانات الـ SMTP شغالة فعلاً — بيستخدم في شاشة الإعدادات */
export async function verifyEmail() {
  const t = transport();
  if (!t) return { ok: false, reason: 'NOT_CONFIGURED' };
  try {
    await t.verify();
    return { ok: true, from: process.env.SMTP_FROM || process.env.SMTP_USER };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

export async function sendMail({ to, subject, text, html }) {
  const t = transport();
  if (!t) throw new Error('EMAIL_NOT_CONFIGURED');

  return t.sendMail({
    from: process.env.SMTP_FROM || `"${process.env.APP_NAME || 'Cafe System'}" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html,
  });
}

/** بيهرب النص قبل ما يتحط في HTML — الاسم بييجي من قاعدة البيانات */
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * رسالة إعادة تعيين الباسورد — بالعربي والإنجليزي في نفس الإيميل،
 * عشان ماناخدش قرار باللغة نيابة عن الموظف.
 */
export function resetPasswordEmail({ name, link, minutes }) {
  const subject = 'إعادة تعيين الباسورد · Reset your password';

  const text = [
    `أهلاً ${name}،`,
    '',
    'وصلنا طلب لإعادة تعيين باسورد حسابك في نظام الكافيه.',
    `افتح الرابط ده عشان تحط باسورد جديد (صالح ${minutes} دقيقة):`,
    link,
    '',
    'لو مش انت اللي طلبت، تجاهل الرسالة دي وباسوردك هيفضل زي ما هو.',
    '',
    '—',
    '',
    `Hi ${name},`,
    '',
    'We received a request to reset your Cafe System password.',
    `Open this link to set a new one (valid for ${minutes} minutes):`,
    link,
    '',
    'If you did not request this, ignore this email — your password stays unchanged.',
  ].join('\n');

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
  <body style="margin:0;padding:24px;background:#f5f6f8;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e3e6eb;border-radius:14px;overflow:hidden;">
      <div style="padding:20px 24px;border-bottom:1px solid #eef0f4;">
        <h1 style="margin:0;font-size:18px;color:#111;">نظام الكافيه</h1>
      </div>

      <div style="padding:24px;color:#222;line-height:1.9;">
        <p style="margin:0 0 12px;">أهلاً ${esc(name)}،</p>
        <p style="margin:0 0 18px;">
          وصلنا طلب لإعادة تعيين باسورد حسابك. اضغط الزرار ده عشان تحط باسورد جديد.
          الرابط صالح <strong>${minutes} دقيقة</strong> وبيشتغل مرة واحدة بس.
        </p>

        <p style="margin:0 0 22px;text-align:center;">
          <a href="${esc(link)}"
             style="display:inline-block;background:#117458;color:#fff;text-decoration:none;
                    padding:13px 26px;border-radius:10px;font-weight:700;font-size:15px;">
            تعيين باسورد جديد
          </a>
        </p>

        <p style="margin:0 0 8px;font-size:12px;color:#6e7684;">
          لو الزرار مش شغّال، انسخ الرابط ده:
        </p>
        <p style="margin:0 0 20px;font-size:12px;word-break:break-all;" dir="ltr">
          <a href="${esc(link)}" style="color:#117458;">${esc(link)}</a>
        </p>

        <p style="margin:0;padding-top:16px;border-top:1px solid #eef0f4;font-size:13px;color:#6e7684;">
          لو مش انت اللي طلبت ده، تجاهل الرسالة — باسوردك هيفضل زي ما هو.
        </p>
      </div>

      <div style="padding:18px 24px;background:#fafbfc;border-top:1px solid #eef0f4;" dir="ltr">
        <p style="margin:0 0 10px;font-size:13px;color:#333;">
          Hi ${esc(name)}, we received a request to reset your password.
          This link is valid for ${minutes} minutes and works once.
        </p>
        <p style="margin:0;font-size:13px;">
          <a href="${esc(link)}" style="color:#117458;">Set a new password</a>
        </p>
      </div>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}
