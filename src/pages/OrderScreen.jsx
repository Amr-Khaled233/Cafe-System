import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useApi, useAction } from '../hooks/useApi.js';
import { api, qs } from '../api/client.js';
import { PageHeader } from '../components/Layout.jsx';
import { SearchInput } from '../components/FilterBar.jsx';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  InlineError,
  Modal,
  SkeletonTable,
  useToast,
} from '../components/ui.jsx';

export default function OrderScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, name, money, num, date } = useI18n();
  const { isManager } = useAuth();
  const { push } = useToast();
  const { run, busy, error: actionError, clearError } = useAction();

  const [tab, setTab] = useState('menu');
  const [categoryId, setCategoryId] = useState('');
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [variantFor, setVariantFor] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  const order = useApi(`/orders/${id}`, [id]);
  const cats = useApi('/categories');
  const menu = useApi(`/menu${qs({ categoryId, q, available: 'true' })}`, [categoryId, q]);
  const tables = useApi('/tables');

  const isOpen = order.data?.status === 'open';
  const itemsCount = useMemo(
    () => (order.data?.items || []).reduce((s, i) => s + i.qty, 0),
    [order.data]
  );

  /** بعد أي تعديل بنحدّث الفاتورة والمنيو — لأن الأرصدة اتغيّرت */
  const refreshAll = async (result) => {
    if (result?.order) order.setData(result.order);
    else await order.reload();
    menu.reload();
    if (result?.shortages?.length) {
      push({
        tone: 'warn',
        message: t('order.shortageWarning', {
          names: result.shortages.map((s) => name(s)).join(t('common.listSeparator')),
        }),
      });
    }
  };

  const addItem = async (item, variant) => {
    clearError();
    try {
      const clientRequestId = `${id}-${item._id}-${variant?._id || 'base'}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      await refreshAll(
        await run(() =>
          api.post(`/orders/${id}/items`, {
            menuItemId: item._id,
            variantId: variant?._id,
            qty: 1,
            clientRequestId,
          })
        )
      );
      setVariantFor(null);
    } catch {
      /* معروض تحت */
    }
  };

  /** الصنف اللي ليه أنواع بيفتح نافذة اختيار الأول */
  const pickItem = (item) => {
    if (item.variants?.length) setVariantFor(item);
    else addItem(item, null);
  };

  const changeQty = async (item, qty) => {
    clearError();
    if (qty < 1) return setConfirm({ type: 'remove', item });
    try {
      await refreshAll(await run(() => api.patch(`/orders/${id}/items/${item._id}`, { qty })));
    } catch {
      /* معروض تحت */
    }
    return undefined;
  };

  if (order.loading) return <SkeletonTable rows={8} cols={4} />;
  if (order.error) return <ErrorState error={order.error} onRetry={order.reload} />;

  const o = order.data;
  const discountValue = (o.subtotal || 0) - (o.total || 0);
  const allTables = [o.tableId, ...(o.mergedTableIds || [])].filter(Boolean);

  /* ------------------------ الفاتورة ------------------------ */
  const bill = (
    <div className="flex h-full flex-col gap-3">
      {/* الطاولات اللي على الفاتورة */}
      {allTables.length > 1 && (
        <div className="rounded-xl border border-info/30 bg-info-soft p-3">
          <p className="mb-1 text-xs font-semibold text-info">{t('tables.mergedTables')}</p>
          <div className="flex flex-wrap gap-1">
            {allTables.map((tb, i) => (
              <span key={tb._id} className="chip">
                {t('tables.table')} {num(tb.number)}
                {isOpen && i > 0 && (
                  <button
                    type="button"
                    aria-label={t('tables.unmerge')}
                    className="opacity-60 hover:opacity-100"
                    onClick={() => setConfirm({ type: 'unmerge', table: tb })}
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 space-y-2">
        {o.items.length === 0 && <EmptyState icon="🧾" title={t('order.emptyBill')} hint="" />}

        {o.items.map((item) => (
          <div key={item._id} className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {name(item)}
                {item.variantNameAr && (
                  <span className="ms-1 text-xs font-normal text-muted">
                    ({name({ nameAr: item.variantNameAr, nameEn: item.variantNameEn })})
                  </span>
                )}
              </p>
              {/* كل جزء رقمي في عنصر لوحده — عشان الاتجاه مايتلغبطش في العربي */}
              <p className="flex flex-wrap items-center gap-1 text-xs text-muted">
                <span className="tabular-nums">{money(item.price)}</span>
                <span aria-hidden>×</span>
                <span className="tabular-nums">{num(item.qty)}</span>
                <span aria-hidden>=</span>
                <span className="tabular-nums font-semibold">{money(item.price * item.qty)}</span>
              </p>
            </div>

            {isOpen && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="btn-icon"
                  disabled={busy}
                  aria-label={t('common.qty')}
                  onClick={() => changeQty(item, item.qty - 1)}
                >
                  −
                </button>
                <span className="w-8 text-center text-sm font-bold tabular-nums">{num(item.qty)}</span>
                <button
                  type="button"
                  className="btn-icon"
                  disabled={busy}
                  aria-label={t('common.qty')}
                  onClick={() => changeQty(item, item.qty + 1)}
                >
                  +
                </button>
                <button
                  type="button"
                  className="btn-icon text-bad"
                  disabled={busy}
                  aria-label={t('order.remove')}
                  onClick={() => setConfirm({ type: 'remove', item })}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-2xl border border-line bg-surface p-3">
        <Row label={t('order.subtotal')} value={money(o.subtotal)} />
        {discountValue > 0 && <Row label={t('order.discount')} value={`− ${money(discountValue)}`} tone="warn" />}
        <div className="border-t border-line pt-2">
          <Row label={t('order.total')} value={money(o.total)} big />
        </div>

        <InlineError error={actionError} />

        {isOpen && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="btn-primary w-full"
              disabled={busy || o.items.length === 0}
              onClick={() => setPayOpen(true)}
            >
              {t('order.payAndClose')}
            </button>

            <button type="button" className="btn-ghost w-full" onClick={() => setMergeOpen(true)}>
              {t('tables.merge')}
            </button>

            {/* 🔒 الخصم والإلغاء للمدير بس */}
            {isManager && (
              <div className="flex gap-2">
                <button type="button" className="btn-ghost flex-1" onClick={() => setDiscountOpen(true)}>
                  {t('order.applyDiscount')}
                </button>
                <button type="button" className="btn-ghost flex-1 text-bad" onClick={() => setVoidOpen(true)}>
                  {t('order.void')}
                </button>
              </div>
            )}
          </div>
        )}

        {!isOpen && isManager && o.status === 'paid' && (
          <button type="button" className="btn-ghost w-full text-bad" onClick={() => setVoidOpen(true)}>
            {t('order.void')}
          </button>
        )}
      </div>
    </div>
  );

  /* ------------------------ المنيو كجدول ------------------------ */
  const menuPanel = (
    <div className="flex h-full flex-col gap-3">
      <SearchInput value={q} onChange={setQ} placeholder={t('common.searchPlaceholder')} />

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setCategoryId('')}
          className={`btn-sm shrink-0 rounded-full ${
            categoryId === '' ? 'bg-accent text-white' : 'border border-line bg-surface'
          }`}
        >
          {t('common.all')}
        </button>
        {(cats.data || []).map((c) => (
          <button
            key={c._id}
            type="button"
            onClick={() => setCategoryId(c._id)}
            className={`btn-sm shrink-0 rounded-full ${
              categoryId === c._id ? 'bg-accent text-white' : 'border border-line bg-surface'
            }`}
          >
            {name(c)}
          </button>
        ))}
      </div>

      <div className="card">
        {menu.loading && <SkeletonTable rows={8} cols={4} />}
        {!menu.loading && menu.data?.length === 0 && <EmptyState icon="☕" title={t('order.emptyMenu')} hint="" />}

        {!menu.loading && menu.data?.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="sticky-col">{t('common.item')}</th>
                  <th>{t('common.price')}</th>
                  <th>{t('recipes.available')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {menu.data.map((item) => {
                  const blocked = item.maxServings === 0;
                  const low = item.maxServings !== null && item.maxServings > 0 && item.maxServings <= 5;
                  return (
                    <tr key={item._id} className={blocked ? 'bg-bad-soft' : ''}>
                      <td className="sticky-col">
                        <span className="font-semibold">{name(item)}</span>
                        {item.variants?.length > 0 && (
                          <span className="ms-2 text-xs text-muted">
                            {item.variants.map((v) => name(v)).join(t('common.listSeparator'))}
                          </span>
                        )}
                      </td>
                      <td className="tabular-nums font-semibold text-accent">{money(item.price)}</td>
                      <td>
                        {blocked ? (
                          <span className="badge-out">{t('order.outOfStock')}</span>
                        ) : item.maxServings === null ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <span className={low ? 'badge-low' : 'badge-ok'}>{num(item.maxServings)}</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          disabled={blocked || busy || !isOpen}
                          onClick={() => pickItem(item)}
                        >
                          {t('order.addItem')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        title={`${t('tables.table')} ${allTables.map((x) => num(x.number)).join(' + ')}`}
        subtitle={`${t('order.orderNumber')} ${String(o._id).slice(-6).toUpperCase()} · ${t(
          `orderStatus.${o.status}`
        )} · ${date(o.openedAt)}`}
      >
        <button type="button" className="btn-ghost btn-sm" onClick={() => navigate('/tables')}>
          {t('common.back')}
        </button>
      </PageHeader>

      {/* موبايل: تبويبين */}
      <div className="mb-3 flex gap-2 lg:hidden">
        {['menu', 'bill'].map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setTab(x)}
            className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${
              tab === x ? 'bg-accent text-white' : 'border border-line bg-surface'
            }`}
          >
            {t(`order.tab${x === 'menu' ? 'Menu' : 'Bill'}`)}
            {x === 'bill' && itemsCount > 0 && <span className="ms-1 tabular-nums">({num(itemsCount)})</span>}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className={tab === 'menu' ? 'block' : 'hidden lg:block'}>{menuPanel}</div>
        <div className={tab === 'bill' ? 'block' : 'hidden lg:block'}>{bill}</div>
      </div>

      {/* ---------- اختيار النوع ---------- */}
      <VariantDialog
        item={variantFor}
        busy={busy}
        error={actionError}
        onClose={() => {
          setVariantFor(null);
          clearError();
        }}
        onPick={(v) => addItem(variantFor, v)}
      />

      {/* ---------- دمج الطاولات ---------- */}
      <MergeDialog
        open={mergeOpen}
        tables={tables.data || []}
        currentIds={allTables.map((x) => String(x._id))}
        busy={busy}
        error={actionError}
        onClose={() => {
          setMergeOpen(false);
          clearError();
        }}
        onMerge={async (ids) => {
          try {
            const saved = await run(() => api.post(`/orders/${id}/merge`, { tableIds: ids }));
            order.setData(saved);
            setMergeOpen(false);
            tables.reload();
          } catch {
            /* معروض في النافذة */
          }
        }}
      />

      <ConfirmDialog
        open={confirm?.type === 'remove'}
        message={t('order.removeConfirm', { name: confirm?.item ? name(confirm.item) : '' })}
        confirmLabel={t('order.remove')}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          try {
            await refreshAll(await run(() => api.del(`/orders/${id}/items/${confirm.item._id}`)));
          } finally {
            setConfirm(null);
          }
        }}
      />

      <ConfirmDialog
        open={confirm?.type === 'unmerge'}
        message={t('tables.unmergeConfirm', { number: confirm?.table ? num(confirm.table.number) : '' })}
        confirmLabel={t('tables.unmerge')}
        danger={false}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          try {
            const saved = await run(() => api.post(`/orders/${id}/unmerge`, { tableId: confirm.table._id }));
            order.setData(saved);
            tables.reload();
          } finally {
            setConfirm(null);
          }
        }}
      />

      <PayDialog
        open={payOpen}
        order={o}
        busy={busy}
        error={actionError}
        onClose={() => setPayOpen(false)}
        onPay={async (paymentMethod) => {
          try {
            await run(() => api.post(`/orders/${id}/pay`, { paymentMethod }));
            setPayOpen(false);
            navigate('/tables');
          } catch {
            /* معروض في النافذة */
          }
        }}
      />

      <DiscountDialog
        open={discountOpen}
        busy={busy}
        error={actionError}
        onClose={() => setDiscountOpen(false)}
        onApply={async (body) => {
          try {
            const updated = await run(() => api.post(`/orders/${id}/discount`, body));
            order.setData(updated);
            setDiscountOpen(false);
          } catch {
            /* معروض في النافذة */
          }
        }}
      />

      <VoidDialog
        open={voidOpen}
        busy={busy}
        error={actionError}
        onClose={() => setVoidOpen(false)}
        onVoid={async (reason) => {
          try {
            await run(() => api.post(`/orders/${id}/void`, { reason }));
            setVoidOpen(false);
            navigate('/tables');
          } catch {
            /* معروض في النافذة */
          }
        }}
      />
    </div>
  );
}

function Row({ label, value, big, tone }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`text-sm ${big ? 'font-bold' : 'text-muted'}`}>{label}</span>
      <span
        className={`tabular-nums ${big ? 'text-lg font-bold' : 'text-sm font-semibold'} ${
          tone === 'warn' ? 'text-warn' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** اختيار نوع الصنف — سادة / مظبوط / زيادة، كل واحد بوصفته وسعره */
function VariantDialog({ item, busy, error, onClose, onPick }) {
  const { t, name, money, num } = useI18n();
  if (!item) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`${t('order.pickVariant')} — ${name(item)}`}
      footer={
        <button type="button" className="btn-ghost w-full" onClick={onClose} disabled={busy}>
          {t('common.cancel')}
        </button>
      }
    >
      <div className="space-y-2">
        <p className="text-xs text-muted">{t('order.pickVariantHint')}</p>

        {item.variants.map((v) => {
          const blocked = v.available === false || v.maxServings === 0;
          return (
            <button
              key={v._id}
              type="button"
              disabled={blocked || busy}
              onClick={() => onPick(v)}
              className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-start ${
                blocked ? 'cursor-not-allowed border-bad/30 bg-bad-soft opacity-70' : 'border-line hover:bg-surface2'
              }`}
            >
              <span className="font-semibold">{name(v)}</span>
              <span className="flex items-center gap-2">
                {blocked ? (
                  <span className="badge-out">{t('order.outOfStock')}</span>
                ) : (
                  v.maxServings !== null && <span className="badge-ok">{num(v.maxServings)}</span>
                )}
                <span className="tabular-nums font-bold text-accent">
                  {money(item.price + (v.priceDelta || 0))}
                </span>
              </span>
            </button>
          );
        })}

        <InlineError error={error} />
      </div>
    </Modal>
  );
}

/** دمج طاولات على نفس الفاتورة */
function MergeDialog({ open, tables, currentIds, busy, error, onClose, onMerge }) {
  const { t, num, money } = useI18n();
  const [picked, setPicked] = useState([]);

  if (!open) return null;

  const available = tables.filter((tb) => !currentIds.includes(String(tb._id)));
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Modal
      open
      onClose={() => {
        setPicked([]);
        onClose();
      }}
      title={t('tables.merge')}
      footer={
        <>
          <button
            type="button"
            className="btn-ghost flex-1"
            onClick={() => {
              setPicked([]);
              onClose();
            }}
            disabled={busy}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={busy || picked.length === 0}
            onClick={() => onMerge(picked)}
          >
            {busy ? t('common.saving') : t('tables.merge')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">{t('tables.mergeHint')}</p>

        {available.length === 0 && <EmptyState icon="▦" title={t('tables.noFreeTables')} hint="" />}

        <div className="space-y-2">
          {available.map((tb) => (
            <label
              key={tb._id}
              className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-line px-3"
            >
              <input
                type="checkbox"
                checked={picked.includes(String(tb._id))}
                onChange={() => toggle(String(tb._id))}
              />
              <span className="flex-1 font-semibold">
                {t('tables.table')} {num(tb.number)}
              </span>
              {tb.openOrder ? (
                <span className="flex items-center gap-2">
                  <span className="badge-low">{t('tables.busy')}</span>
                  <span className="tabular-nums text-xs">{money(tb.openOrder.total)}</span>
                </span>
              ) : (
                <span className="badge-ok">{t('tables.free')}</span>
              )}
            </label>
          ))}
        </div>

        {picked.length > 0 && <p className="text-xs text-muted">{t('tables.mergeConfirm')}</p>}
        <InlineError error={error} />
      </div>
    </Modal>
  );
}

function PayDialog({ open, order, busy, error, onClose, onPay }) {
  const { t, money } = useI18n();
  const [method, setMethod] = useState('cash');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('order.pay')}
      footer={
        <>
          <button type="button" className="btn-ghost flex-1" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn-primary flex-1" onClick={() => onPay(method)} disabled={busy}>
            {busy ? t('common.saving') : t('order.payAndClose')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-2xl font-bold tabular-nums">{money(order?.total)}</p>

        <div>
          <span className="label">{t('filters.paymentMethod')}</span>
          <div className="grid grid-cols-3 gap-2">
            {['cash', 'card', 'wallet'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`btn ${method === m ? 'bg-accent text-white' : 'border border-line bg-surface'}`}
              >
                {t(`paymentMethods.${m}`)}
              </button>
            ))}
          </div>
        </div>

        <p className="text-sm text-muted">
          {t('order.payConfirm', { total: money(order?.total), method: t(`paymentMethods.${method}`) })}
        </p>

        <InlineError error={error} />
      </div>
    </Modal>
  );
}

function DiscountDialog({ open, busy, error, onClose, onApply }) {
  const { t } = useI18n();
  const [type, setType] = useState('percent');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('order.applyDiscount')}
      footer={
        <>
          <button type="button" className="btn-ghost flex-1" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={busy || value === ''}
            onClick={() => onApply({ type, value: Number(value), reason })}
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <span className="label">{t('order.discountType')}</span>
          <div className="grid grid-cols-2 gap-2">
            {['percent', 'amount'].map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setType(x)}
                className={`btn ${type === x ? 'bg-accent text-white' : 'border border-line bg-surface'}`}
              >
                {t(`order.${x}`)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="dv">
            {t('common.value')}
          </label>
          <input
            id="dv"
            type="number"
            inputMode="decimal"
            className="field tabular-nums"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="dr">
            {t('order.discountReason')}
          </label>
          <input id="dr" className="field" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>

        <InlineError error={error} />
      </div>
    </Modal>
  );
}

function VoidDialog({ open, busy, error, onClose, onVoid }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('order.void')}
      footer={
        <>
          <button type="button" className="btn-ghost flex-1" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-danger flex-1"
            disabled={busy || !reason.trim()}
            onClick={() => onVoid(reason.trim())}
          >
            {busy ? t('common.saving') : t('order.void')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm">{t('order.voidConfirm')}</p>
        <div>
          <label className="label" htmlFor="vr">
            {t('order.voidReason')}
          </label>
          <input id="vr" className="field" value={reason} onChange={(e) => setReason(e.target.value)} required />
        </div>
        <InlineError error={error} />
      </div>
    </Modal>
  );
}
