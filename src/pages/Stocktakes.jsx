import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useApi, useAction } from '../hooks/useApi.js';
import { api } from '../api/client.js';
import FilterBar, { useFilters } from '../components/FilterBar.jsx';
import { PageHeader } from '../components/Layout.jsx';
import { EmptyState, ErrorState, InlineError, Modal, SkeletonTable } from '../components/ui.jsx';

export default function Stocktakes() {
  const { t, money, date, num } = useI18n();
  const navigate = useNavigate();
  const { query } = useFilters();
  const { run, busy, error: actionError, clearError } = useAction();

  const list = useApi(`/stocktakes${query ? `?${query}` : ''}`, [query]);
  const [newOpen, setNewOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const create = async () => {
    clearError();
    try {
      const st = await run(() => api.post('/stocktakes', { from, to }));
      setNewOpen(false);
      navigate(`/stocktakes/${st._id}`);
    } catch {
      /* معروض في النافذة */
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('stocktake.title')} subtitle={t('stocktake.formula')}>
        <button type="button" className="btn-primary btn-sm" onClick={() => setNewOpen(true)}>
          {t('stocktake.new')}
        </button>
      </PageHeader>

      <FilterBar show={['range']} />

      <div className="card">
        {list.loading && <SkeletonTable rows={5} cols={5} />}
        {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
        {!list.loading && list.data?.length === 0 && (
          <EmptyState icon="✓" title={t('stocktake.empty')} hint={t('stocktake.emptyHint')} />
        )}

        {!list.loading && list.data?.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="sticky-col">{t('stocktake.period')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('stocktake.countedLines')}</th>
                  <th>{t('stocktake.totalDiff')}</th>
                  <th>{t('stocktake.createdBy')}</th>
                  <th>{t('stocktake.closedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((s) => (
                  <tr
                    key={s._id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/stocktakes/${s._id}`)}
                  >
                    <td className="sticky-col font-semibold">
                      {date(s.from, { dateStyle: 'medium' })} — {date(s.to, { dateStyle: 'medium' })}
                    </td>
                    <td>
                      <span className={s.status === 'closed' ? 'badge-info' : 'badge-low'}>
                        {t(`stocktake.status.${s.status}`)}
                      </span>
                    </td>
                    <td className="tabular-nums">
                      {num(s.countedCount)} / {num(s.linesCount)}
                    </td>
                    <td
                      className={`tabular-nums font-bold ${
                        s.totalDiffValue < 0 ? 'text-bad' : s.totalDiffValue > 0 ? 'text-info' : ''
                      }`}
                    >
                      {money(s.totalDiffValue)}
                    </td>
                    <td>{s.createdBy?.name}</td>
                    <td className="text-muted">{s.closedAt ? date(s.closedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title={t('stocktake.new')}
        footer={
          <>
            <button type="button" className="btn-ghost flex-1" onClick={() => setNewOpen(false)} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn-primary flex-1" onClick={create} disabled={busy || !from || !to}>
              {busy ? t('common.saving') : t('common.create')}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">{t('stocktake.newHint')}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="sf">
                {t('filters.from')}
              </label>
              <input id="sf" type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="st">
                {t('filters.to')}
              </label>
              <input id="st" type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <InlineError error={actionError} />
        </div>
      </Modal>
    </div>
  );
}
