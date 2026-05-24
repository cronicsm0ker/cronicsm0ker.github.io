import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';

export const Route = createFileRoute('/_app/inbox/$threadId')({
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');

  const { data: messages } = useQuery({
    queryKey: ['thread', threadId, 'messages'],
    queryFn: () => apiClient.listThreadMessages(threadId, { limit: 100 }),
    refetchInterval: 8_000,
  });

  const sendMutation = useMutation({
    mutationFn: () => apiClient.sendMessage({ threadId, body }),
    onSuccess: () => {
      setBody('');
      void queryClient.invalidateQueries({ queryKey: ['thread', threadId, 'messages'] });
    },
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (body.trim().length === 0) return;
    sendMutation.mutate();
  }

  // Messages come back newest-first; flip for display so reading order is
  // oldest -> newest like a chat app.
  const ordered = [...(messages?.items ?? [])].reverse();

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-4">
      <div>
        <Link to="/inbox" className="text-sm text-brand-600 hover:underline">
          ← Inbox
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conversation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 max-h-[60vh] overflow-y-auto">
          {ordered.length === 0 ? (
            <div className="text-sm text-neutral-500">No messages yet.</div>
          ) : (
            ordered.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'rounded-lg px-3 py-2 max-w-md text-sm',
                  msg.direction === 'OUTBOUND'
                    ? 'bg-brand-500 text-white ml-auto'
                    : 'bg-neutral-100 text-neutral-900',
                )}
              >
                <div className="whitespace-pre-wrap break-words">{msg.body}</div>
                <div
                  className={cn(
                    'text-[10px] mt-1',
                    msg.direction === 'OUTBOUND' ? 'text-brand-100' : 'text-neutral-500',
                  )}
                >
                  {formatDateTime(msg.createdAt)} · {msg.status}
                  {msg.errorMessage && ` · ${msg.errorMessage}`}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={onSubmit} className="space-y-2">
            <textarea
              className="w-full min-h-[80px] rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              placeholder="Type a reply…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="flex items-center justify-between">
              {sendMutation.isError && (
                <span className="text-xs text-danger">
                  {sendMutation.error instanceof Error
                    ? sendMutation.error.message
                    : 'Send failed'}
                </span>
              )}
              <div className="ml-auto">
                <Button type="submit" loading={sendMutation.isPending}>
                  Send
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
