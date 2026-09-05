import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { api, qs } from '../api/client.js';
import { InlineError } from '../components/ui.jsx';

const TTL_MINUTES = 30;

/** الشاشة اللي بيوصلها الموظف من رابط الإيميل */
export default function ResetPassword() {
  const { t, lang, setLang } = useI18n();
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [state, setState] = useState('checking'); // checking | ready | invalid | done
  const [account, setAccount] = useState(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // بنتأكد من الرابط قبل ما نعرض الفورم — أحسن من إنه يكتب باسورد وبعدين يترفض
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setState('invalid');
        return;
      }
      try {
        const r = await api.get(`/auth/reset-password/check${qs({ token })}`);
        if (!cancelled) {
          setAccount(r);
          setState('ready');
        }
      } catch {
        if (!cancelled) setState('invalid');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const mismatch = confirm.length > 0 && password !== confirm;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/reset-password', { token, password });
      setState('done');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            className="btn-icon text-xs font-bold"
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            aria-label={t('common.language')}
          >
            {t('common.langSwitchLabel')}
          </button>
        </div>

        {state === 'checking' && (
          <div className="card text-center text-sm text-muted">{t('reset.checking')}</div>
        )}

        {state === 'invalid' && (
          <div className="card flex flex-col gap-3 text-center">
            <p className="text-2xl" aria-hidden>
              ⛔
            </p>
            <h1 className="text-lg font-bold text-bad">{t('reset.linkExpired')}</h1>
            <p className="text-sm text-muted">{t('reset.linkExpiredHint', { minutes: TTL_MINUTES })}</p>
            <Link to="/forgot-password" className="btn-primary mt-2">
              {t('reset.requestNew')}
            </Link>
          </div>
        )}

        {state === 'done' && (
          <div className="card flex flex-col gap-3 text-center">
            <p className="text-2xl" aria-hidden>
              ✓
            </p>
            <h1 className="text-lg font-bold text-good">{t('reset.done')}</h1>
            <p className="text-sm text-muted">{t('reset.doneHint')}</p>
            <Link to="/login" className="btn-primary mt-2">
              {t('reset.goLogin')}
            </Link>
          </div>
        )}

        {state === 'ready' && (
          <form onSubmit={submit} className="card flex flex-col gap-4">
            <div>
              <h1 className="text-lg font-bold">{t('reset.setTitle')}</h1>
              <p className="text-sm text-muted">{t('reset.setFor', { name: account?.name || '' })}</p>
            </div>

            <div>
              <label className="label" htmlFor="np">
                {t('reset.newPassword')}
              </label>
              <input
                id="np"
                type="password"
                className="field"
                autoComplete="new-password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="label" htmlFor="cp">
                {t('reset.confirmPassword')}
              </label>
              <input
                id="cp"
                type="password"
                className="field"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
              {mismatch && <p className="mt-1 text-xs font-semibold text-bad">{t('reset.mismatch')}</p>}
            </div>

            <InlineError error={error} />

            <button
              type="submit"
              className="btn-primary"
              disabled={busy || password.length < 6 || password !== confirm}
            >
              {busy ? t('common.saving') : t('reset.save')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
