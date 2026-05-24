import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LeadStage } from '@roofops/types';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StageBadge, STAGE_OPTIONS } from '@/components/leads/StageBadge';
import { formatRelative } from '@/lib/format';

export const Route = createFileRoute('/_app/leads')({
  component: LeadsPage,
});

function LeadsPage() {
  const [stage, setStage] = useState<LeadStage | undefined>();
  const [search, setSearch] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['leads', { stage, search }],
    queryFn: () => apiClient.listLeads({ stage, search: search || undefined, limit: 50 }),
  });

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Leads</h1>
          <p className="text-sm text-neutral-600 mt-1">
            {data?.items.length ?? 0} {stage ? `in ${stage.toLowerCase()}` : 'across all stages'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(pendingSearch);
          }}
          className="flex-1 min-w-[240px]"
        >
          <Input
            placeholder="Search by name, email, or phone"
            value={pendingSearch}
            onChange={(e) => setPendingSearch(e.target.value)}
          />
        </form>
        <div className="flex items-center gap-1 flex-wrap">
          <Button
            variant={stage === undefined ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setStage(undefined)}
          >
            All
          </Button>
          {STAGE_OPTIONS.map((s) => (
            <Button
              key={s.value}
              variant={stage === s.value ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setStage(s.value)}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Stage</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-neutral-500">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && data?.items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-neutral-500">
                  No leads match.
                </td>
              </tr>
            )}
            {(data?.items ?? []).map((lead) => (
              <tr key={lead.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <Link to="/leads/$leadId" params={{ leadId: lead.id }} className="block">
                    <div className="font-medium text-neutral-900">{lead.contact.name}</div>
                    <div className="text-xs text-neutral-500">
                      {lead.contact.email ?? lead.contact.phone ?? '—'}
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3 text-neutral-700">{lead.source}</td>
                <td className="px-4 py-3">
                  <StageBadge stage={lead.stage} />
                </td>
                <td className="px-4 py-3 text-neutral-600">{formatRelative(lead.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
