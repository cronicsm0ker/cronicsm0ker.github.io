import { createFileRoute, Outlet, redirect, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { AppShell } from '@/components/layout/AppShell';

// Pathless layout: guards every nested route on the presence of a refresh
// token and feeds the auth store with the /me payload so AppShell + nested
// routes can rely on it being populated.
export const Route = createFileRoute('/_app')({
  beforeLoad: () => {
    const { refreshToken } = useAuthStore.getState();
    if (!refreshToken) {
      throw redirect({ to: '/login' });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const clear = useAuthStore((s) => s.clear);

  const { data, isError } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiClient.me(),
    retry: false,
  });

  useEffect(() => {
    if (data) setSession({ user: data.user, memberships: data.memberships });
  }, [data, setSession]);

  useEffect(() => {
    if (isError) {
      clear();
      void navigate({ to: '/login' });
    }
  }, [isError, clear, navigate]);

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
