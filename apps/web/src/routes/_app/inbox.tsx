import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatRelative } from '@/lib/format';

export const Route = createFileRoute('/_app/inbox')({
  component: InboxPage,
});

function InboxPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['threads'],
    queryFn: () => apiClient.listThreads({ limit: 100 }),
  });

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Inbox</h1>
        <p className="text-sm text-neutral-600 mt-1">
          {data?.items.length ?? 0} conversations across all channels
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Threads</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && (
            <div className="px-6 py-10 text-sm text-neutral-500">Loading…</div>
          )}
          {!isLoading && data?.items.length === 0 && (
            <div className="px-6 py-10 text-sm text-neutral-500">No conversations yet.</div>
          )}
          {data && data.items.length > 0 && (
            <ul className="divide-y divide-neutral-100">
              {data.items.map((thread) => (
                <li key={thread.id}>
                  <Link
                    to="/inbox/$threadId"
                    params={{ threadId: thread.id }}
                    className="flex items-center justify-between px-6 py-4 hover:bg-neutral-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-neutral-900">
                        {thread.channel}
                        {thread.unreadCount > 0 && (
                          <span className="ml-2 text-xs bg-brand-500 text-white rounded-full px-1.5 py-0.5">
                            {thread.unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-neutral-500 mt-1">
                        Contact {thread.contactId.slice(0, 8)}…
                      </div>
                    </div>
                    <div className="text-xs text-neutral-500 whitespace-nowrap ml-4">
                      {formatRelative(thread.lastMessageAt)}
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
