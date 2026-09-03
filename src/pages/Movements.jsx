import { useI18n } from '../i18n/index.jsx';
import { useApi } from '../hooks/useApi.js';
import FilterBar, { useFilters } from '../components/FilterBar.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { EmptyState, ErrorState, ExportButton, SkeletonTable } from '../components/ui.jsx';

const TYPE_CLASS = {
  purchase: 'badge-ok',
  return: 'badge-info',
  sale: 'badge',
  waste: 'badge-out',
  adjustment: 'badge-low',
  stocktake: 'badge-info',
};

export default function Movements() {
  const { t, name, money, qty, date, num, numSigned } = useI18n();
  const { query, get, set } = useFilters();
  const page = Number(get('page') || 1);
  const q = `?${query || 'range=last30'}`;

  const { data, loading, error, reload } = useApi(`/ingredients/movements/all${q}`, [query]);

  return (
    <div className="space-y-4">
      <PageHeader title={t('inventory.movements')}>
        <ExportButton path={`/ingredients/movements/export.csv${q}`} filename="stock-movements.csv" />
      </PageHeader>

      <FilterBar show={['range', 'ingredient', 'movementType', 'staff']} />

      <div className="card">
        {loading && <SkeletonTable rows={10} cols={7} />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {!loading && data?.rows?.length === 0 && <EmptyState icon="⇅" />}

        {!loading && data?.rows?.length > 0 && (
          <>
            <p className="mb-3 text-sm text-muted">
              {t('common.results')}: <span className="tabular-nums">{num(data.total)}</span>
            </p>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="sticky-col">{t('common.ingredient')}</th>
                    <th>{t('common.date')}</th>
                    <th>{t('filters.movementType')}</th>
                    <th>{t('common.qty')}</th>
                    <th>{t('inventory.balanceAfter')}</th>
                    <th>{t('inventory.movementValue')}</th>
                    <th>{t('common.user')}</th>
                    <th>{t('common.note')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((m) => (
                    <tr key={m._id}>
                      <td className="sticky-col font-semibold">{name(m.ingredientId)}</td>
                      <td className="text-muted">{date(m.at)}</td>
                      <td>
                        <span className={TYPE_CLASS[m.type]}>{t(`movementTypes.${m.type}`)}</span>
                      </td>
                      <td className={`tabular-nums font-bold ${m.qty < 0 ? 'text-bad' : 'text-good'}`}>
                        <span className="bidi-isolate">
                          {numSigned(m.qty)} {t(`units.${m.ingredientId?.unit || 'g'}`)}
                        </span>
                      </td>
                      <td className={`tabular-nums ${m.balanceAfter < 0 ? 'text-bad' : ''}`}>
                        {qty(m.balanceAfter, m.ingredientId?.unit)}
                      </td>
                      <td className="tabular-nums text-muted">{money(Math.abs(m.qty * m.unitCost))}</td>
                      <td>{m.userId?.name || '—'}</td>
                      <td className="max-w-[200px] truncate text-muted">{m.note || '—'}</td>
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
    </div>
  );
}
