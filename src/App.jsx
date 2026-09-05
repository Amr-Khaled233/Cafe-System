import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import { useI18n } from './i18n/index.jsx';
import Layout from './components/Layout.jsx';
import { EmptyState } from './components/ui.jsx';

import Login from './pages/Login.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Tables from './pages/Tables.jsx';
import OrderScreen from './pages/OrderScreen.jsx';
import MyShift from './pages/MyShift.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Reports from './pages/Reports.jsx';
import Inventory from './pages/Inventory.jsx';
import Recipes from './pages/Recipes.jsx';
import Stocktakes from './pages/Stocktakes.jsx';
import StocktakeDetail from './pages/StocktakeDetail.jsx';
import Movements from './pages/Movements.jsx';
import MenuAdmin from './pages/MenuAdmin.jsx';
import Staff from './pages/Staff.jsx';
import Expenses from './pages/Expenses.jsx';
import Daily from './pages/Daily.jsx';
import AuditLog from './pages/AuditLog.jsx';

function FullScreenLoader() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted">{t('common.loading')}</div>
  );
}

/** لازم تكون مسجّل دخول */
function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

/**
 * 🔒 صفحات المدير.
 * الواجهة بتمنع الوصول، والسيرفر بيمنع البيانات — الاتنين مع بعض.
 */
function RequireManager({ children }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'manager') return <EmptyState icon="⛔" title={t('common.noPermission')} hint="" />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      {/* الصفحتين دول بره الحماية — الموظف اللي نسي باسورده مش داخل أصلاً */}
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route
        path="/login"
        element={loading ? <FullScreenLoader /> : user ? <Navigate to="/tables" replace /> : <Login />}
      />

      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        {/* الدورين */}
        <Route path="/tables" element={<Tables />} />
        <Route path="/orders/:id" element={<OrderScreen />} />
        <Route path="/shift" element={<MyShift />} />

        {/* مدير بس */}
        <Route path="/dashboard" element={<RequireManager><Dashboard /></RequireManager>} />
        <Route path="/reports" element={<RequireManager><Reports /></RequireManager>} />
        <Route path="/inventory" element={<RequireManager><Inventory /></RequireManager>} />
        <Route path="/recipes" element={<RequireManager><Recipes /></RequireManager>} />
        <Route path="/stocktakes" element={<RequireManager><Stocktakes /></RequireManager>} />
        <Route path="/stocktakes/:id" element={<RequireManager><StocktakeDetail /></RequireManager>} />
        <Route path="/movements" element={<RequireManager><Movements /></RequireManager>} />
        <Route path="/menu" element={<RequireManager><MenuAdmin /></RequireManager>} />
        <Route path="/staff" element={<RequireManager><Staff /></RequireManager>} />
        <Route path="/daily" element={<RequireManager><Daily /></RequireManager>} />
        <Route path="/expenses" element={<RequireManager><Expenses /></RequireManager>} />
        <Route path="/audit" element={<RequireManager><AuditLog /></RequireManager>} />
      </Route>

      {/* أي حد بيدخل بيروح على الطاولات على طول */}
      <Route path="*" element={<Navigate to="/tables" replace />} />
    </Routes>
  );
}
