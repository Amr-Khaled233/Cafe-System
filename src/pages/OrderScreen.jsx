import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useApi, useAction } from '../hooks/useApi.js';
import { api, qs } from '../api/client.js';
import { PageHeader } from '../components/Layout.jsx';
import { SearchInput } from '../components/FilterBar.jsx';
import { ConfirmDialog, EmptyState, ErrorState, InlineError, Modal, Skeleton, useToast } from '../components/ui.jsx';

/** كارت صنف في المنيو — بيتقفل لو خاماته مش كفاية لكوب واحد */
function MenuCard({ item, onAdd, busy }) {
  const { t, name, money, num } = useI18n();
  const blocked = item.maxServings === 0;
  const low = item.maxServings !== null && item.maxServings > 0 && item.maxServings <= 5;

  return (
    <button
      type="button"
      disabled={blocked || busy}
      onClick={() => onAdd(item)}
      className={`flex min-h-[92px] flex-col items-start gap-1 rounded-2xl border p-3 text-start transition-colors
        ${blocked ? 'cursor-not-allowed border-bad/30 bg-bad-soft opacity-70' : 'border-line bg-surface hover:bg-surface2'}`}
    >
      <span className="text-sm font-semibold leading-tight">{name(item)}</span>
      <span className="text-sm font-bold tabular-nums text-accent">{money(item.price)}</span>

      {blocked && (
        <span className="mt-auto text-[11px] font-semibold text-bad">
          {t('order.outOfStock')}
          {item.missing?.length > 0 && (
            <>
              {' · '}
              {t('order.outOfStockReason', { names: item.missing.map((m) => name(m)).join(t('common.listSeparator')) })}
            </>
          )}
        </span>
      )}
      {!blocked && low && (
        <span className="mt-auto text-[11px] font-semibold text-warn">
          {t('order.servingsLeft', { n: num(item.maxServings) })}
        </span>
      )}
    </button>
  );
}

export default function OrderScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, name, money, date } = useI18n();
  const { isManager } = useAuth();
  const { push } = useToast();
  const { run, busy, error: actionError, clearError } = useAction();

  const [tab, setTab] = useState('menu'); // الموبايل بتبويبين
  const [categoryId, setCategoryId] = useState('');
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

  const order = useApi(`/orders/${id}`, [id]);
  const cats = useApi('/categories');
  const menu = useApi(`/menu${qs({ categoryId, q, available: 'true' })}`, [categoryId, q]);

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
        message: t('order.shortageWarning', { names: result.shortages.map((s) => name(s)).join(t('common.listSeparator')) }),
      });
    }
  };

  const addItem = async (item) => {
    clearError();
    try {
      // مفتاح فريد لكل ضغطة — لو الريكوست اتكرر بنفس المفتاح مايتخصمش تاني
      const clientRequestId = `${id}-${item._id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await refreshAll(await run(() => api.post(`/orders/${id}/items`, { menuItemId: item._id, qty: 1, clientRequestId })));
    } catch {
      /* معروض تحت */
    }
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

  const removeItem = async (item) => {
    try {
      await refreshAll(await run(() => api.del(`/orders/${id}/items/${item._id}`)));
      setConfirm(null);
    } catch {
      setConfirm(null);
    }
  };

  if (order.loading) return <Skeleton className="h-64" />;
  if (order.error) return <ErrorState error={order.error} onRetry={order.reload} />;

  const o = order.data;
  const discountValue = (o.subtotal || 0) - (o.total || 0);

  /* ------------------------ الفاتورة ------------------------ */
  const bill = (
    <div className="flex h-full flex-col gap-3">
      <div className="flex-1 space-y-2">
        {o.items.length === 0 && <EmptyState icon="🧾" title={t('order.emptyBill')} hint="" />}

        {o.items.map((item) => (
          <div key={item._id} className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{name(item)}</p>
              <p className="text-xs tabular-nums text-muted">
                {money(item.price)} × {item.qty} = {money(item.price * item.qty)}
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
                <span className="w-8 text-center text-sm font-bold tabular-nums">{item.qty}</span>
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

            {/* 🔒 الخصم والإلغاء للمدير بس — الزرار مش بيتبني أصلاً للريسبشن */}
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

  /* ------------------------ المنيو ------------------------ */
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

      {menu.loading && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {!menu.loading && menu.data?.length === 0 && <EmptyState icon="☕" title={t('order.emptyMenu')} hint="" />}

      {!menu.loading && menu.data?.length > 0 && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-4">
          {menu.data.map((item) => (
            <MenuCard key={item._id} item={item} onAdd={addItem} busy={busy || !isOpen} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title={`${t('tables.table')} ${o.tableId?.number ?? ''}`}
        subtitle={`${t('order.orderNumber')} ${String(o._id).slice(-6).toUpperCase()} · ${t(
          `orderStatus.${o.status}`
        )} · ${date(o.openedAt)}`}
      >
        <button type="button" className="btn-ghost btn-sm" onClick={() => navigate('/tables')}>
          {t('common.back')}
        </button>
      </PageHeader>

      {/* موبايل: تبويبين — منيو / فاتورة */}
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
            {x === 'bill' && itemsCount > 0 && <span className="ms-1 tabular-nums">({itemsCount})</span>}
          </button>
        ))}
      </div>

      {/* ديسكتوب وتابلت: مقسومة */}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className={tab === 'menu' ? 'block' : 'hidden lg:block'}>{menuPanel}</div>
        <div className={tab === 'bill' ? 'block' : 'hidden lg:block'}>{bill}</div>
      </div>

      {/* ---------- نوافذ التأكيد ---------- */}
      <ConfirmDialog
        open={confirm?.type === 'remove'}
        message={t('order.removeConfirm', { name: confirm ? name(confirm.item) : '' })}
        confirmLabel={t('order.remove')}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => removeItem(confirm.item)}
      />

      <PayDialog
        open={payOpen}
        order={o}
        busy={busy}
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
        error={actionError}
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
