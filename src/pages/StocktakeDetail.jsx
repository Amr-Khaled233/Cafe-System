import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useApi, useAction } from '../hooks/useApi.js';
import { api } from '../api/client.js';
import { PageHeader } from '../components/Layout.jsx';
import StocktakeRow from '../components/StocktakeRow.jsx';
import {
  ConfirmDialog,
  ErrorState,
  ExportButton,
  InlineError,
  SkeletonTable,
  StatCard,
  useToast,
} from '../components/ui.jsx';

export default function StocktakeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, money, date, num } = useI18n();
  const { push } = useToast();
  const { run, busy, error: actionError, clearError } = useAction();

  const st = useApi(`/stocktakes/${id}`, [id]);
  const [counts, setCounts] = useState({}); // ingredientId -> countedQty
  const [closeOpen, setCloseOpen] = useState(false);

  // بنملّي المعدود المحفوظ أول ما البيانات توصل
  useEffect(() => {
    if (!st.data) return;
    setCounts(
      Object.fromEntries(st.data.lines.map((l) => [String(l.ingredientId), l.countedQty]))
    );
  }, [st.data]);

  if (st.loading) return <SkeletonTable rows={10} cols={9} />;
  if (st.error) return <ErrorState error={st.error} onRetry={st.reload} />;

  const data = st.data;
  const readOnly = data.status === 'closed';

  // الإجماليات بتتحسب لحظياً من اللي مكتوب دلوقتي
  const totals = data.lines.reduce(
    (acc, l) => {
      const c = counts[String(l.ingredientId)];
      if (c === null || c === undefined || c === '') return acc;
      const diff = Number(c) - l.expectedQty;
      const value = diff * (l.unitCost || l.ingredient?.costPerUnit || 0);
      return {
        counted: acc.counted + 1,
        value: acc.value + value,
        shortage: acc.shortage + (value < 0 ? value : 0),
        surplus: acc.surplus + (value > 0 ? value : 0),
      };
    },
    { counted: 0, value: 0, shortage: 0, surplus: 0 }
  );

  const save = async () => {
    clearError();
    try {
      const lines = Object.entries(counts).map(([ingredientId, countedQty]) => ({ ingredientId, countedQty }));
      const updated = await run(() => api.patch(`/stocktakes/${id}`, { lines }));
      st.setData(updated);
      push({ message: t('common.saved') });
    } catch {
      /* معروض تحت */
    }
  };

  const close = async () => {
    clearError();
    try {
      // بنحفظ الأول عشان آخر تعديل مايضيعش، وبعدين نقفل
      const lines = Object.entries(counts).map(([ingredientId, countedQty]) => ({ ingredientId, countedQty }));
      await run(() => api.patch(`/stocktakes/${id}`, { lines }));
      const closed = await run(() => api.post(`/stocktakes/${id}/close`));
      st.setData(closed);
      setCloseOpen(false);
      push({ message: t('common.saved') });
    } catch {
      setCloseOpen(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${t('stocktake.title')} · ${date(data.from, { dateStyle: 'medium' })} — ${date(data.to, {
          dateStyle: 'medium',
        })}`}
        subtitle={
          readOnly
            ? `${t('stocktake.readOnly')} · ${t('stocktake.closedAt')}: ${date(data.closedAt)}`
            : t('stocktake.formula')
        }
      >
        <button type="button" className="btn-ghost btn-sm" onClick={() => navigate('/stocktakes')}>
          {t('common.back')}
        </button>
        <ExportButton path={`/stocktakes/${id}/export.csv`} filename={`stocktake-${String(id).slice(-6)}.csv`} />
        {!readOnly && (
          <>
            <button type="button" className="btn-ghost btn-sm" onClick={save} disabled={busy}>
              {busy ? t('common.saving') : t('stocktake.save')}
            </button>
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => setCloseOpen(true)}
              disabled={busy || totals.counted === 0}
            >
              {t('stocktake.close')}
            </button>
          </>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('stocktake.countedLines')} value={`${num(totals.counted)} / ${num(data.lines.length)}`} />
        <StatCard label={t('stocktake.shortage')} value={money(totals.shortage)} tone="bad" />
        <StatCard label={t('stocktake.surplus')} value={money(totals.surplus)} />
        <StatCard label={t('stocktake.totalDiff')} value={money(readOnly ? data.totalDiffValue : totals.value)} />
      </div>

      <InlineError error={actionError} />

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="sticky-col">{t('common.ingredient')}</th>
                <th>{t('stocktake.opening')}</th>
                <th>{t('stocktake.purchased')}</th>
                <th>{t('stocktake.consumed')}</th>
                <th>{t('stocktake.waste')}</th>
                <th>{t('stocktake.adjusted')}</th>
                <th>{t('stocktake.expected')}</th>
                <th>{t('stocktake.counted')}</th>
                <th>{t('stocktake.diff')}</th>
                <th>{t('stocktake.diffValue')}</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l) => (
                <StocktakeRow
                  key={String(l.ingredientId)}
                  line={{ ...l, countedQty: counts[String(l.ingredientId)] }}
                  ingredient={l.ingredient}
                  readOnly={readOnly}
                  onCount={(v) => setCounts((c) => ({ ...c, [String(l.ingredientId)]: v }))}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={closeOpen}
        title={t('stocktake.close')}
        message={t('stocktake.closeConfirm')}
        confirmLabel={t('stocktake.close')}
        busy={busy}
        onCancel={() => setCloseOpen(false)}
        onConfirm={close}
      />
    </div>
  );
}
