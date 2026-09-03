import { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useApi } from '../hooks/useApi.js';
import FilterBar, { useFilters } from '../components/FilterBar.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { EmptyState, ErrorState, ExportButton, SkeletonTable, StatCard } from '../components/ui.jsx';

export default function Daily() {
  const { t, money, money2, num, date } = useI18n();
  const { query } = useFilters();
  const q = `?${query || 'range=last30'}`;
  const { data, loading, error, reload } = useApi(`/reports/daily${q}`, [query]);
  const [openDay, setOpenDay] = useState(null);

  const totals = data?.totals;

  return (
    <div className="space-y-4">
      <PageHeader title={t('daily.title')} subtitle={t('daily.subtitle')}>
        <ExportButton path={`/reports/daily/export.csv${q}`} filename="daily-report.csv" />
      </PageHeader>

      <FilterBar show={['range']} />

      {error && <ErrorState error={error} onRetry={reload} />}

      {/* ---------- إجماليات الفترة ---------- */}
      {totals && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label={t('daily.revenue')} value={money(totals.revenue)} />
            <StatCard label={t('daily.ingredientCost')} value={money(totals.ingredientCost)} />
            <StatCard label={t('daily.expenses')} value={money(totals.expenses)} tone="bad" />
            <StatCard label={t('daily.netProfit')} value={money(totals.netProfit)} />
          </div>
          <p className="text-xs text-muted">{t('daily.formula')}</p>
        </>
      )}

      <div className="card">
        {loading && <SkeletonTable rows={8} cols={7} />}
        {!loading && data?.rows?.length === 0 && <EmptyState icon="◷" />}

        {!loading && data?.rows?.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="sticky-col">{t('daily.day')}</th>
                  <th>{t('daily.shifts')}</th>
                  <th>{t('daily.ordersCount')}</th>
                  <th>{t('daily.revenue')}</th>
                  <th>{t('daily.ingredientCost')}</th>
                  <th>{t('daily.grossProfit')}</th>
                  <th>{t('daily.expenses')}</th>
                  <th>{t('daily.netProfit')}</th>
                  <th>{t('daily.received')}</th>
                  <th>{t('daily.waste')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <Row
                    key={r.day}
                    row={r}
                    open={openDay === r.day}
                    onToggle={() => setOpenDay(openDay === r.day ? null : r.day)}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td className="sticky-col">{t('reports.totalsRow')}</td>
                  <td />
                  <td className="tabular-nums">{num(totals.orders)}</td>
                  <td className="tabular-nums">{money(totals.revenue)}</td>
                  <td className="tabular-nums">{money(totals.ingredientCost)}</td>
                  <td className="tabular-nums">{money(totals.grossProfit)}</td>
                  <td className="tabular-nums">{money(totals.expenses)}</td>
                  <td className={`tabular-nums ${totals.netProfit < 0 ? 'text-bad' : 'text-good'}`}>
                    {money(totals.netProfit)}
                  </td>
                  <td className="tabular-nums">{money(totals.purchasedCost)}</td>
                  <td className="tabular-nums">{money(totals.wasteCost)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** صف اليوم + صف مطويّ فيه تفاصيل الشيفتات */
function Row({ row, open, onToggle }) {
  const { t, money, money2, num, date } = useI18n();

  return (
    <>
      <tr className={open ? 'bg-surface2' : ''}>
        <td className="sticky-col font-semibold">{date(row.day, { dateStyle: 'medium' })}</td>
        <td className="tabular-nums text-muted">{num(row.shifts.length)}</td>
        <td className="tabular-nums">{num(row.orders)}</td>
        <td className="tabular-nums font-semibold">{money(row.revenue)}</td>
        <td className="tabular-nums">{money(row.ingredientCost)}</td>
        <td className="tabular-nums">{money(row.grossProfit)}</td>
        <td className={`tabular-nums ${row.expenses > 0 ? 'text-bad' : 'text-muted'}`}>{money(row.expenses)}</td>
        <td className={`tabular-nums font-bold ${row.netProfit < 0 ? 'text-bad' : 'text-good'}`}>
          {money(row.netProfit)}
        </td>
        <td className="tabular-nums text-muted">{money(row.purchasedCost)}</td>
        <td className={`tabular-nums ${row.wasteCost > 0 ? 'text-warn' : 'text-muted'}`}>{money(row.wasteCost)}</td>
        <td>
          <button type="button" className="btn-ghost btn-sm" onClick={onToggle}>
            {t('daily.expandDay')}
          </button>
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={11} className="bg-surface2 p-0">
            <div className="p-3">
              {row.shifts.length === 0 ? (
                <p className="text-sm text-muted">{t('daily.noShifts')}</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('daily.shiftTime')}</th>
                      <th>{t('daily.staff')}</th>
                      <th>{t('daily.workers')}</th>
                      <th>{t('daily.ordersCount')}</th>
                      <th>{t('daily.itemsCount')}</th>
                      <th>{t('daily.revenue')}</th>
                      <th>{t('paymentMethods.cash')}</th>
                      <th>{t('paymentMethods.card')}</th>
                      <th>{t('paymentMethods.wallet')}</th>
                      <th>{t('shift.difference')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.shifts.map((s) => (
                      <tr key={s.shiftId}>
                        <td className="whitespace-nowrap tabular-nums">
                          {s.startedAt ? date(s.startedAt, { timeStyle: 'short' }) : '—'}
                          {' → '}
                          {s.endedAt ? date(s.endedAt, { timeStyle: 'short' }) : t('shift.current')}
                        </td>
                        <td className="font-semibold">{s.staffName || '—'}</td>
                        <td className="max-w-[200px] truncate text-muted">
                          {s.workers.length ? s.workers.join(t('common.listSeparator')) : '—'}
                        </td>
                        <td className="tabular-nums">{num(s.orders)}</td>
                        <td className="tabular-nums">{num(s.items)}</td>
                        <td className="tabular-nums font-semibold">{money2(s.revenue)}</td>
                        <td className="tabular-nums">{money2(s.cash)}</td>
                        <td className="tabular-nums">{money2(s.card)}</td>
                        <td className="tabular-nums">{money2(s.wallet)}</td>
                        <td
                          className={`tabular-nums ${
                            s.difference < 0 ? 'text-bad' : s.difference > 0 ? 'text-info' : 'text-muted'
                          }`}
                        >
                          {s.difference === null || s.difference === undefined ? '—' : money2(s.difference)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
