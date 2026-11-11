import { bridgeFabricCallback } from '@microsoft/rayfin-auth-provider-fabric';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';
import { Toaster } from 'sonner';

import App from './App.tsx';
import { ErrorFallback } from './ErrorFallback.tsx';
import { AuthProvider } from './hooks/AuthContext.tsx';
import { ServiceContainer } from './services/ServiceContainer';

import './main.css';
import './styles/theme.css';
import './index.css';

// A page file failed to load: usually a tab opened before the last deploy, or one that lost its
// sign-in to the protected files. Reload once to get the current build; if that fails too, the
// error screen shows the cause instead of reloading in a loop.
window.addEventListener('vite:preloadError', () => {
  const last = Number(sessionStorage.getItem('reloadedAfterLoadError') ?? 0);
  if (Date.now() - last < 60_000) return;
  sessionStorage.setItem('reloadedAfterLoadError', String(Date.now()));
  window.location.reload();
});

// Backward compat: old Fabric Portal may redirect the popup to the bare origin
// with handoff params in the URL hash. Bridge the code to the opener and close.
if (bridgeFabricCallback()) {
  // Popup is closing — skip the rest of the bootstrap.
} else {
  // Initialize the service container (creates RayfinClient and services).
  await ServiceContainer.create();
  const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

  createRoot(document.getElementById('root')!).render(
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
