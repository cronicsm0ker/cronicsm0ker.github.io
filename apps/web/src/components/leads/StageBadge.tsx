import type { LeadStage } from '@roofops/types';
import { cn } from '@/lib/cn';

const STAGE_LABELS: Record<LeadStage, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  ESTIMATING: 'Estimating',
  PROPOSAL_SENT: 'Proposal sent',
  WON: 'Won',
  LOST: 'Lost',
  DORMANT: 'Dormant',
};

const STAGE_CLASSES: Record<LeadStage, string> = {
  NEW: 'bg-info/10 text-info',
  CONTACTED: 'bg-brand-100 text-brand-700',
  QUALIFIED: 'bg-brand-100 text-brand-700',
  ESTIMATING: 'bg-warning/10 text-yellow-700',
  PROPOSAL_SENT: 'bg-warning/10 text-yellow-700',
  WON: 'bg-success/10 text-success',
  LOST: 'bg-danger/10 text-danger',
  DORMANT: 'bg-neutral-100 text-neutral-600',
};

interface StageBadgeProps {
  stage: LeadStage;
  className?: string;
}

export function StageBadge({ stage, className }: StageBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        STAGE_CLASSES[stage],
        className,
      )}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}

export const STAGE_OPTIONS: { value: LeadStage; label: string }[] = (
  Object.keys(STAGE_LABELS) as LeadStage[]
).map((s) => ({ value: s, label: STAGE_LABELS[s] }));
