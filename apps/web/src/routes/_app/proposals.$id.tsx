import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatCents, bpsToPercent } from '@/lib/money';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';

export const Route = createFileRoute('/_app/proposals/$id')({
  component: ProposalDetailPage,
});

const STATUS_CLASSES: Record<string, string> = {
  DRAFT: 'bg-neutral-100 text-neutral-700',
  SENT: 'bg-info/10 text-info',
  VIEWED: 'bg-brand-100 text-brand-700',
  ACCEPTED: 'bg-success/10 text-success',
  REJECTED: 'bg-danger/10 text-danger',
  EXPIRED: 'bg-neutral-100 text-neutral-600',
  WITHDRAWN: 'bg-neutral-100 text-neutral-600',
};

function ProposalDetailPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [tokenLink, setTokenLink] = useState<string | null>(null);

  const { data: proposal, isLoading } = useQuery({
    queryKey: ['proposal', id],
    queryFn: () => apiClient.getProposal(id),
  });

  const sendMutation = useMutation({
    mutationFn: () => apiClient.sendProposal(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['proposal', id] });
    },
  });

  const rotateMutation = useMutation({
    mutationFn: () => apiClient.rotateProposalToken(id),
    onSuccess: (data) => {
      const url = `${window.location.origin}/portal/proposals/${data.token}`;
      setTokenLink(url);
      void navigator.clipboard?.writeText(url).catch(() => undefined);
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: () => apiClient.withdrawProposal(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['proposal', id] });
    },
  });

  if (isLoading || !proposal) {
    return <div className="p-8 text-sm text-neutral-500">Loading…</div>;
  }
  const snapshot = proposal.currentVersion?.snapshot;
  if (!snapshot) {
    return <div className="p-8 text-sm text-danger">Proposal has no current version</div>;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-4">
      <div>
        <Link
          to="/leads/$leadId"
          params={{ leadId: proposal.leadId }}
          className="text-sm text-brand-600 hover:underline"
        >
          ← Lead
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>{snapshot.title}</CardTitle>
              <CardDescription>
                v{proposal.currentVersion?.version} · Created{' '}
                {formatDateTime(proposal.createdAt)}
                {proposal.generatedByAi && (
                  <span className="ml-2 text-brand-600">
                    · AI · {proposal.aiConfidence ?? '?'}% confidence
                  </span>
                )}
              </CardDescription>
            </div>
            <span
              className={cn(
                'inline-flex items-center rounded-md px-2 py-1 text-xs font-medium',
                STATUS_CLASSES[proposal.status],
              )}
            >
              {proposal.status}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Stat label="Subtotal" value={formatCents(snapshot.subtotalCents)} />
            <Stat
              label={`Tax (${bpsToPercent(snapshot.taxRateBps)})`}
              value={formatCents(snapshot.taxCents)}
            />
            <Stat label="Total" value={formatCents(snapshot.totalCents)} emphasize />
            <Stat
              label={`Deposit (${bpsToPercent(snapshot.depositPercentBps)})`}
              value={formatCents(snapshot.depositCents)}
            />
          </div>

          {snapshot.aiReviewNotes && snapshot.aiReviewNotes.length > 0 && (
            <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
              <div className="text-xs uppercase tracking-wide text-yellow-700 mb-1">
                Review notes
              </div>
              <ul className="list-disc pl-5 text-sm text-neutral-800 space-y-1">
                {snapshot.aiReviewNotes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {proposal.status === 'DRAFT' && (
              <Button onClick={() => sendMutation.mutate()} loading={sendMutation.isPending}>
                Mark as sent
              </Button>
            )}
            {proposal.status !== 'WITHDRAWN' && proposal.status !== 'ACCEPTED' && (
              <Button
                variant="secondary"
                onClick={() => rotateMutation.mutate()}
                loading={rotateMutation.isPending}
              >
                Get share link
              </Button>
            )}
            {(proposal.status === 'DRAFT' || proposal.status === 'SENT' || proposal.status === 'VIEWED') && (
              <Button
                variant="danger"
                onClick={() => withdrawMutation.mutate()}
                loading={withdrawMutation.isPending}
              >
                Withdraw
              </Button>
            )}
          </div>

          {tokenLink && (
            <div className="text-xs text-neutral-700 break-all bg-neutral-50 border border-neutral-200 rounded p-2">
              <div className="text-neutral-500 mb-1">Customer link (copied to clipboard):</div>
              {tokenLink}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scope of work</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap text-neutral-800">{snapshot.scopeOfWork}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-y border-neutral-200">
              <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 font-medium">Qty</th>
                <th className="px-4 py-2 font-medium text-right">Unit cost</th>
                <th className="px-4 py-2 font-medium text-right">Markup</th>
                <th className="px-4 py-2 font-medium text-right">Waste</th>
                <th className="px-4 py-2 font-medium text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {snapshot.lineItems.map((li, i) => (
                <tr key={i}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-neutral-900">{li.name}</div>
                    <div className="text-xs text-neutral-500">{li.kind}</div>
                  </td>
                  <td className="px-4 py-2">
                    {li.quantity} {li.unit}
                  </td>
                  <td className="px-4 py-2 text-right">{formatCents(li.unitCostCents)}</td>
                  <td className="px-4 py-2 text-right">{bpsToPercent(li.markupBps)}</td>
                  <td className="px-4 py-2 text-right">{bpsToPercent(li.wasteFactorBps)}</td>
                  <td className="px-4 py-2 text-right font-medium">
                    {formatCents(li.subtotalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Terms</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap text-neutral-800">
            {snapshot.termsText || '(none)'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div
        className={cn(
          'mt-1',
          emphasize ? 'text-xl font-semibold text-neutral-900' : 'text-sm text-neutral-900',
        )}
      >
        {value}
      </div>
    </div>
  );
}
