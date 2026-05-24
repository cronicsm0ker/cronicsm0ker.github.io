import { useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '@roofops/ui/tokens';
import { apiClient } from '../lib/api';
import { formatRelative } from '../lib/format';
import { StageBadge } from '../components/StageBadge';
import type { LeadsStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<LeadsStackParamList, 'LeadsList'>;

export function LeadsScreen({ navigation }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const { data, refetch, isLoading } = useQuery({
    queryKey: ['leads', { limit: 50 }],
    queryFn: () => apiClient.listLeads({ limit: 50 }),
  });

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing || isLoading} onRefresh={() => void onRefresh()} />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          !isLoading ? <Text style={styles.empty}>No leads yet.</Text> : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('LeadDetail', { leadId: item.id })}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.name} numberOfLines={1}>
                {item.contact.name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {item.title ?? item.source} · {formatRelative(item.createdAt)}
              </Text>
            </View>
            <StageBadge stage={item.stage} />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  list: { paddingVertical: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.neutral[0],
  },
  rowLeft: { flex: 1, marginRight: 12 },
  name: { fontSize: 15, fontWeight: '500', color: colors.neutral[900] },
  meta: { fontSize: 12, color: colors.neutral[600], marginTop: 2 },
  separator: { height: 1, backgroundColor: colors.neutral[100] },
  empty: { textAlign: 'center', color: colors.neutral[600], padding: 24, fontSize: 14 },
});
