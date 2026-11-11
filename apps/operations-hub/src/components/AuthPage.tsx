import { useState } from 'react';

import { MockSignInDialog } from '@/components/MockSignInDialog';
import { useAuth } from '@/hooks/AuthContext';

export function AuthPage() {
  const { signInWithFabric, signInLocally, fabricAuthEnabled } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mockDialogOpen, setMockDialogOpen] = useState(false);

  const handleFabricSignIn = async () => {
    setError(null);
    setIsLoading(true);

    try {
      await signInWithFabric();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to sign in with Fabric.'
      );
      setIsLoading(false);
    }
  };

  const handleMockSignIn = async (email: string) => {
    setError(null);
    setIsLoading(true);
    setMockDialogOpen(false);

    try {
      await signInLocally(email);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to sign in locally.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const msLogo = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 21 21"
      className="mr-2"
    >
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );

  const handleSignIn = fabricAuthEnabled
    ? handleFabricSignIn
    : () => setMockDialogOpen(true);

  const buttonLabel = isLoading
    ? fabricAuthEnabled
      ? 'Opening Fabric...'
      : 'Signing in...'
    : 'Sign in with Microsoft';

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-slate-950">
      <div className="pointer-events-none absolute -left-32 -top-32 size-[480px] rounded-full bg-indigo-600/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 size-[520px] rounded-full bg-teal-500/30 blur-3xl" />
      <div className="relative flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/95 p-8 shadow-2xl backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Contoso</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Operations Hub</h1>
          <p className="mt-2 text-sm text-slate-600">
            Dashboards, 3D assets, approvals and answers from your Fabric data. Sign in with your Microsoft Entra account through Fabric.
          </p>
          <button
            type="button"
            onClick={handleSignIn}
            disabled={isLoading}
            className="mt-6 flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {msLogo}
            {buttonLabel}
          </button>
          {error && <p className="mt-3 text-center text-sm text-rose-600">{error}</p>}
          <p className="mt-6 text-center text-[11px] text-slate-400">Synthetic demo data · workshop environment</p>
        </div>
      </div>

      {!fabricAuthEnabled && (
        <MockSignInDialog
          open={mockDialogOpen}
          onConfirm={handleMockSignIn}
          onCancel={() => setMockDialogOpen(false)}
        />
      )}
    </div>
  );
}
