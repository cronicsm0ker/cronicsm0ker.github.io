import { StyleSheet, Text, View } from 'react-native';
import type { LeadStage } from '@roofops/types';
import { colors } from '@roofops/ui/tokens';

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

const STAGE_PALETTE: Record<LeadStage, { bg: string; fg: string }> = {
  NEW: { bg: '#e0f2fe', fg: colors.status.info },
  CONTACTED: { bg: colors.brand[100], fg: colors.brand[700] },
  QUALIFIED: { bg: colors.brand[100], fg: colors.brand[700] },
  ESTIMATING: { bg: '#fef3c7', fg: '#92400e' },
  PROPOSAL_SENT: { bg: '#fef3c7', fg: '#92400e' },
  WON: { bg: '#dcfce7', fg: colors.status.success },
  LOST: { bg: '#fee2e2', fg: colors.status.danger },
  DORMANT: { bg: colors.neutral[100], fg: colors.neutral[600] },
};

export function StageBadge({ stage }: { stage: LeadStage }) {
  const palette = STAGE_PALETTE[stage];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.text, { color: palette.fg }]}>{STAGE_LABELS[stage]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  text: {
    fontSize: 11,
    fontWeight: '500',
  },
});
