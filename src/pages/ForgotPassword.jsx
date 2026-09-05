import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { api } from '../api/client.js';
import { InlineError } from '../components/ui.jsx';

/** الشاشة اللي بيطلب منها الموظف رابط تغيير الباسورد */
export default function ForgotPassword() {
  const { t, lang, setLang } = useI18n();
  const [value, setValue] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/forgot-password', { emailOrUsername: value.trim() });
      setSent(true);
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

        {sent ? (
          <div className="card flex flex-col gap-3 text-center">
            <p className="text-2xl" aria-hidden>
              ✉
            </p>
            <h1 className="text-lg font-bold">{t('reset.sent')}</h1>
            <p className="text-sm text-muted">{t('reset.sentHint')}</p>
            <Link to="/login" className="btn-primary mt-2">
              {t('reset.backToLogin')}
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="card flex flex-col gap-4">
            <div>
              <h1 className="text-lg font-bold">{t('reset.title')}</h1>
              <p className="text-sm text-muted">{t('reset.subtitle')}</p>
            </div>

            <div>
              <label className="label" htmlFor="who">
                {t('reset.field')}
              </label>
              <input
                id="who"
                className="field"
                autoCapitalize="none"
                autoComplete="username"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
              />
            </div>

            <InlineError error={error} />

            <button type="submit" className="btn-primary" disabled={busy || !value.trim()}>
              {busy ? t('reset.sending') : t('reset.send')}
            </button>

            <Link to="/login" className="text-center text-xs text-accent underline">
              {t('reset.backToLogin')}
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
