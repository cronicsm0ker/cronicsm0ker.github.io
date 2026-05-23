import { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors } from '@roofops/ui/tokens';
import { apiClient } from '../lib/api';
import { useAuthStore } from '../lib/auth-store';

export function HomeScreen() {
  const setSession = useAuthStore((s) => s.setSession);
  const clear = useAuthStore((s) => s.clear);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: () => apiClient.me(),
    retry: false,
  });

  useEffect(() => {
    if (data) {
      setSession({ user: data.user, memberships: data.memberships });
    }
  }, [data, setSession]);

  useEffect(() => {
    if (isError) {
      clear();
    }
  }, [isError, clear]);

  async function onLogout() {
    await apiClient.logout().catch(() => undefined);
    clear();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.brand}>RoofOps</Text>
        <TouchableOpacity onPress={() => void onLogout()}>
          <Text style={styles.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.description}>Phase 0 review checkpoint — you are signed in.</Text>

        {isLoading && <ActivityIndicator style={styles.loader} color={colors.brand[500]} />}

        {data && (
          <>
            <Text style={styles.body}>
              Signed in as <Text style={styles.bodyStrong}>{data.user.email}</Text>
            </Text>
            <Text style={styles.sectionLabel}>Organizations</Text>
            {data.memberships.map((m) => (
              <View key={m.org.id} style={styles.orgRow}>
                <Text style={styles.orgName}>{m.org.name}</Text>
                <Text style={styles.orgRole}>{m.membership.role}</Text>
              </View>
            ))}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: colors.neutral[50],
    minHeight: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  brand: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.brand[600],
  },
  signOut: {
    fontSize: 14,
    color: colors.neutral[700],
  },
  card: {
    backgroundColor: colors.neutral[0],
    borderRadius: 12,
    padding: 20,
    shadowColor: colors.neutral[900],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.neutral[900],
  },
  description: {
    fontSize: 13,
    color: colors.neutral[600],
    marginTop: 4,
    marginBottom: 16,
  },
  loader: {
    marginTop: 16,
  },
  body: {
    fontSize: 14,
    color: colors.neutral[800],
  },
  bodyStrong: {
    fontWeight: '600',
  },
  sectionLabel: {
    marginTop: 16,
    fontSize: 13,
    fontWeight: '500',
    color: colors.neutral[800],
  },
  orgRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  orgName: {
    fontSize: 14,
    color: colors.neutral[900],
  },
  orgRole: {
    fontSize: 13,
    color: colors.neutral[600],
  },
});
