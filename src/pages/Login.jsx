import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { InlineError } from '../components/ui.jsx';

export default function Login() {
  const { t, lang, setLang } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigate('/tables', { replace: true }); // بعد الدخول: الطاولات على طول
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

        <form onSubmit={submit} className="card flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-bold">{t('app.name')}</h1>
            <p className="text-sm text-muted">{t('auth.subtitle')}</p>
          </div>

          <div>
            <label className="label" htmlFor="username">
              {t('auth.username')}
            </label>
            <input
              id="username"
              className="field"
              autoComplete="username"
              autoCapitalize="none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="password">
              {t('auth.password')}
            </label>
            <input
              id="password"
              type="password"
              className="field"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <InlineError error={error} />

          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? t('auth.signingIn') : t('auth.signIn')}
          </button>

          <Link to="/forgot-password" className="text-center text-xs text-accent underline">
            {t('reset.forgot')}
          </Link>
        </form>
      </div>
    </div>
  );
}
