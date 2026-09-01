import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

/**
 * تبويبات التنقّل.
 * 🔒 تبويبات المدير مش بتتبني أصلاً لو الدور ريسبشن — مش مجرد مخفية بـ CSS.
 */
function navItemsFor(role) {
  const common = [
    { to: '/tables', key: 'tables', icon: '▦' },
    { to: '/shift', key: 'myShift', icon: '◷' },
  ];
  if (role !== 'manager') return common;

  return [
    ...common,
    { to: '/dashboard', key: 'dashboard', icon: '◧' },
    { to: '/reports', key: 'reports', icon: '≣' },
    { to: '/inventory', key: 'inventory', icon: '▤' },
    { to: '/recipes', key: 'recipes', icon: '☕' },
    { to: '/stocktakes', key: 'stocktakes', icon: '✓' },
    { to: '/movements', key: 'movements', icon: '⇅' },
    { to: '/menu', key: 'menu', icon: '☰' },
    { to: '/staff', key: 'staff', icon: '☺' },
    { to: '/audit', key: 'audit', icon: '⏱' },
  ];
}

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  return [theme, setTheme];
}

export default function Layout() {
  const { t, lang, setLang } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme();
  const items = navItemsFor(user?.role);

  return (
    <div className="min-h-screen lg:flex">
      {/* ديسكتوب: sidebar ثابت */}
      <aside className="hidden w-60 shrink-0 border-e border-line bg-surface lg:flex lg:flex-col">
        <div className="border-b border-line p-4">
          <p className="text-base font-bold">{t('app.name')}</p>
          <p className="text-xs text-muted">{t('app.tagline')}</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {items.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              className={({ isActive }) =>
                `mb-1 flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${
                  isActive ? 'bg-accent text-white' : 'text-text hover:bg-surface2'
                }`
              }
            >
              <span aria-hidden className="w-5 text-center opacity-80">
                {i.icon}
              </span>
              {t(`nav.${i.key}`)}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <p className="text-xs text-muted">{t('auth.signedInAs')}</p>
          <p className="mb-2 text-sm font-semibold">
            {user?.name} · {t(`roles.${user?.role}`)}
          </p>
          <button
            type="button"
            className="btn-ghost btn-sm w-full"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            {t('auth.signOut')}
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        {/* هيدر: تبديل اللغة والمظهر */}
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-surface px-4 py-2">
          <p className="flex-1 truncate text-sm font-bold lg:hidden">{t('app.name')}</p>

          <button
            type="button"
            className="btn-icon text-xs font-bold"
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            aria-label={t('common.language')}
            title={t('common.language')}
          >
            {t('common.langSwitchLabel')}
          </button>

          <button
            type="button"
            className="btn-icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={t('common.theme')}
            title={t('common.theme')}
          >
            <span aria-hidden>{theme === 'dark' ? '☀' : '☾'}</span>
          </button>

          <button
            type="button"
            className="btn-icon lg:hidden"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            aria-label={t('auth.signOut')}
            title={t('auth.signOut')}
          >
            <span aria-hidden>⏻</span>
          </button>
        </header>

        <main className="flex-1 p-4 pb-24 lg:pb-6">
          <Outlet />
        </main>

        {/* موبايل وتابلت: شريط تنقّل تحت */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface lg:hidden">
          <div className="no-scrollbar flex overflow-x-auto">
            {items.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                className={({ isActive }) =>
                  `flex min-h-[56px] min-w-[76px] flex-1 flex-col items-center justify-center gap-0.5 px-2 text-[11px] font-semibold ${
                    isActive ? 'text-accent' : 'text-muted'
                  }`
                }
              >
                <span aria-hidden className="text-base">
                  {i.icon}
                </span>
                <span className="whitespace-nowrap">{t(`nav.${i.key}`)}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

/** عنوان صفحة موحّد + مكان للأزرار */
export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-lg font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
