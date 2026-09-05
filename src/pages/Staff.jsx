import { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useApi, useAction } from '../hooks/useApi.js';
import { api } from '../api/client.js';
import FilterBar, { useFilters } from '../components/FilterBar.jsx';
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

export default function Staff() {
  const { t, money, date, num } = useI18n();
  const { push } = useToast();
  const { run, busy, error: actionError, clearError } = useAction();
  const { query } = useFilters();

  const users = useApi('/users');
  const emailStatus = useApi('/users/email-status');
  const [revokeFor, setRevokeFor] = useState(null);
  const workers = useApi('/workers?active=all');
  const [workerDialog, setWorkerDialog] = useState(null);
  const [disableWorker, setDisableWorker] = useState(null);
  const shifts = useApi(`/shifts${query ? `?${query}` : '?range=last30'}`, [query]);

  const [dialog, setDialog] = useState(null);
  const [disableFor, setDisableFor] = useState(null);

  return (
    <div className="space-y-4">
      <PageHeader title={t('staff.title')}>
        <button type="button" className="btn-primary btn-sm" onClick={() => setDialog({})}>
          {t('staff.addUser')}
        </button>
      </PageHeader>

      <InlineError error={actionError} />

      {emailStatus.data && !emailStatus.data.configured && (
        <p className="rounded-xl bg-warn-soft px-3 py-2 text-xs font-semibold text-warn">
          {t('staff.emailNotSetUp')}
        </p>
      )}

      {/* ---------- الحسابات ---------- */}
      <div className="card">
        {users.loading && <SkeletonTable rows={4} cols={5} />}
        {users.error && <ErrorState error={users.error} onRetry={users.reload} />}

        {!users.loading && users.data?.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="sticky-col">{t('common.name')}</th>
                  <th>{t('auth.username')}</th>
                  <th>{t('staff.email')}</th>
                  <th>{t('staff.role')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('staff.shiftsCount')}</th>
                  <th>{t('staff.lastLogin')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.data.map((u) => (
                  <tr key={u._id} className={u.active ? '' : 'opacity-60'}>
                    <td className="sticky-col font-semibold">{u.name}</td>
                    <td className="font-mono text-xs">{u.username}</td>
                    <td className="text-xs" dir="ltr">
                      {u.email || <span className="text-muted">{t('staff.noEmail')}</span>}
                    </td>
                    <td>
                      <span className={u.role === 'manager' ? 'badge-info' : 'badge'}>{t(`roles.${u.role}`)}</span>
                    </td>
                    <td>
                      <span className={u.active ? 'badge-ok' : 'badge-out'}>
                        {t(u.active ? 'staff.active' : 'staff.disabled')}
                      </span>
                    </td>
                    <td className="tabular-nums">{num(u.shiftsCount)}</td>
                    <td className="text-muted">{u.lastLoginAt ? date(u.lastLoginAt) : '—'}</td>
                    <td>
                      <div className="flex gap-1">
                        <button type="button" className="btn-ghost btn-sm" onClick={() => setDialog(u)}>
                          {t('common.edit')}
                        </button>

                        {/* المدير بيبعت رابط بدل ما يعرف باسورد الموظف */}
                        {u.active && u.email && emailStatus.data?.configured && (
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            disabled={busy}
                            onClick={async () => {
                              try {
                                await run(() => api.post('/users/' + u._id + '/send-reset'));
                                push({ message: t('staff.resetSent', { email: u.email }) });
                              } catch {
                                /* الخطأ بيبان فوق الجدول */
                              }
                            }}
                          >
                            {t('staff.sendResetShort')}
                          </button>
                        )}

                        {u.active && (
                          <button type="button" className="btn-ghost btn-sm" onClick={() => setRevokeFor(u)}>
                            {t('staff.revokeShort')}
                          </button>
                        )}

                        {u.active && (
                          <button
                            type="button"
                            className="btn-ghost btn-sm text-bad"
                            onClick={() => setDisableFor(u)}
                          >
                            {t('staff.disabled')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------- العمّال: بيعملوا المشاريب ومالهمش دخول للنظام ---------- */}
      <div className="card">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold">{t('workers.title')}</h2>
            <p className="text-xs text-muted">{t('workers.subtitle')}</p>
          </div>
          <button type="button" className="btn-primary btn-sm" onClick={() => setWorkerDialog({})}>
            {t('workers.add')}
          </button>
        </div>

        {workers.loading && <SkeletonTable rows={4} cols={5} />}
        {!workers.loading && workers.data?.length === 0 && (
          <EmptyState icon="C" title={t('workers.empty')} hint={t('workers.emptyHint')} />
        )}

        {!workers.loading && workers.data?.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="sticky-col">{t('workers.name')}</th>
                  <th>{t('workers.jobTitle')}</th>
                  <th>{t('workers.phone')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('workers.shiftsCount')}</th>
                  <th>{t('workers.lastShift')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {workers.data.map((w) => (
                  <tr key={w._id} className={w.active ? '' : 'opacity-60'}>
                    <td className="sticky-col font-semibold">{w.name}</td>
                    <td>{t('jobTitles.' + (w.jobTitle || 'other'))}</td>
                    <td className="tabular-nums text-muted">{w.phone || '—'}</td>
                    <td>
                      <span className={w.active ? 'badge-ok' : 'badge-out'}>
                        {t(w.active ? 'staff.active' : 'staff.disabled')}
                      </span>
                    </td>
                    <td className="tabular-nums">{num(w.shiftsCount || 0)}</td>
                    <td className="text-muted">{w.lastShiftAt ? date(w.lastShiftAt) : '—'}</td>
                    <td>
                      <div className="flex gap-1">
                        <button type="button" className="btn-ghost btn-sm" onClick={() => setWorkerDialog(w)}>
                          {t('common.edit')}
                        </button>
                        {w.active && (
                          <button
                            type="button"
                            className="btn-ghost btn-sm text-bad"
                            onClick={() => setDisableWorker(w)}
                          >
                            {t('staff.disabled')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---------- سجل الشيفتات ---------- */}
      <div className="card">
        <h2 className="mb-3 text-sm font-bold">{t('staff.shiftsHistory')}</h2>
        <FilterBar show={['range', 'staff']} className="mb-3" />

        {shifts.loading && <SkeletonTable rows={6} cols={6} />}
        {!shifts.loading && shifts.data?.rows?.length === 0 && <EmptyState icon="◷" />}

        {!shifts.loading && shifts.data?.rows?.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="sticky-col">{t('common.user')}</th>
                  <th>{t('shift.startedAt')}</th>
                  <th>{t('shift.endedAt')}</th>
                  <th>{t('shift.ordersCount')}</th>
                  <th>{t('shift.collected')}</th>
                  <th>{t('shift.expectedCash')}</th>
                  <th>{t('shift.closingCash')}</th>
                  <th>{t('shift.difference')}</th>
                  <th>{t('workers.inShift')}</th>
                </tr>
              </thead>
              <tbody>
                {shifts.data.rows.map((s) => (
                  <tr key={s._id}>
                    <td className="sticky-col font-semibold">{s.userId?.name}</td>
                    <td className="text-muted">{date(s.startedAt)}</td>
                    <td className="text-muted">{s.endedAt ? date(s.endedAt) : t('shift.current')}</td>
                    <td className="tabular-nums">{num(s.summary?.ordersCount)}</td>
                    <td className="tabular-nums">{money(s.summary?.total)}</td>
                    <td className="tabular-nums">{money(s.expectedCash ?? s.summary?.expectedCash)}</td>
                    <td className="tabular-nums">{s.closingCash === null ? '—' : money(s.closingCash)}</td>
                    <td
                      className={`tabular-nums font-bold ${
                        s.difference < 0 ? 'text-bad' : s.difference > 0 ? 'text-info' : ''
                      }`}
                    >
                      {s.difference === null ? '—' : money(s.difference)}
                    </td>
                    <td className="max-w-[220px] truncate text-muted">
                      {(s.workers || []).length
                        ? s.workers.map((w) => w.name).join(t('common.listSeparator'))
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <UserDialog
        user={dialog}
        busy={busy}
        error={actionError}
        onClose={() => {
          setDialog(null);
          clearError();
        }}
        onSubmit={async (body) => {
          try {
            if (dialog?._id) await run(() => api.patch(`/users/${dialog._id}`, body));
            else await run(() => api.post('/users', body));
            push({ message: t('common.saved') });
            setDialog(null);
            users.reload();
          } catch {
            /* معروض في النافذة */
          }
        }}
      />

      <WorkerDialog
        worker={workerDialog}
        busy={busy}
        error={actionError}
        onClose={() => {
          setWorkerDialog(null);
          clearError();
        }}
        onSubmit={async (body) => {
          try {
            if (workerDialog?._id) await run(() => api.patch('/workers/' + workerDialog._id, body));
            else await run(() => api.post('/workers', body));
            push({ message: t('common.saved') });
            setWorkerDialog(null);
            workers.reload();
          } catch {
            /* meaayn fy alnafdha */
          }
        }}
      />

      <ConfirmDialog
        open={!!revokeFor}
        message={t('staff.revokeConfirm', { name: revokeFor?.name || '' })}
        confirmLabel={t('staff.revokeSessions')}
        busy={busy}
        onCancel={() => setRevokeFor(null)}
        onConfirm={async () => {
          try {
            await run(() => api.post('/users/' + revokeFor._id + '/revoke-sessions'));
            push({ message: t('staff.revoked') });
            setRevokeFor(null);
            users.reload();
          } catch {
            setRevokeFor(null);
          }
        }}
      />

      <ConfirmDialog
        open={!!disableWorker}
        message={t('workers.disableConfirm', { name: disableWorker?.name || '' })}
        busy={busy}
        onCancel={() => setDisableWorker(null)}
        onConfirm={async () => {
          try {
            await run(() => api.patch('/workers/' + disableWorker._id, { active: false }));
            setDisableWorker(null);
            workers.reload();
          } catch {
            setDisableWorker(null);
          }
        }}
      />

      <ConfirmDialog
        open={!!disableFor}
        message={t('staff.disableConfirm', { name: disableFor?.name || '' })}
        busy={busy}
        onCancel={() => setDisableFor(null)}
        onConfirm={async () => {
          try {
            await run(() => api.patch(`/users/${disableFor._id}`, { active: false }));
            setDisableFor(null);
            users.reload();
          } catch {
            setDisableFor(null);
          }
        }}
      />
    </div>
  );
}

/** نافذة إضافة/تعديل عامل — مالوش حساب دخول، اسم ووظيفة وتليفون بس */
function WorkerDialog({ worker, busy, error, onClose, onSubmit }) {
  const { t } = useI18n();
  const [form, setForm] = useState(null);

  if (worker && !form) {
    setForm({
      name: worker.name || '',
      jobTitle: worker.jobTitle || 'barista',
      phone: worker.phone || '',
    });
  }
  if (!worker && form) setForm(null);
  if (!worker || !form) return null;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal
      open
      onClose={onClose}
      title={worker._id ? t('workers.edit') : t('workers.add')}
      footer={
        <>
          <button type="button" className="btn-ghost flex-1" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={busy || !form.name.trim()}
            onClick={() => onSubmit(form)}
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="wn">{t('workers.name')}</label>
          <input id="wn" className="field" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="wj">{t('workers.jobTitle')}</label>
          <select id="wj" className="field" value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)}>
            {['barista', 'kitchen', 'waiter', 'cashier', 'other'].map((j) => (
              <option key={j} value={j}>
                {t('jobTitles.' + j)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="wp">{t('workers.phone')}</label>
          <input id="wp" className="field tabular-nums" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>
        <InlineError error={error} />
      </div>
    </Modal>
  );
}

function UserDialog({ user, busy, error, onClose, onSubmit }) {
  const { t } = useI18n();
  const [form, setForm] = useState(null);

  if (user && !form) {
    setForm({
      name: user.name || '',
      username: user.username || '',
      email: user.email || '',
      password: '',
      role: user.role || 'reception',
      active: user.active !== false,
    });
  }
  if (!user && form) setForm(null);
  if (!user || !form) return null;

  const editing = !!user._id;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? t('staff.editUser') : t('staff.addUser')}
      footer={
        <>
          <button type="button" className="btn-ghost flex-1" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={busy || !form.name || (!editing && (!form.username || !form.password))}
            onClick={() =>
              onSubmit(
                editing
                  ? {
                      name: form.name,
                      email: form.email,
                      role: form.role,
                      active: form.active,
                      ...(form.password ? { password: form.password } : {}),
                    }
                  : {
                      name: form.name,
                      username: form.username,
                      email: form.email,
                      password: form.password,
                      role: form.role,
                    }
              )
            }
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="un">
            {t('common.name')}
          </label>
          <input id="un" className="field" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>

        {!editing && (
          <div>
            <label className="label" htmlFor="uu">
              {t('auth.username')}
            </label>
            <input
              id="uu"
              className="field"
              autoCapitalize="none"
              value={form.username}
              onChange={(e) => set('username', e.target.value)}
            />
          </div>
        )}

        <div>
          <label className="label" htmlFor="ue">
            {t('staff.email')}
          </label>
          <input
            id="ue"
            type="email"
            className="field"
            dir="ltr"
            autoCapitalize="none"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />
          <p className="mt-1 text-xs text-muted">{t('staff.emailHint')}</p>
        </div>

        <div>
          <label className="label" htmlFor="up">
            {editing ? t('staff.newPassword') : t('auth.password')}
          </label>
          <input
            id="up"
            type="password"
            className="field"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
          />
          {editing && <p className="mt-1 text-xs text-muted">{t('staff.passwordHint')}</p>}
        </div>

        <div>
          <label className="label" htmlFor="ur">
            {t('staff.role')}
          </label>
          <select id="ur" className="field" value={form.role} onChange={(e) => set('role', e.target.value)}>
            <option value="reception">{t('roles.reception')}</option>
            <option value="manager">{t('roles.manager')}</option>
          </select>
        </div>

        {editing && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
            {t('staff.active')}
          </label>
        )}

        <InlineError error={error} />
      </div>
    </Modal>
  );
}
