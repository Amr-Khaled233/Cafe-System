import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import ar from './ar.js';
import en from './en.js';

const DICTS = { ar, en };
const I18nContext = createContext(null);

const CURRENCY = import.meta.env.VITE_CURRENCY || 'EGP';

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'ar');
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    // الاختيار بيتحفظ وبيترجع بعد الريفرش، والصفحة بتنقلب من غير reload
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const value = useMemo(() => {
    // t('inventory.low') → بيدوّر جوّه القاموس بالنقط
    const t = (key, vars) => {
      const text = String(key)
        .split('.')
        .reduce((o, k) => (o == null ? undefined : o[k]), DICTS[lang]);
      const out = text ?? key;
      return vars ? String(out).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '') : out;
    };

    // اسم الخامة/الصنف حسب اللغة، مع رجوع للاسم التاني لو ناقص
    const name = (doc) =>
      (lang === 'ar' ? doc?.nameAr : doc?.nameEn) || doc?.nameAr || doc?.nameEn || '';

    // أرقام لاتينية في اللغتين — أسهل في القراءة على شاشة كاشير
    const locale = lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB';

    const num = (n, o) => new Intl.NumberFormat(locale, o).format(Number(n) || 0);

    const money = (n) =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: CURRENCY,
        maximumFractionDigits: 0,
      }).format(Number(n) || 0);

    const money2 = (n) =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: CURRENCY,
        maximumFractionDigits: 2,
      }).format(Number(n) || 0);

    const qty = (n, unit) =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(n) || 0) +
      (unit ? ' ' + t('units.' + unit) : '');

    const date = (d, o = { dateStyle: 'medium', timeStyle: 'short' }) =>
      d ? new Intl.DateTimeFormat(locale, o).format(new Date(d)) : '';

    const pct = (n) =>
      new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Number(n) || 0) + '%';

    /** مدة بالدقايق → نص مقروء */
    const duration = (minutes) => {
      const m = Math.max(0, Math.round(Number(minutes) || 0));
      const h = Math.floor(m / 60);
      return h > 0 ? `${num(h)}:${String(m % 60).padStart(2, '0')}` : `${num(m)} ${t('common.minutes')}`;
    };

    /** بيترجم كود الخطأ الجاي من السيرفر — مفيش نص جاهز بييجي من السيرفر */
    const errorText = (err) => {
      const code = err?.code || 'SERVER_ERROR';
      const vars = err?.details
        ? { names: err.details.map((d) => (lang === 'ar' ? d.nameAr : d.nameEn)).join(t('common.listSeparator')) }
        : undefined;
      const msg = t('errors.' + code, vars);
      return msg === 'errors.' + code ? t('errors.SERVER_ERROR') : msg;
    };

    return { lang, setLang, dir, t, name, num, money, money2, qty, date, pct, duration, errorText, locale };
  }, [lang, dir]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
