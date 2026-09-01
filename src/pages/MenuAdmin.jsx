import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useApi, useAction } from '../hooks/useApi.js';
import { api, qs } from '../api/client.js';
import { useFilters, SearchInput } from '../components/FilterBar.jsx';
import { PageHeader } from '../components/Layout.jsx';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  InlineError,
  Modal,
  SkeletonTable,
  useToast,
} from '../components/ui.jsx';

export default function MenuAdmin() {
  const { t, name, money } = useI18n();
  const { get, set } = useFilters();
  const { push } = useToast();
  const { run, busy, error: actionError, clearError } = useAction();

  const q = get('q');
  const categoryId = get('categoryId');

  const cats = useApi('/categories');
  const menu = useApi(`/menu${qs({ q, categoryId })}`, [q, categoryId]);

  const [itemDialog, setItemDialog] = useState(null); // null | {} | item
  const [catDialog, setCatDialog] = useState(null);
  const [disableFor, setDisableFor] = useState(null);

  const catById = Object.fromEntries((cats.data || []).map((c) => [c._id, c]));

  return (
    <div className="space-y-4">
      <PageHeader title={t('menuAdmin.title')} subtitle={t('menuAdmin.priceChangeNote')}>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setCatDialog({})}>
          {t('menuAdmin.addCategory')}
        </button>
        <button type="button" className="btn-primary btn-sm" onClick={() => setItemDialog({})}>
          {t('menuAdmin.addItem')}
        </button>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        <div className="min-w-[180px] flex-1">
          <SearchInput value={q} onChange={(v) => set('q', v)} placeholder={t('common.searchPlaceholder')} />
        </div>
        <select className="field w-auto" value={categoryId} onChange={(e) => set('categoryId', e.target.value)}>
          <option value="">{t('common.all')}</option>
          {(cats.data || []).map((c) => (
            <option key={c._id} value={c._id}>
              {name(c)}
            </option>
          ))}
        </select>
      </div>

      <InlineError error={actionError} />

      <div className="card">
        {menu.loading && <SkeletonTable rows={8} cols={5} />}
        {menu.error && <ErrorState error={menu.error} onRetry={menu.reload} />}
        {!menu.loading && menu.data?.length === 0 && <EmptyState icon="☰" />}

        {!menu.loading && menu.data?.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="sticky-col">{t('common.item')}</th>
                  <th>{t('common.category')}</th>
                  <th>{t('common.price')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('recipes.lines')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {menu.data.map((m) => (
                  <tr key={m._id} className={m.available ? '' : 'opacity-60'}>
                    <td className="sticky-col font-semibold">{name(m)}</td>
                    <td className="text-muted">{name(catById[m.categoryId])}</td>
                    <td className="tabular-nums">{money(m.price)}</td>
                    <td>
                      <span className={m.available ? 'badge-ok' : 'badge-out'}>
                        {t(m.available ? 'menuAdmin.available' : 'menuAdmin.unavailable')}
                      </span>
                    </td>
                    <td className="tabular-nums text-muted">{m.recipe?.length || 0}</td>
                    <td>
                      <div className="flex gap-1">
                        <button type="button" className="btn-ghost btn-sm" onClick={() => setItemDialog(m)}>
                          {t('common.edit')}
                        </button>
                        <Link className="btn-ghost btn-sm" to="/recipes">
                          {t('menuAdmin.editRecipe')}
                        </Link>
                        {m.available && (
                          <button
                            type="button"
                            className="btn-ghost btn-sm text-bad"
                            onClick={() => setDisableFor(m)}
                          >
                            {t('menuAdmin.unavailable')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------- التصنيفات ---------- */}
      <div className="card">
        <h2 className="mb-3 text-sm font-bold">{t('menuAdmin.categories')}</h2>
        <div className="flex flex-wrap gap-2">
          {(cats.data || []).map((c) => (
            <button key={c._id} type="button" className="chip" onClick={() => setCatDialog(c)}>
              {name(c)}
            </button>
          ))}
        </div>
      </div>

      <ItemDialog
        item={itemDialog}
        categories={cats.data || []}
        busy={busy}
        error={actionError}
        onClose={() => {
          setItemDialog(null);
          clearError();
        }}
        onSubmit={async (body) => {
          try {
            if (itemDialog?._id) await run(() => api.patch(`/menu/${itemDialog._id}`, body));
            else await run(() => api.post('/menu', body));
            push({ message: t('common.saved') });
            setItemDialog(null);
            menu.reload();
          } catch {
            /* معروض في النافذة */
          }
        }}
      />

      <CategoryDialog
        category={catDialog}
        busy={busy}
        error={actionError}
        onClose={() => {
          setCatDialog(null);
          clearError();
        }}
        onSubmit={async (body) => {
          try {
            if (catDialog?._id) await run(() => api.patch(`/categories/${catDialog._id}`, body));
            else await run(() => api.post('/categories', body));
            push({ message: t('common.saved') });
            setCatDialog(null);
            cats.reload();
          } catch {
            /* معروض في النافذة */
          }
        }}
      />

      <ConfirmDialog
        open={!!disableFor}
        message={t('menuAdmin.disableConfirm', { name: disableFor ? name(disableFor) : '' })}
        busy={busy}
        onCancel={() => setDisableFor(null)}
        onConfirm={async () => {
          try {
            await run(() => api.del(`/menu/${disableFor._id}`));
            setDisableFor(null);
            menu.reload();
          } catch {
            setDisableFor(null);
          }
        }}
      />
    </div>
  );
}

function ItemDialog({ item, categories, busy, error, onClose, onSubmit }) {
  const { t } = useI18n();
  const [form, setForm] = useState(null);

  // بنجهّز الفورم أول ما النافذة تتفتح
  if (item && !form) {
    setForm({
      nameAr: item.nameAr || '',
      nameEn: item.nameEn || '',
      price: item.price ?? '',
      categoryId: item.categoryId || categories[0]?._id || '',
      available: item.available !== false,
      trackStock: item.trackStock !== false,
    });
  }
  if (!item && form) setForm(null);
  if (!item || !form) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal
      open
      onClose={onClose}
      title={item._id ? t('common.edit') : t('menuAdmin.addItem')}
      footer={
        <>
          <button type="button" className="btn-ghost flex-1" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={busy || !form.nameAr || !form.nameEn || form.price === ''}
            onClick={() => onSubmit({ ...form, price: Number(form.price) })}
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="mna">
              {t('common.nameAr')}
            </label>
            <input id="mna" className="field" value={form.nameAr} onChange={(e) => set('nameAr', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="mne">
              {t('common.nameEn')}
            </label>
            <input id="mne" className="field" value={form.nameEn} onChange={(e) => set('nameEn', e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="mp">
              {t('common.price')}
            </label>
            <input
              id="mp"
              type="number"
              inputMode="decimal"
              className="field tabular-nums"
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="mc">
              {t('common.category')}
            </label>
            <select id="mc" className="field" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.nameAr}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.available} onChange={(e) => set('available', e.target.checked)} />
          {t('menuAdmin.available')}
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.trackStock} onChange={(e) => set('trackStock', e.target.checked)} />
          {t('recipes.trackStock')}
        </label>

        <p className="text-xs text-muted">{t('menuAdmin.priceChangeNote')}</p>
        <InlineError error={error} />
      </div>
    </Modal>
  );
}

function CategoryDialog({ category, busy, error, onClose, onSubmit }) {
  const { t } = useI18n();
  const [form, setForm] = useState(null);

  if (category && !form) {
    setForm({ nameAr: category.nameAr || '', nameEn: category.nameEn || '', sortOrder: category.sortOrder ?? 0 });
  }
  if (!category && form) setForm(null);
  if (!category || !form) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal
      open
      onClose={onClose}
      title={category._id ? t('common.edit') : t('menuAdmin.addCategory')}
      footer={
        <>
          <button type="button" className="btn-ghost flex-1" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={busy || !form.nameAr || !form.nameEn}
            onClick={() => onSubmit({ ...form, sortOrder: Number(form.sortOrder) || 0 })}
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="cna">
            {t('common.nameAr')}
          </label>
          <input id="cna" className="field" value={form.nameAr} onChange={(e) => set('nameAr', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="cne">
            {t('common.nameEn')}
          </label>
          <input id="cne" className="field" value={form.nameEn} onChange={(e) => set('nameEn', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="cso">
            {t('menuAdmin.sortOrder')}
          </label>
          <input
            id="cso"
            type="number"
            className="field tabular-nums"
            value={form.sortOrder}
            onChange={(e) => set('sortOrder', e.target.value)}
          />
        </div>
        <InlineError error={error} />
      </div>
    </Modal>
  );
}
