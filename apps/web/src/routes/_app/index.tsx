import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StageBadge, STAGE_OPTIONS } from '@/components/leads/StageBadge';
import { formatRelative } from '@/lib/format';

export const Route = createFileRoute('/_app/')({
  component: DashboardPage,
});

function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data: leads } = useQuery({
    queryKey: ['leads', { limit: 8 }],
    queryFn: () => apiClient.listLeads({ limit: 8 }),
  });
  const { data: threads } = useQuery({
    queryKey: ['threads', { limit: 6 }],
    queryFn: () => apiClient.listThreads({ limit: 6 }),
  });

  const stageCounts = (leads?.items ?? []).reduce<Record<string, number>>((acc, lead) => {
    acc[lead.stage] = (acc[lead.stage] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Dashboard</h1>
        <p className="text-sm text-neutral-600 mt-1">
          Welcome back{user ? `, ${user.email}` : ''}.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {STAGE_OPTIONS.slice(0, 4).map((stage) => (
          <Card key={stage.value}>
            <CardContent className="p-4">
              <div className="text-xs text-neutral-500 uppercase tracking-wide">{stage.label}</div>
              <div className="text-2xl font-semibold text-neutral-900 mt-1">
                {stageCounts[stage.value] ?? 0}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between flex-row">
          <div>
            <CardTitle>Recent leads</CardTitle>
            <CardDescription>The latest 8 across all stages.</CardDescription>
          </div>
          <Link to="/leads">
            <Button variant="secondary" size="sm">View all</Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {leads?.items.length === 0 ? (
            <div className="px-6 py-8 text-sm text-neutral-500">No leads yet.</div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {(leads?.items ?? []).map((lead) => (
                <li key={lead.id}>
                  <Link
                    to="/leads/$leadId"
                    params={{ leadId: lead.id }}
                    className="flex items-center justify-between px-6 py-3 hover:bg-neutral-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-neutral-900 truncate">
                        {lead.contact.name}
                      </div>
                      <div className="text-xs text-neutral-500 truncate">
                        {lead.title ?? lead.source} · {formatRelative(lead.createdAt)}
                      </div>
                    </div>
                    <StageBadge stage={lead.stage} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between flex-row">
          <div>
            <CardTitle>Inbox</CardTitle>
            <CardDescription>Most recent conversations.</CardDescription>
          </div>
          <Link to="/inbox">
            <Button variant="secondary" size="sm">Open inbox</Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {threads?.items.length === 0 ? (
            <div className="px-6 py-8 text-sm text-neutral-500">No conversations yet.</div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {(threads?.items ?? []).map((thread) => (
                <li key={thread.id}>
                  <Link
                    to="/inbox/$threadId"
                    params={{ threadId: thread.id }}
                    className="flex items-center justify-between px-6 py-3 hover:bg-neutral-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-neutral-700">
                        Channel: <span className="font-medium">{thread.channel}</span>
                        {thread.unreadCount > 0 && (
                          <span className="ml-2 text-xs bg-brand-500 text-white rounded-full px-1.5 py-0.5">
                            {thread.unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {formatRelative(thread.lastMessageAt)}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
