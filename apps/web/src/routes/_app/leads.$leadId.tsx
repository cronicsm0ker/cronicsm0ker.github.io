import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ChangeLeadStageRequest, LeadStage } from '@roofops/types';
import { LEAD_STAGE_TRANSITIONS } from '@roofops/types';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StageBadge } from '@/components/leads/StageBadge';
import { formatDateTime, formatRelative } from '@/lib/format';

export const Route = createFileRoute('/_app/leads/$leadId')({
  component: LeadDetailPage,
});

function LeadDetailPage() {
  const { leadId } = Route.useParams();
  const queryClient = useQueryClient();

  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => apiClient.getLead(leadId),
  });

  const { data: activities } = useQuery({
    queryKey: ['lead', leadId, 'activities'],
    queryFn: () => apiClient.listLeadActivities(leadId, { limit: 50 }),
  });

  const stageMutation = useMutation({
    mutationFn: (req: ChangeLeadStageRequest) => apiClient.changeLeadStage(leadId, req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const [lostReason, setLostReason] = useState('');

  if (isLoading || !lead) {
    return <div className="p-8 text-sm text-neutral-500">Loading…</div>;
  }

  const allowedStages = LEAD_STAGE_TRANSITIONS[lead.stage];

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-4">
      <div>
        <Link to="/leads" className="text-sm text-brand-600 hover:underline">
          ← All leads
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>{lead.contact.name}</CardTitle>
              <div className="text-sm text-neutral-600 mt-1">
                {lead.title ?? lead.source}
              </div>
              <div className="text-xs text-neutral-500 mt-2">
                {[lead.contact.email, lead.contact.phone].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            <StageBadge stage={lead.stage} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Stat label="Source" value={lead.source} />
            <Stat label="Created" value={formatDateTime(lead.createdAt)} />
            <Stat label="First reply" value={formatRelative(lead.firstRespondedAt)} />
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
              Move to stage
            </div>
            <div className="flex flex-wrap gap-2">
              {allowedStages.map((s: LeadStage) => (
                <Button
                  key={s}
                  size="sm"
                  variant={s === 'LOST' ? 'danger' : 'secondary'}
                  onClick={() =>
                    stageMutation.mutate({
                      stage: s,
                      ...(s === 'LOST' && lostReason ? { lostReason } : {}),
                    })
                  }
                  disabled={stageMutation.isPending}
                >
                  → {s}
                </Button>
              ))}
            </div>
            {allowedStages.includes('LOST') && (
              <Input
                className="mt-2 max-w-md"
                placeholder="Reason if marking lost"
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
              />
            )}
            {stageMutation.isError && (
              <div className="text-xs text-danger mt-2">
                {stageMutation.error instanceof Error
                  ? stageMutation.error.message
                  : 'Stage change failed'}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!activities?.items.length ? (
            <div className="px-6 py-8 text-sm text-neutral-500">No activity yet.</div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {activities.items.map((a) => (
                <li key={a.id} className="px-6 py-3">
                  <div className="text-sm text-neutral-900">{a.kind.replace(/_/g, ' ')}</div>
                  <div className="text-xs text-neutral-500">{formatDateTime(a.createdAt)}</div>
                  {a.payload && (
                    <pre className="text-xs text-neutral-600 mt-1 whitespace-pre-wrap break-words">
                      {JSON.stringify(a.payload, null, 0)}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-sm text-neutral-900 mt-1">{value}</div>
    </div>
  );
}
