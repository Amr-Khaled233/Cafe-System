import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // عند التحميل بنسأل السيرفر مين انت — الكوكي هو اللي بيجاوب
  const refresh = useCallback(async () => {
    try {
      setUser(await api.get('/auth/me'));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      user,
      loading,
      isManager: user?.role === 'manager',
      refresh,
      async login(username, password) {
        const u = await api.post('/auth/login', { username, password });
        // بنعيد القراءة من /me عشان نجيب الشيفت المفتوح كمان
        await refresh();
        return u;
      },
      async logout() {
        await api.post('/auth/logout');
        setUser(null);
      },
    }),
    [user, loading, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
