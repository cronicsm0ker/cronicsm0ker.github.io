import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { GenerateProposalRequest } from '@roofops/types';
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
import { formatCents } from '@/lib/money';

export const Route = createFileRoute('/_app/leads/$leadId/proposals/new')({
  component: NewProposalPage,
});

function NewProposalPage() {
  const { leadId } = Route.useParams();
  const navigate = useNavigate();
  const [jobType, setJobType] = useState('');
  const [scopeHints, setScopeHints] = useState('');

  const generateMutation = useMutation({
    mutationFn: (req: GenerateProposalRequest) => apiClient.generateProposal(req),
    onSuccess: async (result) => {
      await navigate({
        to: '/proposals/$id',
        params: { id: result.proposal.id },
      });
    },
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    generateMutation.mutate({
      leadId,
      jobType,
      scopeHints: scopeHints || undefined,
    });
  }

  const generated = generateMutation.data;

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-4">
      <div>
        <Link
          to="/leads/$leadId"
          params={{ leadId }}
          className="text-sm text-brand-600 hover:underline"
        >
          ← Lead
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generate proposal with AI</CardTitle>
          <CardDescription>
            Pulls the price book, measurements, and contact info from this lead and produces a draft proposal in DRAFT status. Review and edit before sending.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="jobType">Job type</Label>
              <Input
                id="jobType"
                placeholder="e.g. Reroof — asphalt shingle"
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="scope">Scope hints (optional)</Label>
              <textarea
                id="scope"
                className="w-full min-h-[80px] rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                placeholder="2,400 sq ft, 6:12 pitch, two-layer tear-off, ice-and-water in valleys…"
                value={scopeHints}
                onChange={(e) => setScopeHints(e.target.value)}
              />
            </div>
            {generateMutation.isError && (
              <div className="text-sm text-danger">
                {generateMutation.error instanceof Error
                  ? generateMutation.error.message
                  : 'Generation failed'}
              </div>
            )}
            <Button type="submit" loading={generateMutation.isPending}>
              Generate draft
            </Button>
          </CardContent>
        </form>
      </Card>

      {generated && (
        <Card>
          <CardHeader>
            <CardTitle>Generation summary</CardTitle>
            <CardDescription>
              Model: {generated.generation.modelUsed} · Confidence:{' '}
              <span
                className={
                  generated.generation.confidence >= 70 ? 'text-success' : 'text-warning'
                }
              >
                {generated.generation.confidence}%
              </span>{' '}
              · Cache hit: {generated.generation.cacheReadTokens} tokens
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              Total{' '}
              <span className="font-semibold">
                {formatCents(generated.proposal.currentVersion?.totalCents ?? '0')}
              </span>{' '}
              · Deposit{' '}
              <span className="font-semibold">
                {formatCents(generated.proposal.currentVersion?.depositCents ?? '0')}
              </span>
            </div>
            {generated.generation.reviewNotes.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-neutral-600 mb-1">
                  Review notes from AI
                </div>
                <ul className="list-disc pl-5 text-sm text-neutral-800 space-y-1">
                  {generated.generation.reviewNotes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
