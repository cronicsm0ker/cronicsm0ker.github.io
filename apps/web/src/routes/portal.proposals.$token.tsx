import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatCents, bpsToPercent } from '@/lib/money';
import { formatDateTime } from '@/lib/format';

export const Route = createFileRoute('/portal/proposals/$token')({
  component: PublicProposalPage,
});

function PublicProposalPage() {
  const { token } = Route.useParams();
  const queryClient = useQueryClient();
  const [signerName, setSignerName] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [mode, setMode] = useState<'view' | 'accept' | 'reject'>('view');

  const { data: proposal, isLoading, isError, error } = useQuery({
    queryKey: ['public-proposal', token],
    queryFn: () => apiClient.getPublicProposal(token),
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: () => apiClient.acceptPublicProposal(token, { signerName }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['public-proposal', token] });
      setMode('view');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => apiClient.rejectPublicProposal(token, rejectionReason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['public-proposal', token] });
      setMode('view');
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <p className="text-neutral-600">Loading proposal…</p>
      </div>
    );
  }

  if (isError || !proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Proposal unavailable</CardTitle>
            <CardDescription>
              {error instanceof Error
                ? error.message
                : 'This proposal could not be found. Please contact your contractor for an updated link.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const snapshot = proposal.snapshot;
  const isClosed =
    proposal.status === 'ACCEPTED' ||
    proposal.status === 'REJECTED' ||
    proposal.status === 'EXPIRED' ||
    proposal.status === 'WITHDRAWN';

  function onAccept(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!signerName.trim()) return;
    acceptMutation.mutate();
  }

  function onReject(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!rejectionReason.trim()) return;
    rejectMutation.mutate();
  }

  return (
    <div className="min-h-screen bg-neutral-50 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="text-center">
          <div className="text-2xl font-semibold text-brand-600">{proposal.orgName}</div>
          <div className="text-sm text-neutral-600 mt-1">Proposal for {snapshot.contactSnapshot.name}</div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div>
                <CardTitle>{snapshot.title}</CardTitle>
                <CardDescription>
                  {proposal.expiresAt && proposal.status !== 'ACCEPTED' && (
                    <>Valid until {formatDateTime(proposal.expiresAt)}</>
                  )}
                </CardDescription>
              </div>
              <span
                className={
                  proposal.status === 'ACCEPTED'
                    ? 'inline-flex rounded-md bg-success/10 text-success px-2 py-1 text-xs font-medium'
                    : proposal.status === 'REJECTED'
                      ? 'inline-flex rounded-md bg-danger/10 text-danger px-2 py-1 text-xs font-medium'
                      : 'inline-flex rounded-md bg-brand-100 text-brand-700 px-2 py-1 text-xs font-medium'
                }
              >
                {proposal.status}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm whitespace-pre-wrap text-neutral-800 leading-relaxed">
              {snapshot.scopeOfWork}
            </p>

            <div className="grid grid-cols-3 gap-3 border-t border-neutral-200 pt-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-neutral-500">Subtotal</div>
                <div className="text-sm text-neutral-900 mt-1">{formatCents(snapshot.subtotalCents)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-neutral-500">
                  Tax ({bpsToPercent(snapshot.taxRateBps)})
                </div>
                <div className="text-sm text-neutral-900 mt-1">{formatCents(snapshot.taxCents)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-neutral-500">Total</div>
                <div className="text-xl font-semibold text-neutral-900 mt-1">
                  {formatCents(snapshot.totalCents)}
                </div>
              </div>
            </div>

            <div className="rounded-md bg-brand-50 border border-brand-100 p-3 text-sm">
              <span className="text-neutral-700">
                Deposit due on acceptance ({bpsToPercent(snapshot.depositPercentBps)}):
              </span>{' '}
              <span className="font-semibold text-brand-700">
                {formatCents(snapshot.depositCents)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What's included</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-y border-neutral-200">
                <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-6 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 font-medium">Quantity</th>
                  <th className="px-6 py-2 font-medium text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {snapshot.lineItems.map((li, i) => (
                  <tr key={i}>
                    <td className="px-6 py-3">
                      <div className="font-medium text-neutral-900">{li.name}</div>
                      {li.description && (
                        <div className="text-xs text-neutral-600 mt-1">{li.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      {li.quantity} {li.unit}
                    </td>
                    <td className="px-6 py-3 text-right font-medium text-neutral-900">
                      {formatCents(li.subtotalCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {snapshot.termsText && (
          <Card>
            <CardHeader>
              <CardTitle>Terms</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap text-neutral-700 leading-relaxed">
                {snapshot.termsText}
              </p>
            </CardContent>
          </Card>
        )}

        {!isClosed && mode === 'view' && (
          <Card>
            <CardContent className="p-6 flex flex-col sm:flex-row gap-3 items-center justify-between">
              <p className="text-sm text-neutral-700">
                Ready to accept this proposal? Your deposit becomes due on acceptance.
              </p>
              <div className="flex gap-2">
                <Button size="lg" onClick={() => setMode('accept')}>
                  Accept proposal
                </Button>
                <Button variant="secondary" size="lg" onClick={() => setMode('reject')}>
                  Decline
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!isClosed && mode === 'accept' && (
          <Card>
            <CardHeader>
              <CardTitle>Accept proposal</CardTitle>
              <CardDescription>
                Type your full name to sign. By accepting, you agree to the scope and terms above.
              </CardDescription>
            </CardHeader>
            <form onSubmit={onAccept}>
              <CardContent className="space-y-3">
                <div>
                  <Label htmlFor="signerName">Full legal name</Label>
                  <Input
                    id="signerName"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                {acceptMutation.isError && (
                  <div className="text-sm text-danger">
                    {acceptMutation.error instanceof Error
                      ? acceptMutation.error.message
                      : 'Acceptance failed'}
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setMode('view')}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" loading={acceptMutation.isPending}>
                    Sign &amp; accept
                  </Button>
                </div>
              </CardContent>
            </form>
          </Card>
        )}

        {!isClosed && mode === 'reject' && (
          <Card>
            <CardHeader>
              <CardTitle>Decline proposal</CardTitle>
              <CardDescription>
                Let your contractor know why so they can follow up.
              </CardDescription>
            </CardHeader>
            <form onSubmit={onReject}>
              <CardContent className="space-y-3">
                <div>
                  <Label htmlFor="reason">Reason</Label>
                  <textarea
                    id="reason"
                    className="w-full min-h-[100px] rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    autoFocus
                    required
                    minLength={1}
                  />
                </div>
                {rejectMutation.isError && (
                  <div className="text-sm text-danger">
                    {rejectMutation.error instanceof Error
                      ? rejectMutation.error.message
                      : 'Rejection failed'}
                  </div>
                )}
                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setMode('view')}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="danger" loading={rejectMutation.isPending}>
                    Send decline
                  </Button>
                </div>
              </CardContent>
            </form>
          </Card>
        )}

        {proposal.status === 'ACCEPTED' && (
          <Card>
            <CardContent className="p-6 text-center">
              <div className="text-2xl">✓</div>
              <div className="text-lg font-semibold text-success mt-2">Proposal accepted</div>
              <div className="text-sm text-neutral-600 mt-1">
                {proposal.acceptedAt
                  ? `Signed on ${formatDateTime(proposal.acceptedAt)}`
                  : 'Thank you — your contractor will be in touch with next steps.'}
              </div>
            </CardContent>
          </Card>
        )}

        {proposal.status === 'REJECTED' && (
          <Card>
            <CardContent className="p-6 text-center">
              <div className="text-sm text-neutral-600">
                You declined this proposal. If you change your mind, ask your contractor for a fresh link.
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
