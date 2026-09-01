import { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useApi, useAction } from '../hooks/useApi.js';
import { api } from '../api/client.js';
import { PageHeader } from '../components/Layout.jsx';
import { EmptyState, ErrorState, InlineError, Modal, Skeleton, StatCard } from '../components/ui.jsx';

export default function MyShift() {
  const { t, money, date, num } = useI18n();
  const { run, busy, error: actionError, clearError } = useAction();
  const { data, loading, error, reload } = useApi('/shifts/current');

  const [openCash, setOpenCash] = useState('');
  const [closeOpen, setCloseOpen] = useState(false);
  const [closingCash, setClosingCash] = useState('');
  const [closed, setClosed] = useState(null);

  const shift = data?.shift;
  const s = data?.summary;

  const openShift = async () => {
    clearError();
    try {
      await run(() => api.post('/shifts/open', { openingCash: Number(openCash || 0) }));
      setOpenCash('');
      reload();
    } catch {
      /* معروض تحت */
    }
  };

  const closeShift = async () => {
    clearError();
    try {
      const res = await run(() => api.post('/shifts/close', { closingCash: Number(closingCash) }));
      setClosed(res.shift);
      setCloseOpen(false);
      setClosingCash('');
      reload();
    } catch {
      /* معروض في النافذة */
    }
  };

  if (loading) return <Skeleton className="h-64" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  /* ---------- مفيش شيفت مفتوح ---------- */
  if (!shift) {
    return (
      <div>
        <PageHeader title={t('shift.title')} />

        {closed && <ClosedSummary shift={closed} />}

        <div className="card mx-auto max-w-sm">
          <EmptyState icon="◷" title={t('shift.noShift')} hint={t('shift.noShiftHint')} />
          <label className="label" htmlFor="oc">
            {t('shift.openingCash')}
          </label>
          <input
            id="oc"
            type="number"
            inputMode="decimal"
            className="field mb-3 tabular-nums"
            value={openCash}
            onChange={(e) => setOpenCash(e.target.value)}
          />
          <InlineError error={actionError} />
          <button type="button" className="btn-primary mt-3 w-full" onClick={openShift} disabled={busy}>
            {busy ? t('common.saving') : t('shift.open')}
          </button>
        </div>
      </div>
    );
  }

  /* ---------- شيفت مفتوح ---------- */
  return (
    <div>
      <PageHeader title={t('shift.title')} subtitle={`${t('shift.startedAt')}: ${date(shift.startedAt)}`}>
        <button type="button" className="btn-primary" onClick={() => setCloseOpen(true)}>
          {t('shift.close')}
        </button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('shift.ordersCount')} value={num(s.ordersCount)} />
        <StatCard label={t('shift.collected')} value={money(s.total)} />
        <StatCard label={t('shift.avgOrder')} value={money(s.avgOrder)} />
        <StatCard label={t('shift.itemsSold')} value={num(s.itemsCount)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 text-sm font-bold">{t('shift.byPayment')}</h2>
          <dl className="space-y-2">
            <Line label={t('paymentMethods.cash')} value={money(s.cash)} />
            <Line label={t('paymentMethods.card')} value={money(s.card)} />
            <Line label={t('paymentMethods.wallet')} value={money(s.wallet)} />
            <div className="border-t border-line pt-2">
              <Line label={t('shift.openingCash')} value={money(shift.openingCash)} />
              <Line label={t('shift.expectedCash')} value={money(s.expectedCash)} bold />
            </div>
          </dl>
        </div>

        <div className="card">
          <h2 className="mb-3 text-sm font-bold">{t('shift.current')}</h2>
          <dl className="space-y-2">
            <Line label={t('shift.stillOpen')} value={num(s.openCount)} />
            <Line label={t('shift.voided')} value={num(s.voidedCount)} />
          </dl>
          {s.openCount > 0 && (
            <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-xs font-semibold text-warn">
              {t('errors.OPEN_ORDERS_EXIST')}
            </p>
          )}
        </div>
      </div>

      <Modal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title={t('shift.close')}
        footer={
          <>
            <button type="button" className="btn-ghost flex-1" onClick={() => setCloseOpen(false)} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={closeShift}
              disabled={busy || closingCash === ''}
            >
              {busy ? t('common.saving') : t('shift.close')}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm">{t('shift.closeConfirm')}</p>
          <Line label={t('shift.expectedCash')} value={money(s.expectedCash)} bold />
          <div>
            <label className="label" htmlFor="cc">
              {t('shift.closingCash')}
            </label>
            <input
              id="cc"
              type="number"
              inputMode="decimal"
              className="field text-lg tabular-nums"
              value={closingCash}
              onChange={(e) => setClosingCash(e.target.value)}
            />
          </div>
          {closingCash !== '' && (
            <Line
              label={t('shift.difference')}
              value={money(Number(closingCash) - s.expectedCash)}
              tone={Number(closingCash) - s.expectedCash < 0 ? 'bad' : 'good'}
              bold
            />
          )}
          <InlineError error={actionError} />
        </div>
      </Modal>
    </div>
  );
}

function Line({ label, value, bold, tone }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={`text-sm ${bold ? 'font-bold' : 'text-muted'}`}>{label}</dt>
      <dd
        className={`text-sm tabular-nums ${bold ? 'font-bold' : 'font-semibold'} ${
          tone === 'bad' ? 'text-bad' : tone === 'good' ? 'text-good' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function ClosedSummary({ shift }) {
  const { t, money, date } = useI18n();
  const diff = shift.difference || 0;
  return (
    <div className="card mb-4">
      <h2 className="mb-2 text-sm font-bold">{t('shift.closed')}</h2>
      <dl className="space-y-2">
        <Line label={t('shift.endedAt')} value={date(shift.endedAt)} />
        <Line label={t('shift.expectedCash')} value={money(shift.expectedCash)} />
        <Line label={t('shift.closingCash')} value={money(shift.closingCash)} />
        <Line
          label={diff < 0 ? t('shift.shortage') : diff > 0 ? t('shift.surplus') : t('shift.balanced')}
          value={money(diff)}
          tone={diff < 0 ? 'bad' : diff > 0 ? 'good' : undefined}
          bold
        />
      </dl>
    </div>
  );
}
