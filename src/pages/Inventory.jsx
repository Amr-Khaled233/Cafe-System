import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useApi, useAction } from '../hooks/useApi.js';
import { api, qs } from '../api/client.js';
import { useFilters, SearchInput } from '../components/FilterBar.jsx';
import { PageHeader } from '../components/Layout.jsx';
import {
  EmptyState,
  ErrorState,
  ExportButton,
  InlineError,
  Modal,
  SkeletonCards,
  SkeletonTable,
  StatCard,
  useToast,
} from '../components/ui.jsx';

const STATUS_CLASS = { out: 'badge-out', low: 'badge-low', ok: 'badge-ok' };

export default function Inventory() {
  const { t, name, money, qty, num } = useI18n();
  const { get, set } = useFilters();
  const { push } = useToast();
  const { run, busy, error: actionError, clearError } = useAction();

  const status = get('status');
  const q = get('q');

  const summary = useApi('/inventory/summary');
  const list = useApi(`/ingredients${qs({ status, q })}`, [status, q]);
  const low = useApi(`/inventory/low${qs({ days: get('days') || 7 })}`, [get('days')]);

  const [movementFor, setMovementFor] = useState(null); // { ingredient, type }
  const [editFor, setEditFor] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  const afterChange = () => {
    summary.reload();
    list.reload();
    low.reload();
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('inventory.title')}>
        <ExportButton path="/inventory/export.csv" filename="inventory.csv" />
        <button type="button" className="btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
          {t('inventory.addIngredient')}
        </button>
      </PageHeader>

      {/* ---------- الكروت الثلاثة ---------- */}
      {summary.loading ? (
        <SkeletonCards count={3} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t('inventory.outCount')} value={num(summary.data?.outCount)} tone="bad" />
          <StatCard label={t('inventory.lowCount')} value={num(summary.data?.lowCount)} />
          <StatCard label={t('inventory.okCount')} value={num(summary.data?.okCount)} />
          <StatCard label={t('inventory.stockValue')} value={money(summary.data?.stockValue)} />
        </div>
      )}

      {/* ---------- فلاتر بسيطة ---------- */}
      <div className="flex flex-wrap gap-2">
        <div className="min-w-[180px] flex-1">
          <SearchInput value={q} onChange={(v) => set('q', v)} placeholder={t('common.searchPlaceholder')} />
        </div>
        <select className="field w-auto" value={status} onChange={(e) => set('status', e.target.value)}>
          <option value="">{t('common.all')}</option>
          <option value="low">{t('inventory.lowCount')}</option>
          <option value="out">{t('inventory.outCount')}</option>
        </select>
      </div>

      <InlineError error={actionError} />

      {/* ---------- جدول الخامات ---------- */}
      <div className="card">
        {list.loading && <SkeletonTable rows={8} cols={6} />}
        {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
        {!list.loading && list.data?.length === 0 && <EmptyState icon="▤" />}

        {!list.loading && list.data?.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="sticky-col">{t('common.ingredient')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('inventory.currentQty')}</th>
                  <th>{t('inventory.minQty')}</th>
                  <th>{t('inventory.costPerUnit')}</th>
                  <th>{t('inventory.stockValue')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((i) => (
                  <tr key={i._id}>
                    <td className="sticky-col font-semibold">{name(i)}</td>
                    <td>
                      <span className={STATUS_CLASS[i.stockStatus]}>{t(`inventory.status.${i.stockStatus}`)}</span>
                    </td>
                    <td className={`tabular-nums font-bold ${i.currentQty < 0 ? 'text-bad' : ''}`}>
                      {qty(i.currentQty, i.unit)}
                    </td>
                    <td className="tabular-nums text-muted">{qty(i.minQty, i.unit)}</td>
                    <td className="tabular-nums">{money(i.costPerUnit)}</td>
                    <td className="tabular-nums">{money(i.stockValue)}</td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => setMovementFor({ ingredient: i, type: 'purchase' })}
                        >
                          {t('inventory.addPurchase')}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => setMovementFor({ ingredient: i, type: 'waste' })}
                        >
                          {t('inventory.addWaste')}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => setMovementFor({ ingredient: i, type: 'adjustment' })}
                        >
                          {t('inventory.adjust')}
                        </button>
                        <button type="button" className="btn-ghost btn-sm" onClick={() => setEditFor(i)}>
                          {t('common.edit')}
                        </button>
                        <Link className="btn-ghost btn-sm" to={`/movements?ingredientId=${i._id}&range=last30`}>
                          {t('inventory.viewMovements')}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------- الناقص وقائمة الشراء ---------- */}
      <div className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">{t('inventory.lowTitle')}</h2>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted" htmlFor="days">
              {t('inventory.coverDays')}
            </label>
            <input
              id="days"
              type="number"
              min="1"
              max="90"
              className="field w-20 tabular-nums"
              value={get('days') || 7}
              onChange={(e) => set('days', e.target.value)}
            />
            <ExportButton
              path={`/inventory/low/export.csv${qs({ days: get('days') || 7 })}`}
              filename="purchase-list.csv"
            />
          </div>
        </div>

        {low.loading && <SkeletonTable rows={5} cols={5} />}
        {!low.loading && low.data?.rows?.length === 0 && <EmptyState icon="✓" title={t('common.none')} hint="" />}

        {!low.loading && low.data?.rows?.length > 0 && (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="sticky-col">{t('common.ingredient')}</th>
                    <th>{t('inventory.currentQty')}</th>
                    <th>{t('inventory.minQty')}</th>
                    <th>{t('inventory.dailyAvg')}</th>
                    <th>{t('inventory.suggestedQty')}</th>
                    <th>{t('inventory.suggestedCost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {low.data.rows.map((r) => (
                    <tr key={r._id} className={r.stockStatus === 'out' ? 'bg-bad-soft' : ''}>
                      <td className="sticky-col font-semibold">{name(r)}</td>
                      <td className="tabular-nums">{qty(r.currentQty, r.unit)}</td>
                      <td className="tabular-nums text-muted">{qty(r.minQty, r.unit)}</td>
                      <td className="tabular-nums">{qty(r.dailyAvg, r.unit)}</td>
                      <td className="tabular-nums font-bold">{qty(r.suggestedQty, r.unit)}</td>
                      <td className="tabular-nums">{money(r.suggestedCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 flex justify-between text-sm font-bold">
              <span>{t('inventory.totalPurchaseCost')}</span>
              <span className="tabular-nums">{money(low.data.totalCost)}</span>
            </p>
          </>
        )}
      </div>

      {/* ---------- النوافذ ---------- */}
      <MovementDialog
        state={movementFor}
        busy={busy}
        error={actionError}
        onClose={() => {
          setMovementFor(null);
          clearError();
        }}
        onSubmit={async (body) => {
          try {
            await run(() => api.post(`/ingredients/${movementFor.ingredient._id}/movement`, body));
            push({ message: t('common.saved') });
            setMovementFor(null);
            afterChange();
          } catch {
            /* معروض في النافذة */
          }
        }}
      />

      <IngredientDialog
        open={createOpen || !!editFor}
        ingredient={editFor}
        busy={busy}
        error={actionError}
        onClose={() => {
          setCreateOpen(false);
          setEditFor(null);
          clearError();
        }}
        onSubmit={async (body) => {
          try {
            if (editFor) await run(() => api.patch(`/ingredients/${editFor._id}`, body));
            else await run(() => api.post('/ingredients', body));
            push({ message: t('common.saved') });
            setCreateOpen(false);
            setEditFor(null);
            afterChange();
          } catch {
            /* معروض في النافذة */
          }
        }}
      />
    </div>
  );
}

/** وارد / هالك / تسوية — كلها بتعمل StockMovement مش تعديل مباشر */
function MovementDialog({ state, busy, error, onClose, onSubmit }) {
  const { t, name, qty: fmtQty } = useI18n();
  const [amount, setAmount] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [note, setNote] = useState('');

  if (!state) return null;
  const { ingredient, type } = state;

  const titles = { purchase: 'inventory.addPurchase', waste: 'inventory.addWaste', adjustment: 'inventory.adjust' };
  const hints = { purchase: 'inventory.purchaseHint', waste: 'inventory.wasteHint', adjustment: 'inventory.adjustHint' };

  const reset = () => {
    setAmount('');
    setUnitCost('');
    setNote('');
  };

  return (
    <Modal
      open
      onClose={() => {
        reset();
        onClose();
      }}
      title={`${t(titles[type])} — ${name(ingredient)}`}
      footer={
        <>
          <button
            type="button"
            className="btn-ghost flex-1"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={busy}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={busy || amount === '' || (type === 'adjustment' && !note.trim())}
            onClick={() => {
              onSubmit({
                type,
                qty: Number(amount),
                unitCost: type === 'purchase' && unitCost !== '' ? Number(unitCost) : undefined,
                note: note.trim(),
              });
              reset();
            }}
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">{t(hints[type])}</p>
        <p className="text-sm">
          {t('inventory.currentQty')}:{' '}
          <span className="font-bold tabular-nums">{fmtQty(ingredient.currentQty, ingredient.unit)}</span>
        </p>

        <div>
          <label className="label" htmlFor="mq">
            {t('common.qty')} ({t(`units.${ingredient.unit}`)})
          </label>
          <input
            id="mq"
            type="number"
            inputMode="decimal"
            className="field text-lg tabular-nums"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        {type === 'purchase' && (
          <div>
            <label className="label" htmlFor="mc">
              {t('inventory.newCost')} ({t('common.optional')})
            </label>
            <input
              id="mc"
              type="number"
              inputMode="decimal"
              className="field tabular-nums"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
            />
          </div>
        )}

        <div>
          <label className="label" htmlFor="mn">
            {t('common.reason')} {type === 'adjustment' ? `(${t('common.required')})` : `(${t('common.optional')})`}
          </label>
          <input id="mn" className="field" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <InlineError error={error} />
      </div>
    </Modal>
  );
}

/** إضافة/تعديل خامة — الرصيد مش موجود هنا لأنه مايتعدّلش مباشرة */
function IngredientDialog({ open, ingredient, busy, error, onClose, onSubmit }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ nameAr: '', nameEn: '', unit: 'g', minQty: '', costPerUnit: '', openingQty: '' });
  const [initialised, setInitialised] = useState(false);

  if (open && !initialised) {
    setForm({
      nameAr: ingredient?.nameAr || '',
      nameEn: ingredient?.nameEn || '',
      unit: ingredient?.unit || 'g',
      minQty: ingredient?.minQty ?? '',
      costPerUnit: ingredient?.costPerUnit ?? '',
      openingQty: '',
    });
    setInitialised(true);
  }
  if (!open && initialised) setInitialised(false);
  if (!open) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal
      open
      onClose={onClose}
      title={ingredient ? t('inventory.editIngredient') : t('inventory.addIngredient')}
      footer={
        <>
          <button type="button" className="btn-ghost flex-1" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={busy || !form.nameAr || !form.nameEn}
            onClick={() =>
              onSubmit({
                nameAr: form.nameAr,
                nameEn: form.nameEn,
                unit: form.unit,
                minQty: Number(form.minQty || 0),
                costPerUnit: Number(form.costPerUnit || 0),
                ...(ingredient ? {} : { openingQty: Number(form.openingQty || 0) }),
              })
            }
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="ina">
              {t('common.nameAr')}
            </label>
            <input id="ina" className="field" value={form.nameAr} onChange={(e) => set('nameAr', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="ine">
              {t('common.nameEn')}
            </label>
            <input id="ine" className="field" value={form.nameEn} onChange={(e) => set('nameEn', e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="iu">
              {t('common.unit')}
            </label>
            <select id="iu" className="field" value={form.unit} onChange={(e) => set('unit', e.target.value)}>
              {['g', 'ml', 'pc'].map((u) => (
                <option key={u} value={u}>
                  {t(`units.${u}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="im">
              {t('inventory.minQty')}
            </label>
            <input
              id="im"
              type="number"
              inputMode="decimal"
              className="field tabular-nums"
              value={form.minQty}
              onChange={(e) => set('minQty', e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="ic">
              {t('inventory.costPerUnit')}
            </label>
            <input
              id="ic"
              type="number"
              inputMode="decimal"
              className="field tabular-nums"
              value={form.costPerUnit}
              onChange={(e) => set('costPerUnit', e.target.value)}
            />
          </div>
          {!ingredient && (
            <div>
              <label className="label" htmlFor="io">
                {t('inventory.openingQty')}
              </label>
              <input
                id="io"
                type="number"
                inputMode="decimal"
                className="field tabular-nums"
                value={form.openingQty}
                onChange={(e) => set('openingQty', e.target.value)}
              />
            </div>
          )}
        </div>

        {ingredient && <p className="text-xs text-muted">{t('inventory.directEditBlocked')}</p>}

        <InlineError error={error} />
      </div>
    </Modal>
  );
}
