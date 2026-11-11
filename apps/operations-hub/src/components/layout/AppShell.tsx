import {
  Box,
  CalendarRange,
  ClipboardCheck,
  Lightbulb,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  ShieldCheck,
  Sparkles,
  Truck,
  Wrench,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

import { useAuth } from '@/hooks/AuthContext';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/planning', label: 'Planning', icon: CalendarRange },
  { to: '/approvals', label: 'Approvals', icon: ClipboardCheck },
  { to: '/maintenance', label: 'Maintenance', icon: Wrench },
  { to: '/assets', label: '3D assets', icon: Box },
  { to: '/procurement', label: 'Procurement', icon: Truck },
  { to: '/map', label: 'Map', icon: MapIcon },
  { to: '/ask', label: 'Ask the data', icon: Sparkles },
  { to: '/ideas', label: 'Ideas', icon: Lightbulb },
  { to: '/access', label: 'Access', icon: ShieldCheck },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-sky-500 to-teal-400 text-white shadow-md shadow-indigo-500/30">
        <Sparkles className="size-4.5" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-slate-900">Operations Hub</p>
        <p className="text-[11px] text-slate-500">Contoso</p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const initials = (user?.name || user?.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/60 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200/80 bg-white/90 px-4 py-5 backdrop-blur lg:flex">
        <Brand />
        <nav className="mt-8 flex flex-1 flex-col gap-1" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                  isActive ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-100' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-semibold text-white">{initials}</div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-900">{user?.name || 'Signed in'}</p>
              <p className="truncate text-[11px] text-slate-500">{user?.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Brand />
          <button type="button" onClick={() => void signOut()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Sign out">
            <LogOut className="size-4" />
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium',
                  isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                )
              }
            >
              <Icon className="size-3.5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="lg:pl-60">
        <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  );
}
