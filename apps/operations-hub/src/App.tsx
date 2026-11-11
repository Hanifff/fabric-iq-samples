import { lazy, Suspense, useEffect, useMemo } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';

import { AuthPage } from '@/components/AuthPage';
import { Skeleton } from '@/components/kit/Panel';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/hooks/AuthContext';
import { fabricBackend } from '@/ops/backend';
import { createOps } from '@/ops/logic';
import { OpsProvider } from '@/ops/OpsContext';
import { AuthCallback } from '@/pages/AuthCallback.tsx';

const load = {
  overview: () => import('@/pages/Overview'),
  planning: () => import('@/pages/Planning'),
  maintenance: () => import('@/pages/Maintenance'),
  procurement: () => import('@/pages/Procurement'),
  map: () => import('@/pages/MapPage'),
  ask: () => import('@/pages/Ask'),
  ideas: () => import('@/pages/Ideas'),
  approvals: () => import('@/pages/Approvals'),
  assets: () => import('@/pages/Assets3D'),
  access: () => import('@/pages/Access'),
};
const Overview = lazy(() => load.overview().then((m) => ({ default: m.Overview })));
const Planning = lazy(() => load.planning().then((m) => ({ default: m.Planning })));
const Maintenance = lazy(() => load.maintenance().then((m) => ({ default: m.Maintenance })));
const Procurement = lazy(() => load.procurement().then((m) => ({ default: m.Procurement })));
const MapPage = lazy(() => load.map().then((m) => ({ default: m.MapPage })));
const Ask = lazy(() => load.ask().then((m) => ({ default: m.Ask })));
const Ideas = lazy(() => load.ideas().then((m) => ({ default: m.Ideas })));
const Approvals = lazy(() => load.approvals().then((m) => ({ default: m.Approvals })));
const Assets3D = lazy(() => load.assets().then((m) => ({ default: m.Assets3D })));
const Access = lazy(() => load.access().then((m) => ({ default: m.Access })));

// Fetch every page's code soon after start, so switching pages later never depends on a download
// (the files are protected and an old tab may have lost its sign-in or point at a replaced build).
function usePrefetchPages() {
  useEffect(() => {
    const timer = setTimeout(() => Object.values(load).forEach((page) => void page().catch(() => {})), 1500);
    return () => clearTimeout(timer);
  }, []);
}

// Named approvers for processing control, set per deployment (RAYFIN_PUBLIC_APPROVERS in rayfin/.env).
// The same list is compiled into the data API rules; the backend, not this list, enforces it.
const APPROVERS = String(import.meta.env.VITE_RAYFIN_APPROVERS ?? '').split(/[\s,;]+/).filter(Boolean);

const PAGES = [
  { path: '/', element: <Overview /> },
  { path: '/planning', element: <Planning /> },
  { path: '/maintenance', element: <Maintenance /> },
  { path: '/procurement', element: <Procurement /> },
  { path: '/map', element: <MapPage /> },
  { path: '/ask', element: <Ask /> },
  { path: '/ideas', element: <Ideas /> },
  { path: '/approvals', element: <Approvals /> },
  { path: '/assets', element: <Assets3D /> },
  { path: '/access', element: <Access /> },
];

function PageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-72" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}

/** The route a visitor asked for before being sent to sign in. */
interface AuthRedirectState {
  from?: string;
}

/**
 * Resolves where to send a visitor after they sign in.
 *
 * Only same-origin application paths are accepted, so a crafted value cannot
 * send the visitor off-site, and the sign-in routes are rejected so sign-in
 * cannot loop.
 */
function resolveReturnPath(state: unknown): string {
  const from = (state as AuthRedirectState | null)?.from;

  if (typeof from !== 'string' || !from.startsWith('/')) return '/';
  if (from.startsWith('//') || from.startsWith('/\\')) return '/';
  if (
    from === '/auth' ||
    from.startsWith('/auth/') ||
    from.startsWith('/auth?')
  ) {
    return '/';
  }

  return from;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Carry the requested route through sign-in. Without this, a shared link
  // opened by a signed-out visitor always lands on the default page.
  if (!isAuthenticated) {
    const redirectState: AuthRedirectState = {
      from: `${location.pathname}${location.search}`,
    };
    return <Navigate to="/auth" replace state={redirectState} />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={resolveReturnPath(location.state)} replace />;
  }

  return <>{children}</>;
}

function App() {
  const ops = useMemo(() => createOps(fabricBackend(), APPROVERS), []);
  usePrefetchPages();
  return (
    <OpsProvider ops={ops}>
    <BrowserRouter>
      {/* ensure all new routes require auth */}
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          path="/auth"
          element={
            <PublicRoute>
              <AuthPage />
            </PublicRoute>
          }
        />
        {PAGES.map(({ path, element }) => (
          <Route
            key={path}
            path={path}
            element={
              <ProtectedRoute>
                <AppShell>
                  <Suspense fallback={<PageFallback />}>{element}</Suspense>
                </AppShell>
              </ProtectedRoute>
            }
          />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </OpsProvider>
  );
}

export default App;
