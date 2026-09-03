import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useApi } from '../hooks/useApi.js';
import { Modal } from './ui.jsx';

const PRESETS = ['today', 'yesterday', 'last7', 'last30', 'thisMonth'];

/** بيقرا الفلاتر من الـ URL — نفس المصدر اللي الصفحة بتبني منه الريكوست */
export function useFilters() {
  const [params, setParams] = useSearchParams();

  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (value === null || value === undefined || value === '') next.delete(key);
    else next.set(key, String(value));
    // تغيير فلتر بيمسح رقم الصفحة عشان ماتبقاش على صفحة مش موجودة
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const setMany = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === '') next.delete(k);
      else next.set(k, String(v));
    }
    next.delete('page');
    setParams(next, { replace: true });
  };

  const clear = () => setParams({}, { replace: true });

  return { params, get: (k) => params.get(k) || '', set, setMany, clear, query: params.toString() };
}

/**
 * شريط فلاتر واحد مشترك بين كل الشاشات.
 * show بيحدد أي فلاتر تظهر: range · staff · shift · category · item · ingredient ·
 * paymentMethod · status · movementType · table · area · q
 */
export default function FilterBar({ show = ['range'], className = '' }) {
  const { t, name, date } = useI18n();
  const { params, get, set, setMany, clear } = useFilters();
  const [sheetOpen, setSheetOpen] = useState(false);

  const has = (k) => show.includes(k);

  // القوايم بتتحمّل بس لو الفلتر بتاعها ظاهر
  const staff = useApi('/users', [], { skip: !has('staff') });
  const cats = useApi('/categories', [], { skip: !has('category') && !has('item') });
  const menu = useApi('/menu', [], { skip: !has('item') });
  const ings = useApi('/ingredients', [], { skip: !has('ingredient') });
  const tables = useApi('/tables', [], { skip: !has('table') });

  const range = get('range') || (get('from') || get('to') ? 'custom' : '');

  /* ---------- الشرايح (chips) للفلاتر النشطة ---------- */
  const LABELS = {
    range: (v) => `${t('filters.range')}: ${t(`filters.${v}`)}`,
    from: (v) => `${t('filters.from')}: ${date(v, { dateStyle: 'medium' })}`,
    to: (v) => `${t('filters.to')}: ${date(v, { dateStyle: 'medium' })}`,
    userId: (v) => `${t('filters.staff')}: ${staff.data?.find((u) => u._id === v)?.name || v}`,
    categoryId: (v) => `${t('filters.category')}: ${name(cats.data?.find((c) => c._id === v)) || v}`,
    menuItemId: (v) => `${t('filters.item')}: ${name(menu.data?.find((m) => m._id === v)) || v}`,
    ingredientId: (v) => `${t('filters.ingredient')}: ${name(ings.data?.find((i) => i._id === v)) || v}`,
    paymentMethod: (v) => `${t('filters.paymentMethod')}: ${t(`paymentMethods.${v}`)}`,
    status: (v) => `${t('filters.status')}: ${t(`orderStatus.${v}`)}`,
    type: (v) => `${t('filters.movementType')}: ${t(`movementTypes.${v}`)}`,
    tableId: (v) => `${t('filters.table')}: ${tables.data?.find((x) => x._id === v)?.number || v}`,
    q: (v) => `${t('filters.q')}: ${v}`,
    days: (v) => `${t('filters.days')}: ${v}`,
    sort: (v) => `${t('filters.sort')}: ${t(`reports.${v === 'qty' ? 'qtySold' : v === 'revenue' ? 'itemSales' : 'grossProfit'}`)}`,
  };

  const active = [...params.entries()].filter(([k]) => k !== 'page' && LABELS[k]);

  /* ---------- عناصر الفلترة نفسها ---------- */
  const controls = (
    <div className="flex flex-col gap-3">
      {has('range') && (
        <div>
          <span className="label">{t('filters.range')}</span>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setMany({ range: p, from: null, to: null })}
                className={`btn-sm shrink-0 rounded-full font-semibold ${
                  range === p ? 'bg-accent text-white' : 'border border-line bg-surface text-text'
                }`}
              >
                {t(`filters.${p}`)}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <span className="label">{t('filters.from')}</span>
              <input
                type="date"
                className="field"
                value={get('from')}
                onChange={(e) => setMany({ from: e.target.value, range: 'custom' })}
              />
            </div>
            <div>
              <span className="label">{t('filters.to')}</span>
              <input
                type="date"
                className="field"
                value={get('to')}
                onChange={(e) => setMany({ to: e.target.value, range: 'custom' })}
              />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {has('staff') && (
          <Select label={t('filters.staff')} value={get('userId')} onChange={(v) => set('userId', v)}>
            {(staff.data || []).map((u) => (
              <option key={u._id} value={u._id}>
                {u.name}
              </option>
            ))}
          </Select>
        )}

        {has('category') && (
          <Select label={t('filters.category')} value={get('categoryId')} onChange={(v) => set('categoryId', v)}>
            {(cats.data || []).map((c) => (
              <option key={c._id} value={c._id}>
                {name(c)}
              </option>
            ))}
          </Select>
        )}

        {has('item') && (
          <Select label={t('filters.item')} value={get('menuItemId')} onChange={(v) => set('menuItemId', v)}>
            {(menu.data || []).map((m) => (
              <option key={m._id} value={m._id}>
                {name(m)}
              </option>
            ))}
          </Select>
        )}

        {has('ingredient') && (
          <Select label={t('filters.ingredient')} value={get('ingredientId')} onChange={(v) => set('ingredientId', v)}>
            {(ings.data || []).map((i) => (
              <option key={i._id} value={i._id}>
                {name(i)}
              </option>
            ))}
          </Select>
        )}

        {has('paymentMethod') && (
          <Select
            label={t('filters.paymentMethod')}
            value={get('paymentMethod')}
            onChange={(v) => set('paymentMethod', v)}
          >
            {['cash', 'card', 'wallet'].map((m) => (
              <option key={m} value={m}>
                {t(`paymentMethods.${m}`)}
              </option>
            ))}
          </Select>
        )}

        {has('status') && (
          <Select label={t('filters.status')} value={get('status')} onChange={(v) => set('status', v)}>
            {['open', 'paid', 'void'].map((s) => (
              <option key={s} value={s}>
                {t(`orderStatus.${s}`)}
              </option>
            ))}
          </Select>
        )}

        {has('movementType') && (
          <Select label={t('filters.movementType')} value={get('type')} onChange={(v) => set('type', v)}>
            {['purchase', 'sale', 'waste', 'adjustment', 'stocktake', 'return'].map((m) => (
              <option key={m} value={m}>
                {t(`movementTypes.${m}`)}
              </option>
            ))}
          </Select>
        )}

        {has('table') && (
          <Select label={t('filters.table')} value={get('tableId')} onChange={(v) => set('tableId', v)}>
            {(tables.data || []).map((x) => (
              <option key={x._id} value={x._id}>
                {t('tables.table')} {x.number}
              </option>
            ))}
          </Select>
        )}

        {has('q') && (
          <div>
            <span className="label">{t('filters.q')}</span>
            <SearchInput value={get('q')} onChange={(v) => set('q', v)} placeholder={t('common.searchPlaceholder')} />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* على الموبايل الفلاتر في bottom sheet، وعلى الشاشات الأكبر ظاهرة على طول */}
      <div className="sm:hidden">
        <button type="button" className="btn-ghost w-full" onClick={() => setSheetOpen(true)}>
          {t('filters.title')}
          {active.length > 0 && <span className="chip bg-accent text-white">{active.length}</span>}
        </button>
        <Modal
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={t('filters.title')}
          footer={
            <>
              <button type="button" className="btn-ghost flex-1" onClick={clear}>
                {t('filters.clear')}
              </button>
              <button type="button" className="btn-primary flex-1" onClick={() => setSheetOpen(false)}>
                {t('filters.apply')}
              </button>
            </>
          }
        >
          {controls}
        </Modal>
      </div>

      <div className="hidden sm:block">{controls}</div>

      {/* الفلاتر النشطة كـ chips، كل واحدة بزرار مسح */}
      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {active.map(([k, v]) => (
            <span key={k} className="chip">
              {LABELS[k](v)}
              <button
                type="button"
                className="opacity-60 hover:opacity-100"
                aria-label={t('filters.clearOne')}
                onClick={() => set(k, null)}
              >
                ✕
              </button>
            </span>
          ))}
          <button type="button" className="text-xs font-semibold text-accent underline" onClick={clear}>
            {t('filters.clear')}
          </button>
        </div>
      )}
    </div>
  );
}

function Select({ label, value, onChange, children }) {
  const { t } = useI18n();
  return (
    <div>
      <span className="label">{label}</span>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('common.all')}</option>
        {children}
      </select>
    </div>
  );
}

/** بحث مع تأخير بسيط عشان ما نضربش السيرفر مع كل حرف */
export function SearchInput({ value, onChange, placeholder }) {
  const [local, setLocal] = useState(value || '');

  useEffect(() => setLocal(value || ''), [value]);

  useEffect(() => {
    const id = setTimeout(() => {
      if ((local || '') !== (value || '')) onChange(local);
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  return (
    <input
      type="search"
      className="field"
      value={local}
      placeholder={placeholder}
      onChange={(e) => setLocal(e.target.value)}
    />
  );
}
