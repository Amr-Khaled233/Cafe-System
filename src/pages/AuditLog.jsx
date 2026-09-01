import { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useApi } from '../hooks/useApi.js';
import FilterBar, { useFilters } from '../components/FilterBar.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { EmptyState, ErrorState, ExportButton, Modal, SkeletonTable } from '../components/ui.jsx';

export default function AuditLog() {
  const { t, date, num } = useI18n();
  const { query, get, set } = useFilters();
  const page = Number(get('page') || 1);
  const q = `?${query || 'range=last30'}`;

  const { data, loading, error, reload } = useApi(`/audit${q}`, [query]);
  const actions = useApi('/audit/actions');
  const [details, setDetails] = useState(null);

  return (
    <div className="space-y-4">
      <PageHeader title={t('audit.title')}>
        <ExportButton path={`/audit/export.csv${q}`} filename="audit-log.csv" />
      </PageHeader>

      <FilterBar show={['range', 'staff']} />

      <div className="flex flex-wrap gap-2">
        <select className="field w-auto" value={get('action')} onChange={(e) => set('action', e.target.value)}>
          <option value="">{t('common.all')}</option>
          {(actions.data || []).map((a) => (
            <option key={a} value={a}>
              {t(`audit.actions.${a}`) === `audit.actions.${a}` ? a : t(`audit.actions.${a}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        {loading && <SkeletonTable rows={10} cols={5} />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {!loading && data?.rows?.length === 0 && <EmptyState icon="⏱" />}

        {!loading && data?.rows?.length > 0 && (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="sticky-col">{t('common.date')}</th>
                    <th>{t('common.user')}</th>
                    <th>{t('audit.action')}</th>
                    <th>{t('audit.entity')}</th>
                    <th>{t('audit.details')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => {
                    const label = t(`audit.actions.${r.action}`);
                    return (
                      <tr key={r._id}>
                        <td className="sticky-col text-muted">{date(r.at)}</td>
                        <td className="font-semibold">{r.userId?.name || '—'}</td>
                        <td>{label === `audit.actions.${r.action}` ? r.action : label}</td>
                        <td className="text-muted">{r.entity}</td>
                        <td>
                          <button type="button" className="btn-ghost btn-sm" onClick={() => setDetails(r)}>
                            {t('audit.details')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
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

      {/* القيمة قبل وبعد — دي اللي بتخلي السجل مفيد فعلاً */}
      <Modal open={!!details} onClose={() => setDetails(null)} title={t('audit.details')} wide>
        {details && (
          <div className="space-y-3 text-xs">
            <p className="text-sm font-semibold">{date(details.at)}</p>
            <div>
              <p className="label">{t('audit.before')}</p>
              <pre className="overflow-x-auto rounded-xl bg-surface2 p-3" dir="ltr">
                {JSON.stringify(details.before, null, 2) || '—'}
              </pre>
            </div>
            <div>
              <p className="label">{t('audit.after')}</p>
              <pre className="overflow-x-auto rounded-xl bg-surface2 p-3" dir="ltr">
                {JSON.stringify(details.after, null, 2) || '—'}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
