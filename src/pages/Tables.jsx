import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useApi, useAction } from '../hooks/useApi.js';
import { useFilters } from '../components/FilterBar.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { EmptyState, ErrorState, InlineError, Skeleton } from '../components/ui.jsx';
import { api, qs } from '../api/client.js';

/** بيحسب مدة الجلسة بالدقايق من وقت فتح الفاتورة */
function useMinutesSince(iso) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000); // بيتحدّث كل نص دقيقة
    return () => clearInterval(id);
  }, []);
  if (!iso) return null;
  return Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
}

function TableCard({ table, onOpen, busy }) {
  const { t, money, duration } = useI18n();
  const minutes = useMinutesSince(table.openOrder?.openedAt);
  const isBusy = !!table.openOrder;

  return (
    <button
      type="button"
      onClick={() => onOpen(table)}
      disabled={busy}
      className={`flex min-h-[128px] flex-col items-start gap-1 rounded-2xl border p-4 text-start transition-colors
        ${isBusy ? 'border-warn/40 bg-warn-soft' : 'border-line bg-surface hover:bg-surface2'}`}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="text-lg font-bold">
          {t('tables.table')} {table.number}
        </span>
        <span className={isBusy ? 'badge-low' : 'badge-ok'}>
          {isBusy ? t('tables.busy') : t('tables.free')}
        </span>
      </div>

      <span className="text-xs text-muted">
        {t(`areas.${table.area}`)} · {table.seats} {t('tables.seats')}
      </span>

      {isBusy ? (
        <div className="mt-auto w-full space-y-0.5">
          <p className="text-base font-bold tabular-nums">{money(table.openOrder.total)}</p>
          <p className="text-xs text-muted">
            {table.openOrder.itemsCount} {t('tables.itemsCount')} · {duration(minutes)}
          </p>
        </div>
      ) : (
        <span className="mt-auto text-xs font-semibold text-accent">{t('tables.openTable')}</span>
      )}
    </button>
  );
}

export default function Tables() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { get, set } = useFilters();
  const { run, busy, error: actionError, clearError } = useAction();

  const area = get('area');
  const status = get('status');
  const { data, loading, error, reload } = useApi(`/tables${qs({ area, status })}`, [area, status]);

  const areas = [...new Set((data || []).map((x) => x.area))];

  /** يفتح فاتورة جديدة أو يروح على المفتوحة */
  const openTable = async (table) => {
    clearError();
    try {
      const orderId = table.openOrder?._id || (await run(() => api.post('/orders', { tableId: table._id })))._id;
      navigate(`/orders/${orderId}`);
    } catch {
      /* الخطأ بيتعرض تحت */
    }
  };

  return (
    <div>
      <PageHeader title={t('tables.title')}>
        <select className="field w-auto" value={area} onChange={(e) => set('area', e.target.value)}>
          <option value="">{t('tables.allAreas')}</option>
          {areas.map((a) => (
            <option key={a} value={a}>
              {t(`areas.${a}`)}
            </option>
          ))}
        </select>
        <select className="field w-auto" value={status} onChange={(e) => set('status', e.target.value)}>
          <option value="">{t('common.all')}</option>
          <option value="free">{t('tables.free')}</option>
          <option value="busy">{t('tables.busy')}</option>
        </select>
      </PageHeader>

      {actionError && (
        <div className="mb-3">
          <InlineError error={actionError} />
        </div>
      )}

      {error && <ErrorState error={error} onRetry={reload} />}

      {loading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      )}

      {!loading && !error && data?.length === 0 && <EmptyState icon="▦" title={t('tables.empty')} hint="" />}

      {!loading && !error && data?.length > 0 && (
        // موبايل: عمود واحد · تابلت: 2-3 · ديسكتوب: 4-6
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
          {data.map((table) => (
            <TableCard key={table._id} table={table} onOpen={openTable} busy={busy} />
          ))}
        </div>
      )}
    </div>
  );
}
