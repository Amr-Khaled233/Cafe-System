import { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useApi, useAction } from '../hooks/useApi.js';
import { api } from '../api/client.js';
import FilterBar, { useFilters } from '../components/FilterBar.jsx';
import { PageHeader } from '../components/Layout.jsx';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ExportButton,
  InlineError,
  Modal,
  SkeletonTable,
  StatCard,
  useToast,
} from '../components/ui.jsx';
import { useChartTheme } from '../components/charts.jsx';

const CATEGORIES = ['rent', 'salaries', 'utilities', 'supplies', 'maintenance', 'marketing', 'transport', 'other'];

export default function Expenses() {
  const { t, money, money2, num, date, pct } = useI18n();
  const { push } = useToast();
  const { run, busy, error: actionError, clearError } = useAction();
  const { query, get, set } = useFilters();
  const theme = useChartTheme();

  const q = `?${query || 'range=thisMonth'}`;
  const list = useApi(`/expenses${q}`, [query]);
  const summary = useApi(`/expenses/summary${q}`, [query]);

  const [dialog, setDialog] = useState(null);
  const [deleteFor, setDeleteFor] = useState(null);

  const reload = () => {
    list.reload();
    summary.reload();
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('expenses.title')} subtitle={t('expenses.subtitle')}>
        <ExportButton path={`/expenses/export.csv${q}`} filename="expenses.csv" />
        <button type="button" className="btn-primary btn-sm" onClick={() => setDialog({})}>
          {t('expenses.add')}
        </button>
      </PageHeader>

      <FilterBar show={['range', 'q']} />

      <div className="flex flex-wrap gap-2">
        <select className="field w-auto" value={get('category')} onChange={(e) => set('category', e.target.value)}>
          <option value="">{t('common.all')}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`expenseCategories.${c}`)}
            </option>
          ))}
        </select>
      </div>

      <InlineError error={actionError} />

      {/* ---------- الملخّص ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label={t('expenses.total')} value={money(summary.data?.total)} tone="bad" />
        <StatCard label={t('expenses.count')} value={num(list.data?.total || 0)} />
        <StatCard
          label={t('expenses.topCategory')}
          value={
            summary.data?.top
              ? `${t(`expenseCategories.${summary.data.top.category}`)} · ${money(summary.data.top.amount)}`
              : '—'
          }
        />
      </div>

      {/* ---------- بتصرف في إيه ---------- */}
      <div className="card">
        <h2 className="mb-3 text-sm font-bold">{t('expenses.byCategory')}</h2>

        {summary.loading && <SkeletonTable rows={4} cols={3} />}
        {!summary.loading && !summary.data?.byCategory?.length && <EmptyState icon="◌" />}

        {!summary.loading && summary.data?.byCategory?.length > 0 && (
          <ul className="space-y-2">
            {summary.data.byCategory.map((r, i) => (
              <li key={r.category} className="flex items-center gap-3 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: theme.series[i % theme.series.length] }}
                />
                <span className="w-32 shrink-0 truncate">{t(`expenseCategories.${r.category}`)}</span>
                {/* شريط بسيط بيوضّح الحجم النسبي من غير مكتبة رسوم */}
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface2">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${r.pct}%`, background: theme.series[i % theme.series.length] }}
                  />
                </span>
                <span className="w-24 text-end font-semibold tabular-nums">{money(r.amount)}</span>
                <span className="w-14 text-end tabular-nums text-muted">{pct(r.pct)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------- القايمة ---------- */}
      <div className="card">
        {list.loading && <SkeletonTable rows={8} cols={5} />}
        {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
        {!list.loading && list.data?.rows?.length === 0 && (
          <EmptyState icon="◇" title={t('expenses.empty')} hint={t('expenses.emptyHint')} />
        )}

        {!list.loading && list.data?.rows?.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="sticky-col">{t('expenses.at')}</th>
                  <th>{t('expenses.category')}</th>
                  <th>{t('expenses.amount')}</th>
                  <th>{t('expenses.note')}</th>
                  <th>{t('expenses.addedBy')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {list.data.rows.map((r) => (
                  <tr key={r._id}>
                    <td className="sticky-col text-muted">{date(r.at, { dateStyle: 'medium' })}</td>
                    <td className="font-semibold">{t(`expenseCategories.${r.category}`)}</td>
                    <td className="tabular-nums font-bold">{money2(r.amount)}</td>
                    <td className="max-w-[240px] truncate text-muted">{r.note || '—'}</td>
                    <td className="text-muted">{r.userId?.name || '—'}</td>
                    <td>
                      <div className="flex gap-1">
                        <button type="button" className="btn-ghost btn-sm" onClick={() => setDialog(r)}>
                          {t('common.edit')}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-sm text-bad"
                          onClick={() => setDeleteFor(r)}
                        >
                          {t('common.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td className="sticky-col">{t('reports.totalsRow')}</td>
                  <td />
                  <td className="tabular-nums">{money2(list.data.totalAmount)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <ExpenseDialog
        expense={dialog}
        busy={busy}
        error={actionError}
        onClose={() => {
          setDialog(null);
          clearError();
        }}
        onSubmit={async (body) => {
          try {
            if (dialog?._id) await run(() => api.patch(`/expenses/${dialog._id}`, body));
            else await run(() => api.post('/expenses', body));
            push({ message: t('common.saved') });
            setDialog(null);
            reload();
          } catch {
            /* معروض في النافذة */
          }
        }}
      />

      <ConfirmDialog
        open={!!deleteFor}
        message={t('expenses.deleteConfirm', { amount: deleteFor ? money2(deleteFor.amount) : '' })}
        busy={busy}
        onCancel={() => setDeleteFor(null)}
        onConfirm={async () => {
          try {
            await run(() => api.del(`/expenses/${deleteFor._id}`));
            setDeleteFor(null);
            reload();
          } catch {
            setDeleteFor(null);
          }
        }}
      />
    </div>
  );
}

function ExpenseDialog({ expense, busy, error, onClose, onSubmit }) {
  const { t } = useI18n();
  const [form, setForm] = useState(null);

  if (expense && !form) {
    setForm({
      at: (expense.at ? new Date(expense.at) : new Date()).toISOString().slice(0, 10),
      category: expense.category || 'supplies',
      amount: expense.amount ?? '',
      note: expense.note || '',
    });
  }
  if (!expense && form) setForm(null);
  if (!expense || !form) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal
      open
      onClose={onClose}
      title={expense._id ? t('expenses.edit') : t('expenses.add')}
      footer={
        <>
          <button type="button" className="btn-ghost flex-1" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={busy || form.amount === '' || Number(form.amount) <= 0}
            onClick={() => onSubmit({ ...form, amount: Number(form.amount) })}
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="ea">
            {t('expenses.amount')}
          </label>
          <input
            id="ea"
            type="number"
            inputMode="decimal"
            min="0"
            className="field text-lg tabular-nums"
            value={form.amount}
            onChange={(e) => set('amount', e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="ec">
            {t('expenses.category')}
          </label>
          <select id="ec" className="field" value={form.category} onChange={(e) => set('category', e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`expenseCategories.${c}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="ed">
            {t('expenses.at')}
          </label>
          <input id="ed" type="date" className="field" value={form.at} onChange={(e) => set('at', e.target.value)} />
        </div>

        <div>
          <label className="label" htmlFor="en">
            {t('expenses.note')}
          </label>
          <input id="en" className="field" value={form.note} onChange={(e) => set('note', e.target.value)} />
        </div>

        <InlineError error={error} />
      </div>
    </Modal>
  );
}
