import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useApi, useAction } from '../hooks/useApi.js';
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
import { api } from '../api/client.js';

/** بيحدّث نفسه كل نص دقيقة عشان مدة الجلسة تفضل صح */
function useTicker(ms = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export default function Tables() {
  const { t, money, duration, num } = useI18n();
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const now = useTicker();
  const { push } = useToast();
  const { run, busy, error: actionError, clearError } = useAction();

  const { data, loading, error, reload } = useApi('/tables');
  const [manageOpen, setManageOpen] = useState(false);
  const [disableFor, setDisableFor] = useState(null);

  /** يفتح فاتورة جديدة أو يروح على المفتوحة (حتى لو الطاولة مدموجة) */
  const openTable = async (table) => {
    clearError();
    try {
      const id = table.openOrder?._id || (await run(() => api.post('/orders', { tableId: table._id })))._id;
      navigate(`/orders/${id}`);
    } catch {
      /* الخطأ بيتعرض فوق الجدول */
    }
  };

  const minutesOf = (iso) => (iso ? Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000)) : null);

  return (
    <div className="space-y-4">
      <PageHeader title={t('tables.title')}>
        {isManager && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => setManageOpen(true)}>
            {t('tables.manage')}
          </button>
        )}
      </PageHeader>

      <InlineError error={actionError} />
      {error && <ErrorState error={error} onRetry={reload} />}

      <div className="card">
        {loading && <SkeletonTable rows={8} cols={5} />}

        {!loading && !error && data?.length === 0 && (
          <EmptyState icon="▦" title={t('tables.empty')} hint={t('tables.emptyHint')} />
        )}

        {!loading && data?.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="sticky-col">{t('tables.table')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('tables.seats')}</th>
                  <th>{t('tables.currentTotal')}</th>
                  <th>{t('tables.itemsCount')}</th>
                  <th>{t('tables.sessionTime')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((tb) => {
                  const open = tb.openOrder;
                  return (
                    <tr key={tb._id} className={open ? 'bg-warn-soft' : ''}>
                      <td className="sticky-col">
                        <span className="text-base font-bold tabular-nums">{num(tb.number)}</span>
                        {tb.name && <span className="ms-2 text-xs text-muted">{tb.name}</span>}
                      </td>

                      <td>
                        {open ? (
                          <span className={tb.isMerged ? 'badge-info' : 'badge-low'}>
                            {tb.isMerged ? t('tables.merged') : t('tables.busy')}
                          </span>
                        ) : (
                          <span className="badge-ok">{t('tables.free')}</span>
                        )}
                      </td>

                      <td className="tabular-nums text-muted">{num(tb.seats)}</td>

                      <td className="tabular-nums font-bold">{open ? money(open.total) : '—'}</td>

                      <td className="tabular-nums text-muted">{open ? num(open.itemsCount) : '—'}</td>

                      <td className="tabular-nums text-muted">
                        {open ? duration(minutesOf(open.openedAt)) : '—'}
                      </td>

                      <td>
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            className={open ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}
                            disabled={busy}
                            onClick={() => openTable(tb)}
                          >
                            {open ? t('tables.goToOrder') : t('tables.openTable')}
                          </button>
                          {isManager && !open && (
                            <button
                              type="button"
                              className="btn-ghost btn-sm text-bad"
                              onClick={() => setDisableFor(tb)}
                            >
                              {t('common.delete')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ManageTablesDialog
        open={manageOpen}
        current={data?.length || 0}
        busy={busy}
        error={actionError}
        onClose={() => {
          setManageOpen(false);
          clearError();
        }}
        onDone={(msg) => {
          if (msg) push({ message: msg });
          reload();
        }}
        run={run}
      />

      <ConfirmDialog
        open={!!disableFor}
        message={t('tables.disableConfirm', { number: disableFor ? num(disableFor.number) : '' })}
        busy={busy}
        onCancel={() => setDisableFor(null)}
        onConfirm={async () => {
          try {
            await run(() => api.del(`/tables/${disableFor._id}`));
            setDisableFor(null);
            reload();
          } catch {
            setDisableFor(null);
          }
        }}
      />
    </div>
  );
}

/** إدارة عدد الطاولات — إضافة واحدة، أو ظبط العدد الإجمالي مرة واحدة */
function ManageTablesDialog({ open, current, busy, error, onClose, onDone, run }) {
  const { t, num } = useI18n();
  const [count, setCount] = useState('');
  const [seats, setSeats] = useState('4');

  useEffect(() => {
    if (open) setCount(String(current));
  }, [open, current]);

  if (!open) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={t('tables.manage')}
      footer={
        <button type="button" className="btn-ghost w-full" onClick={onClose} disabled={busy}>
          {t('common.close')}
        </button>
      }
    >
      <div className="space-y-5">
        {/* ظبط العدد الإجمالي */}
        <div>
          <span className="label">{t('tables.setCount')}</span>
          <p className="mb-2 text-xs text-muted">{t('tables.setCountHint')}</p>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              max="500"
              inputMode="numeric"
              className="field tabular-nums"
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
            <button
              type="button"
              className="btn-primary shrink-0"
              disabled={busy || count === ''}
              onClick={async () => {
                try {
                  const r = await run(() => api.post('/tables/set-count', { count: Number(count) }));
                  let msg = t('tables.countChanged', { added: num(r.added), disabled: num(r.disabled) });
                  if (r.skippedBusy?.length) {
                    msg += ' · ' + t('tables.busySkipped', { numbers: r.skippedBusy.join(', ') });
                  }
                  onDone(msg);
                } catch {
                  /* معروض تحت */
                }
              }}
            >
              {t('tables.setCountApply')}
            </button>
          </div>
        </div>

        {/* إضافة طاولة واحدة */}
        <div className="border-t border-line pt-4">
          <span className="label">{t('tables.addTable')}</span>
          <div className="flex gap-2">
            <input
              type="number"
              min="1"
              inputMode="numeric"
              className="field tabular-nums"
              placeholder={t('tables.seats')}
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
            />
            <button
              type="button"
              className="btn-ghost shrink-0"
              disabled={busy}
              onClick={async () => {
                try {
                  await run(() => api.post('/tables', { seats: Number(seats) || 4 }));
                  onDone();
                } catch {
                  /* معروض تحت */
                }
              }}
            >
              {t('common.add')}
            </button>
          </div>
        </div>

        <InlineError error={error} />
      </div>
    </Modal>
  );
}
