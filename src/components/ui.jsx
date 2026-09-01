import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useI18n } from '../i18n/index.jsx';

/* ---------------------------------------------------------------- *
 *  حالات التحميل والفراغ والخطأ — كل شاشة بتستخدمهم
 * ---------------------------------------------------------------- */

export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={`skeleton ${className}`} />;
}

export function SkeletonTable({ rows = 6, cols = 5 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-2">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-10 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}

export function EmptyState({ icon = '∅', title, hint }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <div className="text-3xl opacity-40">{icon}</div>
      <p className="font-semibold">{title || t('common.empty')}</p>
      <p className="max-w-xs text-sm text-muted">{hint || t('common.emptyHint')}</p>
    </div>
  );
}

/** كل رسالة خطأ بتقول السبب، ومعاها زرار يعمل حاجة فعلاً */
export function ErrorState({ error, onRetry }) {
  const { t, errorText } = useI18n();
  if (!error) return null;
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-bad/30 bg-bad-soft p-6 text-center">
      <p className="font-semibold text-bad">{t('errors.title')}</p>
      <p className="text-sm text-text">{errorText(error)}</p>
      {onRetry && (
        <button type="button" className="btn-ghost btn-sm" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

/** خطأ صغير جوّه فورم */
export function InlineError({ error }) {
  const { errorText } = useI18n();
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm font-semibold text-bad">
      {errorText(error)}
    </p>
  );
}

/* ---------------------------------------------------------------- *
 *  نافذة منبثقة + تأكيد العمليات المدمّرة
 * ---------------------------------------------------------------- */

export function Modal({ open, onClose, title, children, footer, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <button type="button" aria-hidden className="absolute inset-0 cursor-default" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl
                    border border-line bg-surface sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-md'}`}
      >
        {title && (
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-base font-bold">{title}</h2>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex gap-2 border-t border-line p-4">{footer}</div>}
      </div>
    </div>
  );
}

/** نافذة تأكيد بتقول اللي هيحصل بالظبط قبل أي عملية مدمّرة */
export function ConfirmDialog({ open, title, message, confirmLabel, danger = true, busy, onConfirm, onCancel }) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title || t('confirm.title')}
      footer={
        <>
          <button type="button" className="btn-ghost flex-1" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={`${danger ? 'btn-danger' : 'btn-primary'} flex-1`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? t('common.saving') : confirmLabel || t('confirm.proceed')}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed">{message}</p>
    </Modal>
  );
}

/* ---------------------------------------------------------------- *
 *  التنبيهات (toasts)
 * ---------------------------------------------------------------- */

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const push = useCallback((toast) => {
    const id = Math.random().toString(36).slice(2);
    setItems((x) => [...x, { id, ...toast }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), toast.ttl || 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((i) => (
          <div
            key={i.id}
            className={`pointer-events-auto w-full max-w-sm rounded-xl px-4 py-3 text-sm font-semibold shadow-lg
              ${i.tone === 'bad' ? 'bg-bad text-white' : i.tone === 'warn' ? 'bg-warn text-white' : 'bg-accent text-white'}`}
          >
            {i.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* ---------------------------------------------------------------- *
 *  كارت رقم + الفرق عن الفترة السابقة
 * ---------------------------------------------------------------- */

export function StatCard({ label, value, change, tone = 'default' }) {
  const { t, pct } = useI18n();
  const up = change > 0;
  const flat = change === 0 || change === undefined || change === null;

  return (
    <div className="card flex flex-col gap-1">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${tone === 'bad' ? 'text-bad' : ''}`}>{value}</p>
      {!flat && (
        <p className={`flex items-center gap-1 text-xs font-semibold ${up ? 'text-good' : 'text-bad'}`}>
          <span aria-hidden>{up ? '▲' : '▼'}</span>
          <span className="tabular-nums">{pct(Math.abs(change))}</span>
          <span className="font-normal text-muted">{t('dashboard.vsPrevious')}</span>
        </p>
      )}
    </div>
  );
}

/** زرار تصدير CSV — بيستخدم نفس فلاتر الشاشة */
export function ExportButton({ path, filename }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const { errorText } = useI18n();

  return (
    <button
      type="button"
      className="btn-ghost btn-sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api.download(path, filename);
        } catch (e) {
          push({ tone: 'bad', message: errorText(e) });
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? t('common.loading') : t('common.export')}
    </button>
  );
}
