import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '@roofops/ui/tokens';
import { apiClient } from '../lib/api';
import { formatDateTime } from '../lib/format';
import type { InboxStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<InboxStackParamList, 'ThreadDetail'>;

export function ThreadDetailScreen({ route }: Props) {
  const { threadId } = route.params;
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['thread', threadId, 'messages'],
    queryFn: () => apiClient.listThreadMessages(threadId, { limit: 100 }),
    refetchInterval: 8_000,
  });

  const sendMutation = useMutation({
    mutationFn: () => apiClient.sendMessage({ threadId, body }),
    onSuccess: () => {
      setBody('');
      void queryClient.invalidateQueries({ queryKey: ['thread', threadId, 'messages'] });
    },
  });

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.brand[500]} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
      keyboardVerticalOffset={80}
    >
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(m) => m.id}
        inverted
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.direction === 'OUTBOUND' ? styles.bubbleOut : styles.bubbleIn,
            ]}
          >
            <Text
              style={item.direction === 'OUTBOUND' ? styles.bubbleTextOut : styles.bubbleTextIn}
            >
              {item.body}
            </Text>
            <Text
              style={item.direction === 'OUTBOUND' ? styles.metaOut : styles.metaIn}
            >
              {formatDateTime(item.createdAt)} · {item.status}
            </Text>
          </View>
        )}
      />

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={body}
          onChangeText={setBody}
          placeholder="Type a reply…"
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (sendMutation.isPending || body.trim() === '') && styles.sendBtnDisabled]}
          disabled={sendMutation.isPending || body.trim() === ''}
          onPress={() => sendMutation.mutate()}
        >
          <Text style={styles.sendBtnText}>Send</Text>
        </TouchableOpacity>
      </View>
      {sendMutation.isError && (
        <Text style={styles.error}>
          {sendMutation.error instanceof Error ? sendMutation.error.message : 'Send failed'}
        </Text>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral[50] },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 12, gap: 8 },
  bubble: { maxWidth: '80%', padding: 10, borderRadius: 12 },
  bubbleOut: { alignSelf: 'flex-end', backgroundColor: colors.brand[500] },
  bubbleIn: { alignSelf: 'flex-start', backgroundColor: colors.neutral[100] },
  bubbleTextOut: { color: colors.neutral[0], fontSize: 14 },
  bubbleTextIn: { color: colors.neutral[900], fontSize: 14 },
  metaOut: { color: colors.brand[100], fontSize: 10, marginTop: 4 },
  metaIn: { color: colors.neutral[600], fontSize: 10, marginTop: 4 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.neutral[200],
    backgroundColor: colors.neutral[0],
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.neutral[900],
  },
  sendBtn: {
    backgroundColor: colors.brand[500],
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: colors.neutral[0], fontWeight: '600', fontSize: 14 },
  error: { color: colors.status.danger, fontSize: 12, padding: 12 },
});
