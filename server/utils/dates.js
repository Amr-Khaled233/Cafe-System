export const TZ = process.env.TZ_NAME || 'Africa/Cairo';

/** الفرق بين التوقيت المحلي للمنطقة والـ UTC عند لحظة معيّنة (بالملي ثانية) */
function tzOffsetMs(date, tz = TZ) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = dtf.formatToParts(date).reduce((a, x) => ((a[x.type] = x.value), a), {});
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  // بنقرّب لأقرب دقيقة عشان الملي ثانية بتاعة اللحظة الحالية ماتتسربش لبداية اليوم
  return Math.round((asUTC - date.getTime()) / 60000) * 60000;
}

/** بداية اليوم بتوقيت الكافيه، راجعة كـ Date بالـ UTC */
export function startOfDay(d, tz = TZ) {
  const base = new Date(d);
  const off = tzOffsetMs(base, tz);
  const shifted = new Date(base.getTime() + off);
  shifted.setUTCHours(0, 0, 0, 0);
  let utc = new Date(shifted.getTime() - off);
  // تصحيح لو التوقيت الصيفي غيّر الفرق عند بداية اليوم نفسه
  const off2 = tzOffsetMs(utc, tz);
  if (off2 !== off) utc = new Date(shifted.getTime() - off2);
  return utc;
}

export const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000);
export const endOfDay = (d, tz = TZ) => new Date(startOfDay(addDays(d, 1), tz).getTime() - 1);

/**
 * بيحوّل الفلاتر الجاية من الـ URL لفترة حقيقية.
 * range = today | yesterday | last7 | last30 | thisMonth | custom
 * لو مفيش range، بيستخدم from/to لو موجودين.
 */
/** تاريخ صالح أو null — الـ query string ممكن يوصل كـ object أو نص بايظ */
function safeDate(v) {
  if (typeof v !== 'string' && typeof v !== 'number' && !(v instanceof Date)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function resolveRange(query = {}, tz = TZ) {
  const now = new Date();
  const today = startOfDay(now, tz);
  const range = query.range || (query.from || query.to ? 'custom' : null);

  switch (range) {
    case 'today':
      return { from: today, to: endOfDay(now, tz), range };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: y, to: new Date(today.getTime() - 1), range };
    }
    case 'last7':
      return { from: addDays(today, -6), to: endOfDay(now, tz), range };
    case 'last30':
      return { from: addDays(today, -29), to: endOfDay(now, tz), range };
    case 'thisMonth': {
      const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit' })
        .formatToParts(now)
        .reduce((a, x) => ((a[x.type] = x.value), a), {});
      const first = startOfDay(new Date(Date.UTC(+p.year, +p.month - 1, 1, 12)), tz);
      return { from: first, to: endOfDay(now, tz), range };
    }
    case 'custom': {
      const f = safeDate(query.from);
      const t = safeDate(query.to);
      const from = f ? startOfDay(f, tz) : null;
      const to = t ? endOfDay(t, tz) : null;
      // فترة مقلوبة مالهاش معنى — بنتجاهلها بدل ما نرجّع نتايج فاضية بلا سبب
      if (from && to && from > to) return { from: null, to: null, range: null };
      return { from, to, range: 'custom' };
    }
    default:
      return { from: null, to: null, range: null };
  }
}

/** الفترة السابقة بنفس الطول — عشان كارت المقارنة (سهم + نسبة) */
export function previousRange(from, to) {
  if (!from || !to) return { from: null, to: null };
  const a = new Date(from);
  const b = new Date(to);
  const len = b.getTime() - a.getTime();
  return { from: new Date(a.getTime() - len - 1), to: new Date(a.getTime() - 1) };
}

/** granularity الافتراضية: بالساعة لو الفترة يوم أو أقل، بالأيام لو أطول */
export function autoGranularity(from, to) {
  if (!from || !to) return 'day';
  return to.getTime() - from.getTime() <= 36 * 3600 * 1000 ? 'hour' : 'day';
}
