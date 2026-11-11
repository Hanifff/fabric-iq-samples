// Local preview of the operations screens with in-memory data: no Fabric, no sign-in.
// Served only by the Vite dev server at /preview.html; `vite build` does not include it.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, NavLink, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';

import { memoryBackend } from './ops/backend';
import { createOps } from './ops/logic';
import { OpsProvider } from './ops/OpsContext';
import { Access } from './pages/Access';
import { Approvals } from './pages/Approvals';
import { Assets3D } from './pages/Assets3D';

import './main.css';

const ops = createOps(memoryBackend(), ['you@preview.local']);
await ops.seedAll();

const PAGES: [string, string, ReactElement][] = [
  ['/assets', '3D assets', <Assets3D />],
  ['/approvals', 'Approvals', <Approvals />],
  ['/access', 'Access', <Access />],
];

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } })}>
    <OpsProvider ops={ops}>
      <MemoryRouter initialEntries={['/assets']}>
        <div className="min-h-screen bg-slate-50 text-slate-900">
          <nav className="flex items-center gap-2 border-b border-slate-200 bg-white px-6 py-3 text-sm">
            <span className="mr-4 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">LOCAL PREVIEW · memory only</span>
            {PAGES.map(([to, label]) => (
              <NavLink key={to} to={to} className={({ isActive }) => `rounded-lg px-3 py-1.5 ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600'}`}>{label}</NavLink>
            ))}
          </nav>
          <main className="mx-auto max-w-[1400px] px-6 py-6">
            <Routes>{PAGES.map(([path, , element]) => <Route key={path} path={path} element={element} />)}</Routes>
          </main>
        </div>
      </MemoryRouter>
      <Toaster position="top-right" richColors />
    </OpsProvider>
  </QueryClientProvider>
);
