import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useApi } from '../hooks/useApi.js';
import FilterBar, { useFilters } from '../components/FilterBar.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { EmptyState, ErrorState, ExportButton, SkeletonTable } from '../components/ui.jsx';

const TABS = ['itemSales', 'consumption', 'ordersReport'];

export default function Reports() {
  const { t } = useI18n();
  const { get, set } = useFilters();
  const tab = get('tab') || 'itemSales';

  return (
    <div className="space-y-4">
      <PageHeader title={t('reports.title')} />

      {/* التبويب في الـ URL كمان — فالرابط بيرجّعك لنفس التقرير */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {TABS.map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => set('tab', x)}
            className={`btn-sm shrink-0 rounded-full font-semibold ${
              tab === x ? 'bg-accent text-white' : 'border border-line bg-surface'
            }`}
          >
            {t(`reports.${x}`)}
          </button>
        ))}
      </div>

      <FilterBar
        show={
          tab === 'consumption'
            ? ['range', 'ingredient']
            : tab === 'ordersReport'
            ? ['range', 'staff', 'paymentMethod', 'status', 'table', 'area', 'q']
            : ['range', 'category', 'item', 'staff', 'q']
        }
      />

      {tab === 'itemSales' && <ItemSalesReport />}
      {tab === 'consumption' && <ConsumptionReport />}
      {tab === 'ordersReport' && <OrdersReport />}
    </div>
  );
}

/* ---------------- 10.1 المبيعات بالصنف ---------------- */
function ItemSalesReport() {
  const { t, name, money, num, pct } = useI18n();
  const { query, get, set } = useFilters();
  const q = query ? `?${query}` : '';
  const { data, loading, error, reload } = useApi(`/reports/item-sales${q}`, [query]);
  const sort = get('sort') || 'qty';

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{t('reports.sortBy')}</span>
          {['qty', 'revenue', 'profit'].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => set('sort', k)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                sort === k ? 'bg-accent text-white' : 'border border-line bg-surface'
              }`}
            >
              {t(k === 'qty' ? 'reports.qtySold' : k === 'revenue' ? 'common.revenue' : 'common.profit')}
            </button>
          ))}
        </div>
        <ExportButton path={`/reports/item-sales/export.csv${q}`} filename="item-sales.csv" />
      </div>

      {loading && <SkeletonTable rows={8} cols={7} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {!loading && data?.rows?.length === 0 && <EmptyState />}

      {!loading && data?.rows?.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="sticky-col">{t('common.item')}</th>
                <th>{t('common.category')}</th>
                <th>{t('reports.qtySold')}</th>
                <th>{t('common.revenue')}</th>
                <th>{t('common.cost')}</th>
                <th>{t('reports.grossProfit')}</th>
                <th>{t('reports.marginPct')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.menuItemId}>
                  <td className="sticky-col font-semibold">{name(r)}</td>
                  <td className="text-muted">{name({ nameAr: r.categoryNameAr, nameEn: r.categoryNameEn })}</td>
                  <td className="tabular-nums">{num(r.qty)}</td>
                  <td className="tabular-nums">{money(r.revenue)}</td>
                  <td className="tabular-nums">{money(r.cost)}</td>
                  <td className="tabular-nums font-semibold">{money(r.profit)}</td>
                  <td className={`tabular-nums ${r.marginPct < 40 ? 'text-warn' : 'text-good'}`}>
                    {pct(r.marginPct)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td className="sticky-col">{t('reports.totalsRow')}</td>
                <td />
                <td className="tabular-nums">{num(data.totals.qty)}</td>
                <td className="tabular-nums">{money(data.totals.revenue)}</td>
                <td className="tabular-nums">{money(data.totals.cost)}</td>
                <td className="tabular-nums">{money(data.totals.profit)}</td>
                <td className="tabular-nums">{pct(data.totals.marginPct)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------- 10.2 استهلاك الخامات ---------------- */
function ConsumptionReport() {
  const { t, name, money, qty } = useI18n();
  const { query } = useFilters();
  const q = query ? `?${query}` : '';
  const { data, loading, error, reload } = useApi(`/reports/consumption${q}`, [query]);

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">{t('reports.clickIngredient')}</p>
        <ExportButton path={`/reports/consumption/export.csv${q}`} filename="consumption.csv" />
      </div>

      {loading && <SkeletonTable rows={8} cols={8} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {!loading && data?.rows?.length === 0 && <EmptyState />}

      {!loading && data?.rows?.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th className="sticky-col">{t('common.ingredient')}</th>
                <th>{t('common.unit')}</th>
                <th>{t('stocktake.opening')}</th>
                <th>{t('stocktake.purchased')}</th>
                <th>{t('stocktake.consumed')}</th>
                <th>{t('stocktake.waste')}</th>
                <th>{t('reports.closing')}</th>
                <th>{t('reports.consumedValue')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.ingredientId}>
                  <td className="sticky-col font-semibold">
                    {/* الضغط بيوديك على حركات الخامة دي في نفس الفترة */}
                    <Link className="text-accent underline" to={`/movements?ingredientId=${r.ingredientId}&${query}`}>
                      {name(r)}
                    </Link>
                  </td>
                  <td className="text-muted">{t(`units.${r.unit}`)}</td>
                  <td className="tabular-nums">{qty(r.openingQty)}</td>
                  <td className="tabular-nums">{qty(r.purchasedQty)}</td>
                  <td className="tabular-nums font-semibold">{qty(r.consumedQty)}</td>
                  <td className={`tabular-nums ${r.wasteQty > 0 ? 'text-warn' : ''}`}>{qty(r.wasteQty)}</td>
                  <td className={`tabular-nums font-bold ${r.closingQty < 0 ? 'text-bad' : ''}`}>
                    {qty(r.closingQty)}
                  </td>
                  <td className="tabular-nums">{money(r.consumedValue)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold">
                <td className="sticky-col">{t('reports.totalsRow')}</td>
                <td colSpan={6} />
                <td className="tabular-nums">{money(data.totals.consumedValue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------- تقرير الفواتير المفصّل ---------------- */
function OrdersReport() {
  const { t, money, date, num } = useI18n();
  const { query, get, set } = useFilters();
  const page = Number(get('page') || 1);
  const q = `?${query || ''}`;
  const { data, loading, error, reload } = useApi(`/reports/orders${q}`, [query]);

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {t('common.results')}: <span className="tabular-nums">{num(data?.total || 0)}</span>
          {data?.totals && <span className="ms-3 tabular-nums">{money(data.totals.revenue)}</span>}
        </p>
        <ExportButton path={`/reports/orders/export.csv${q}`} filename="orders.csv" />
      </div>

      {loading && <SkeletonTable rows={8} cols={7} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {!loading && data?.rows?.length === 0 && <EmptyState />}

      {!loading && data?.rows?.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="sticky-col">{t('reports.orderNo')}</th>
                  <th>{t('common.date')}</th>
                  <th>{t('tables.table')}</th>
                  <th>{t('common.user')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('filters.paymentMethod')}</th>
                  <th>{t('reports.itemsCount')}</th>
                  <th>{t('order.discount')}</th>
                  <th>{t('common.total')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((o) => (
                  <tr key={o._id} className={o.status === 'void' ? 'opacity-60' : ''}>
                    <td className="sticky-col font-mono text-xs font-semibold">
                      {String(o._id).slice(-6).toUpperCase()}
                    </td>
                    <td className="text-muted">{date(o.closedAt || o.openedAt)}</td>
                    <td className="tabular-nums">{o.tableId?.number ?? '—'}</td>
                    <td>{o.userId?.name}</td>
                    <td>
                      <span
                        className={
                          o.status === 'paid' ? 'badge-ok' : o.status === 'void' ? 'badge-out' : 'badge-low'
                        }
                      >
                        {t(`orderStatus.${o.status}`)}
                      </span>
                    </td>
                    <td>{o.paymentMethod ? t(`paymentMethods.${o.paymentMethod}`) : '—'}</td>
                    <td className="tabular-nums">{num(o.items.reduce((s, i) => s + i.qty, 0))}</td>
                    <td className="tabular-nums text-warn">{money(o.subtotal - o.total)}</td>
                    <td className="tabular-nums font-bold">{money(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.pages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                type="button"
                className="btn-ghost btn-sm"
                disabled={page <= 1}
                onClick={() => set('page', page - 1)}
              >
                {t('common.prev')}
              </button>
              <span className="text-xs tabular-nums text-muted">
                {t('common.page')} {num(page)} {t('common.of')} {num(data.pages)}
              </span>
              <button
                type="button"
                className="btn-ghost btn-sm"
                disabled={page >= data.pages}
                onClick={() => set('page', page + 1)}
              >
                {t('common.next')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
