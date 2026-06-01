import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

const Login = lazy(() => import('./pages/Login'));
const CustomerDashboard = lazy(() => import('./pages/CustomerDashboard'));
const ManagerDashboard = lazy(() => import('./pages/ManagerDashboard'));

function PrivateRoute({ children, role }) {
  const token = sessionStorage.getItem('token') || localStorage.getItem('token');
  const userRole = sessionStorage.getItem('role') || localStorage.getItem('role');
  if (!token) return <Navigate to="/" replace />;
  if (role && userRole !== role) return <Navigate to="/" replace />;
  return children;
}

function PageLoader() {
  return <div className="app-suspense-fallback" aria-hidden="true" />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Suspense fallback={<PageLoader />}><Login /></Suspense>} />
      <Route
        path="/customer"
        element={
          <PrivateRoute role="customer">
            <Suspense fallback={<PageLoader />}>
              <CustomerDashboard />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route
        path="/manager"
        element={
          <PrivateRoute role="manager">
            <Suspense fallback={<PageLoader />}>
              <ManagerDashboard />
            </Suspense>
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
