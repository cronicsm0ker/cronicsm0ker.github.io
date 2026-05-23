import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    const { refreshToken } = useAuthStore.getState();
    if (!refreshToken) {
      throw redirect({ to: '/login' });
    }
  },
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const clear = useAuthStore((s) => s.clear);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiClient.me(),
    retry: false,
  });

  useEffect(() => {
    if (data) {
      setSession({ user: data.user, memberships: data.memberships });
    }
  }, [data, setSession]);

  useEffect(() => {
    if (isError) {
      void navigate({ to: '/login' });
    }
  }, [isError, navigate]);

  async function onLogout() {
    await apiClient.logout().catch(() => undefined);
    clear();
    await navigate({ to: '/login' });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-lg font-semibold text-brand-600">RoofOps</div>
          <Button variant="ghost" onClick={() => void onLogout()}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>Phase 0 review checkpoint — you are signed in.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading && <p className="text-sm text-neutral-600">Loading your profile…</p>}
            {data && (
              <>
                <p className="text-sm text-neutral-700">
                  Signed in as <span className="font-medium">{data.user.email}</span>
                </p>
                <div>
                  <div className="text-sm font-medium text-neutral-800 mb-1">Organizations</div>
                  <ul className="text-sm text-neutral-700 space-y-1">
                    {data.memberships.map((m) => (
                      <li key={m.org.id}>
                        {m.org.name}{' '}
                        <span className="text-neutral-500">— {m.membership.role}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
