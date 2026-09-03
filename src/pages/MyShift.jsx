import { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useApi, useAction } from '../hooks/useApi.js';
import { api } from '../api/client.js';
import { PageHeader } from '../components/Layout.jsx';
import { EmptyState, ErrorState, InlineError, Modal, Skeleton, StatCard, useToast } from '../components/ui.jsx';

export default function MyShift() {
  const { t, money, date, num } = useI18n();
  const { run, busy, error: actionError, clearError } = useAction();
  const { data, loading, error, reload } = useApi('/shifts/current');
  const workers = useApi('/workers');
  const { push } = useToast();
  const [pickedWorkers, setPickedWorkers] = useState([]);
  const [workersOpen, setWorkersOpen] = useState(false);

  const [openCash, setOpenCash] = useState('');
  const [closeOpen, setCloseOpen] = useState(false);
  const [closingCash, setClosingCash] = useState('');
  const [closed, setClosed] = useState(null);

  const shift = data?.shift;
  const s = data?.summary;

  const openShift = async () => {
    clearError();
    try {
      await run(() => api.post('/shifts/open', { openingCash: Number(openCash || 0), workers: pickedWorkers }));
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
          <div className="mb-3">
            <span className="label">{t('workers.pickForShift')}</span>
            <p className="mb-2 text-xs text-muted">{t('workers.pickHint')}</p>
            <WorkerPicker
              workers={workers.data || []}
              picked={pickedWorkers}
              onChange={setPickedWorkers}
            />
          </div>

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

      {/* مين شغّال في الشيفت ده */}
      <div className="card mb-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">{t('workers.onShift')}</h2>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => {
              setPickedWorkers((shift.workers || []).map((w) => String(w.workerId)));
              setWorkersOpen(true);
            }}
          >
            {t('workers.editWorkers')}
          </button>
        </div>

        {(shift.workers || []).length === 0 ? (
          <p className="text-sm text-muted">{t('workers.noneSelected')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {shift.workers.map((w) => (
              <span key={String(w.workerId)} className="chip">
                {w.name}
                <span className="text-muted">· {t(`jobTitles.${w.jobTitle || 'other'}`)}</span>
              </span>
            ))}
          </div>
        )}
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
        open={workersOpen}
        onClose={() => setWorkersOpen(false)}
        title={t('workers.pickForShift')}
        footer={
          <>
            <button type="button" className="btn-ghost flex-1" onClick={() => setWorkersOpen(false)} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={busy}
              onClick={async () => {
                try {
                  await run(() => api.patch('/shifts/current/workers', { workers: pickedWorkers }));
                  setWorkersOpen(false);
                  push({ message: t('common.saved') });
                  reload();
                } catch {
                  /* معروض في النافذة */
                }
              }}
            >
              {busy ? t('common.saving') : t('common.save')}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-muted">{t('workers.pickHint')}</p>
          <WorkerPicker workers={workers.data || []} picked={pickedWorkers} onChange={setPickedWorkers} />
          <InlineError error={actionError} />
        </div>
      </Modal>

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

/** اختيار العمّال الموجودين في الشيفت */
function WorkerPicker({ workers, picked, onChange }) {
  const { t } = useI18n();
  const toggle = (id) =>
    onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);

  if (!workers.length) {
    return <p className="rounded-xl bg-surface2 p-3 text-xs text-muted">{t('workers.emptyHint')}</p>;
  }

  return (
    <div className="max-h-56 space-y-1 overflow-y-auto">
      {workers.map((w) => (
        <label
          key={w._id}
          className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-line px-3"
        >
          <input type="checkbox" checked={picked.includes(String(w._id))} onChange={() => toggle(String(w._id))} />
          <span className="flex-1 text-sm font-semibold">{w.name}</span>
          <span className="text-xs text-muted">{t(`jobTitles.${w.jobTitle || 'other'}`)}</span>
        </label>
      ))}
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
