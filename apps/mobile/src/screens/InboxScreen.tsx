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
import type { InboxStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<InboxStackParamList, 'InboxList'>;

export function InboxScreen({ navigation }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const { data, refetch, isLoading } = useQuery({
    queryKey: ['threads'],
    queryFn: () => apiClient.listThreads({ limit: 100 }),
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
        keyExtractor={(t) => t.id}
        refreshControl={
          <RefreshControl refreshing={refreshing || isLoading} onRefresh={() => void onRefresh()} />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          !isLoading ? <Text style={styles.empty}>No conversations yet.</Text> : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('ThreadDetail', { threadId: item.id })}
          >
            <View style={{ flex: 1 }}>
              <View style={styles.headerRow}>
                <Text style={styles.channel}>{item.channel}</Text>
                {item.unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{item.unreadCount}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.contact} numberOfLines={1}>
                Contact {item.contactId.slice(0, 8)}…
              </Text>
            </View>
            <Text style={styles.time}>{formatRelative(item.lastMessageAt)}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.neutral[0],
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  channel: { fontSize: 14, fontWeight: '500', color: colors.neutral[900] },
  unreadBadge: {
    backgroundColor: colors.brand[500],
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  unreadText: { color: colors.neutral[0], fontSize: 11, fontWeight: '500' },
  contact: { fontSize: 12, color: colors.neutral[600], marginTop: 2 },
  time: { fontSize: 11, color: colors.neutral[600], marginLeft: 8 },
  separator: { height: 1, backgroundColor: colors.neutral[100] },
  empty: { textAlign: 'center', color: colors.neutral[600], padding: 24, fontSize: 14 },
});
