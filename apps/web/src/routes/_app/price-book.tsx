import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { PriceBookItemInput, PriceBookKind } from '@roofops/types';
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
import { parseCsv } from '@/lib/csv';

export const Route = createFileRoute('/_app/price-book')({
  component: PriceBookPage,
});

function formatCents(cents: string): string {
  const n = Number(cents);
  if (Number.isNaN(n)) return cents;
  return `$${(n / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PriceBookPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<PriceBookItemInput>({
    kind: 'MATERIAL',
    name: '',
    unit: 'sqft',
    unitCostCents: 0,
    markupBps: 3000,
    wasteFactorBps: 1000,
  });
  const [showCsv, setShowCsv] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importResult, setImportResult] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['price-book', { search }],
    queryFn: () => apiClient.listPriceBook({ search: search || undefined }),
  });

  const createMutation = useMutation({
    mutationFn: (input: PriceBookItemInput) => apiClient.createPriceBookItem(input),
    onSuccess: () => {
      setDraft({
        kind: 'MATERIAL',
        name: '',
        unit: 'sqft',
        unitCostCents: 0,
        markupBps: 3000,
        wasteFactorBps: 1000,
      });
      void queryClient.invalidateQueries({ queryKey: ['price-book'] });
    },
  });

  const importMutation = useMutation({
    mutationFn: (rows: Record<string, unknown>[]) => apiClient.importPriceBook(rows),
    onSuccess: (res) => {
      setImportResult(
        `Imported: ${res.inserted} new, ${res.updated} updated, ${res.errors.length} errors`,
      );
      setCsvText('');
      void queryClient.invalidateQueries({ queryKey: ['price-book'] });
    },
    onError: (err) => {
      setImportResult(err instanceof Error ? err.message : 'Import failed');
    },
  });

  function onCreateSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    createMutation.mutate(draft);
  }

  function onCsvSubmit() {
    if (!csvText.trim()) return;
    const { rows } = parseCsv(csvText);
    if (rows.length === 0) {
      setImportResult('No rows found in CSV');
      return;
    }
    // Coerce numeric fields so PriceBookItemInputSchema accepts them.
    const coerced = rows.map((r) => ({
      ...r,
      unitCostCents: r['unitCostCents'] ? Number(r['unitCostCents']) : undefined,
      markupBps: r['markupBps'] ? Number(r['markupBps']) : undefined,
      wasteFactorBps: r['wasteFactorBps'] ? Number(r['wasteFactorBps']) : undefined,
    }));
    importMutation.mutate(coerced);
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Price book</h1>
          <p className="text-sm text-neutral-600 mt-1">
            {data?.items.length ?? 0} items — materials, labor, fees
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setShowCsv((v) => !v)}>
          {showCsv ? 'Hide' : 'Import CSV'}
        </Button>
      </div>

      <Input
        placeholder="Search by name or SKU"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {showCsv && (
        <Card>
          <CardHeader>
            <CardTitle>Paste CSV</CardTitle>
            <CardDescription>
              Columns: kind, name, unit, unitCostCents, markupBps, wasteFactorBps, sku, description.
              Existing items with the same name are updated.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <textarea
              className="w-full h-32 rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={'kind,name,unit,unitCostCents,markupBps,wasteFactorBps\nMATERIAL,Asphalt shingle 30yr,sqft,12000,3000,1500'}
            />
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                onClick={onCsvSubmit}
                loading={importMutation.isPending}
                disabled={!csvText.trim()}
              >
                Import
              </Button>
              {importResult && <span className="text-xs text-neutral-700">{importResult}</span>}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add item</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreateSubmit} className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label htmlFor="kind">Kind</Label>
              <select
                id="kind"
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as PriceBookKind })}
                className="flex h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm"
              >
                <option value="MATERIAL">Material</option>
                <option value="LABOR">Labor</option>
                <option value="FEE">Fee</option>
              </select>
            </div>
            <div className="col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="cost">Cost (cents)</Label>
              <Input
                id="cost"
                type="number"
                min={0}
                value={String(draft.unitCostCents)}
                onChange={(e) => setDraft({ ...draft, unitCostCents: Number(e.target.value) })}
                required
              />
            </div>
            <div>
              <Label htmlFor="markup">Markup (bps)</Label>
              <Input
                id="markup"
                type="number"
                min={0}
                value={String(draft.markupBps)}
                onChange={(e) => setDraft({ ...draft, markupBps: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="waste">Waste (bps)</Label>
              <Input
                id="waste"
                type="number"
                min={0}
                value={String(draft.wasteFactorBps)}
                onChange={(e) => setDraft({ ...draft, wasteFactorBps: Number(e.target.value) })}
              />
            </div>
            <div className="col-span-1 flex items-end">
              <Button type="submit" loading={createMutation.isPending} className="w-full">
                Add
              </Button>
            </div>
            {createMutation.isError && (
              <div className="col-span-full text-xs text-danger">
                {createMutation.error instanceof Error
                  ? createMutation.error.message
                  : 'Create failed'}
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Kind</th>
              <th className="px-4 py-3 font-medium">Unit</th>
              <th className="px-4 py-3 font-medium text-right">Cost</th>
              <th className="px-4 py-3 font-medium text-right">Markup</th>
              <th className="px-4 py-3 font-medium text-right">Waste</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && data?.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  No items yet.
                </td>
              </tr>
            )}
            {(data?.items ?? []).map((item) => (
              <tr key={item.id} className="hover:bg-neutral-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-neutral-900">{item.name}</div>
                  {item.sku && (
                    <div className="text-xs text-neutral-500">{item.sku}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-700">{item.kind}</td>
                <td className="px-4 py-3 text-neutral-700">{item.unit}</td>
                <td className="px-4 py-3 text-right text-neutral-900">
                  {formatCents(item.unitCostCents)}
                </td>
                <td className="px-4 py-3 text-right text-neutral-700">
                  {(item.markupBps / 100).toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-right text-neutral-700">
                  {(item.wasteFactorBps / 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
