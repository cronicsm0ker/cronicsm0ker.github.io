import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ChangeLeadStageRequest, LeadStage } from '@roofops/types';
import { LEAD_STAGE_TRANSITIONS } from '@roofops/types';
import { colors } from '@roofops/ui/tokens';
import { apiClient } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { StageBadge } from '../components/StageBadge';
import type { LeadsStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<LeadsStackParamList, 'LeadDetail'>;

export function LeadDetailScreen({ route }: Props) {
  const { leadId } = route.params;
  const queryClient = useQueryClient();

  const { data: lead } = useQuery({
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

  if (!lead) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.brand[500]} />
      </View>
    );
  }

  const allowed = LEAD_STAGE_TRANSITIONS[lead.stage];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{lead.contact.name}</Text>
            <Text style={styles.subtitle}>{lead.title ?? lead.source}</Text>
            <Text style={styles.contact}>
              {[lead.contact.email, lead.contact.phone].filter(Boolean).join(' · ') || '—'}
            </Text>
          </View>
          <StageBadge stage={lead.stage} />
        </View>

        <Text style={styles.sectionLabel}>Move to stage</Text>
        <View style={styles.stageRow}>
          {allowed.map((s: LeadStage) => (
            <TouchableOpacity
              key={s}
              style={[styles.stageBtn, s === 'LOST' && styles.stageBtnDanger]}
              onPress={() =>
                stageMutation.mutate(
                  s === 'LOST' ? { stage: s, lostReason: 'Marked from mobile' } : { stage: s },
                )
              }
              disabled={stageMutation.isPending}
            >
              <Text style={[styles.stageBtnText, s === 'LOST' && styles.stageBtnTextDanger]}>
                → {s}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {stageMutation.isError && (
          <Text style={styles.error}>
            {stageMutation.error instanceof Error ? stageMutation.error.message : 'Failed'}
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Activity</Text>
        {!activities?.items.length ? (
          <Text style={styles.empty}>No activity yet.</Text>
        ) : (
          activities.items.map((a) => (
            <View key={a.id} style={styles.activityRow}>
              <Text style={styles.activityKind}>{a.kind.replace(/_/g, ' ')}</Text>
              <Text style={styles.activityTime}>{formatDateTime(a.createdAt)}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  content: { padding: 16, gap: 12 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.neutral[0],
    borderRadius: 12,
    padding: 16,
    shadowColor: colors.neutral[900],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 18, fontWeight: '600', color: colors.neutral[900] },
  subtitle: { fontSize: 13, color: colors.neutral[600], marginTop: 2 },
  contact: { fontSize: 12, color: colors.neutral[600], marginTop: 6 },
  sectionLabel: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 11,
    fontWeight: '500',
    color: colors.neutral[600],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stageBtn: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.neutral[100],
  },
  stageBtnDanger: { backgroundColor: '#fee2e2' },
  stageBtnText: { fontSize: 12, color: colors.neutral[800] },
  stageBtnTextDanger: { color: colors.status.danger },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.neutral[900], marginBottom: 8 },
  activityRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.neutral[100] },
  activityKind: { fontSize: 13, color: colors.neutral[900] },
  activityTime: { fontSize: 11, color: colors.neutral[600], marginTop: 2 },
  empty: { fontSize: 13, color: colors.neutral[600] },
  error: { color: colors.status.danger, fontSize: 12, marginTop: 6 },
});
