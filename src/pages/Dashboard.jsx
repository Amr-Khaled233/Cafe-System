import { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useApi } from '../hooks/useApi.js';
import { useFilters } from '../components/FilterBar.jsx';
import FilterBar from '../components/FilterBar.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { ErrorState, ExportButton, SkeletonCards, StatCard } from '../components/ui.jsx';
import {
  CategoryDonut,
  ChartCard,
  HorizontalBars,
  PaymentStacked,
  PeakHeatmap,
  SalesLine,
} from '../components/charts.jsx';

export default function Dashboard() {
  const { t, money, num, name, pct, duration } = useI18n();
  const { query } = useFilters();
  const [topBy, setTopBy] = useState('qty');

  // كل الأرقام محسوبة في السيرفر — الواجهة بتعرض بس
  const q = query ? `?${query}` : '?range=today';
  const summary = useApi(`/stats/summary${q}`, [query]);
  const series = useApi(`/stats/timeseries${q}`, [query]);
  const top = useApi(`/stats/top-items${q}`, [query]);
  const byCat = useApi(`/stats/by-category${q}`, [query]);
  const peak = useApi(`/stats/peak-hours${q}`, [query]);
  const staff = useApi(`/stats/by-staff${q}`, [query]);
  const tables = useApi(`/stats/by-table${q}`, [query]);
  const payment = useApi(`/stats/by-payment${q}`, [query]);
  const ings = useApi(`/stats/top-ingredients${q}`, [query]);
  const margins = useApi(`/stats/item-margins${q}`, [query]);

  const c = summary.data?.current;
  const ch = summary.data?.change || {};

  return (
    <div className="space-y-4">
      <PageHeader title={t('dashboard.title')} />

      <FilterBar show={['range', 'staff', 'category', 'item', 'paymentMethod', 'table', 'area']} />

      {summary.error && <ErrorState error={summary.error} onRetry={summary.reload} />}

      {/* ---------- صف الـ KPIs ---------- */}
      {summary.loading && <SkeletonCards count={8} />}
      {!summary.loading && c && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t('dashboard.kpi.revenue')} value={money(c.revenue)} change={ch.revenue} />
          <StatCard label={t('dashboard.kpi.orders')} value={num(c.ordersCount)} change={ch.ordersCount} />
          <StatCard label={t('dashboard.kpi.avgOrder')} value={money(c.avgOrder)} change={ch.avgOrder} />
          <StatCard label={t('dashboard.kpi.items')} value={num(c.itemsCount)} change={ch.itemsCount} />
          <StatCard label={t('dashboard.kpi.discounts')} value={money(c.discounts)} change={ch.discounts} />
          <StatCard label={t('dashboard.kpi.voided')} value={money(c.voidedValue)} change={ch.voidedValue} tone="bad" />
          <StatCard label={t('dashboard.kpi.cost')} value={money(c.cost)} change={ch.cost} />
          <StatCard label={t('dashboard.kpi.profit')} value={money(c.profit)} change={ch.profit} />
        </div>
      )}

      {/* ---------- الرسوم ---------- */}
      <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        <div className="xl:col-span-2">
          <ChartCard
            title={t('dashboard.charts.timeseries')}
            loading={series.loading}
            empty={!series.data?.rows?.length}
          >
            <SalesLine rows={series.data?.rows || []} granularity={series.data?.granularity} />
          </ChartCard>
        </div>

        <ChartCard
          title={t('dashboard.charts.topItems')}
          loading={top.loading}
          empty={!top.data?.rows?.length}
          action={
            <div className="flex gap-1">
              {['qty', 'revenue'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTopBy(k)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    topBy === k ? 'bg-accent text-white' : 'border border-line bg-surface'
                  }`}
                >
                  {t(k === 'qty' ? 'dashboard.byQty' : 'dashboard.byRevenue')}
                </button>
              ))}
            </div>
          }
        >
          <HorizontalBars
            rows={(top.data?.rows || []).map((r) => ({ ...r, __label: name(r) }))}
            labelKey="__label"
            valueKey={topBy}
            formatValue={(v) => (topBy === 'qty' ? num(v) : money(v))}
          />
        </ChartCard>

        <ChartCard
          title={t('dashboard.charts.byCategory')}
          loading={byCat.loading}
          empty={!byCat.data?.rows?.length}
        >
          <CategoryDonut rows={byCat.data?.rows || []} />
        </ChartCard>

        <div className="xl:col-span-2">
          <ChartCard title={t('dashboard.charts.peakHours')} loading={peak.loading} empty={!peak.data?.rows?.length}>
            <PeakHeatmap rows={peak.data?.rows || []} max={peak.data?.max} />
          </ChartCard>
        </div>

        <ChartCard
          title={t('dashboard.charts.topIngredients')}
          loading={ings.loading}
          empty={!ings.data?.rows?.length}
        >
          <HorizontalBars
            rows={(ings.data?.rows || []).map((r) => ({ ...r, __label: name(r) }))}
            labelKey="__label"
            valueKey="qty"
            colorIndex={2}
            formatValue={(v) => num(v)}
          />
        </ChartCard>

        <ChartCard
          title={t('dashboard.charts.byPayment')}
          loading={payment.loading}
          empty={!payment.data?.rows?.length}
        >
          <PaymentStacked rows={payment.data?.rows || []} />
        </ChartCard>
      </div>

      {/* ---------- الجداول ---------- */}
      <ChartCard
        title={t('dashboard.charts.byStaff')}
        loading={staff.loading}
        empty={!staff.data?.rows?.length}
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.user')}</th>
                <th>{t('shift.ordersCount')}</th>
                <th>{t('common.revenue')}</th>
                <th>{t('shift.avgOrder')}</th>
                <th>{t('order.discount')}</th>
              </tr>
            </thead>
            <tbody>
              {(staff.data?.rows || []).map((r) => (
                <tr key={r.userId}>
                  <td className="font-semibold">{r.name}</td>
                  <td className="tabular-nums">{num(r.orders)}</td>
                  <td className="tabular-nums">{money(r.revenue)}</td>
                  <td className="tabular-nums">{money(r.avgOrder)}</td>
                  <td className="tabular-nums">{money(r.discounts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <ChartCard
        title={t('dashboard.charts.byTable')}
        loading={tables.loading}
        empty={!tables.data?.rows?.length}
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('tables.table')}</th>
                <th>{t('filters.area')}</th>
                <th>{t('dashboard.sessions')}</th>
                <th>{t('dashboard.avgSession')}</th>
                <th>{t('common.revenue')}</th>
              </tr>
            </thead>
            <tbody>
              {(tables.data?.rows || []).map((r) => (
                <tr key={r.tableId}>
                  <td className="font-semibold tabular-nums">{num(r.number)}</td>
                  <td>{t(`areas.${r.area}`)}</td>
                  <td className="tabular-nums">{num(r.sessions)}</td>
                  <td className="tabular-nums">{duration(r.avgMinutes)}</td>
                  <td className="tabular-nums">{money(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <ChartCard
        title={t('dashboard.charts.itemMargins')}
        loading={margins.loading}
        empty={!margins.data?.rows?.length}
        action={<ExportButton path={`/reports/item-sales/export.csv${q}`} filename="item-sales.csv" />}
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="sticky-col">{t('common.item')}</th>
                <th>{t('common.price')}</th>
                <th>{t('common.cost')}</th>
                <th>{t('common.profit')}</th>
                <th>{t('common.margin')}</th>
              </tr>
            </thead>
            <tbody>
              {(margins.data?.rows || []).map((r) => (
                <tr key={r.menuItemId}>
                  <td className="sticky-col font-semibold">{name(r)}</td>
                  <td className="tabular-nums">{money(r.price)}</td>
                  <td className="tabular-nums">{money(r.cost)}</td>
                  <td className="tabular-nums">{money(r.profit)}</td>
                  <td className={`tabular-nums font-semibold ${r.marginPct < 40 ? 'text-warn' : 'text-good'}`}>
                    {pct(r.marginPct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}
