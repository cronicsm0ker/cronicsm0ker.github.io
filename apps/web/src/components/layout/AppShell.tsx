import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '@/lib/auth-store';
import { apiClient } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';

interface AppShellProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', exact: true },
  { to: '/leads', label: 'Leads' },
  { to: '/inbox', label: 'Inbox' },
  { to: '/price-book', label: 'Price book' },
];

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const memberships = useAuthStore((s) => s.memberships);
  const clear = useAuthStore((s) => s.clear);

  const activeOrg = memberships[0]?.org;

  async function onLogout() {
    await apiClient.logout().catch(() => undefined);
    clear();
    await navigate({ to: '/login' });
  }

  return (
    <div className="min-h-screen flex bg-neutral-50">
      <aside className="w-56 border-r border-neutral-200 bg-white flex flex-col">
        <div className="px-6 py-5">
          <div className="text-lg font-semibold text-brand-600">RoofOps</div>
          {activeOrg && (
            <div className="text-xs text-neutral-500 mt-1 truncate">{activeOrg.name}</div>
          )}
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'block px-3 py-2 text-sm rounded-md transition-colors',
                  active
                    ? 'bg-brand-50 text-brand-700 font-medium'
                    : 'text-neutral-700 hover:bg-neutral-100',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-neutral-200">
          {user && (
            <div className="text-xs text-neutral-600 mb-2 truncate" title={user.email}>
              {user.email}
            </div>
          )}
          <Button variant="ghost" size="sm" className="w-full" onClick={() => void onLogout()}>
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
