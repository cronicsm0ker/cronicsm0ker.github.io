import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { LoginScreen } from './screens/LoginScreen';
import { HomeScreen } from './screens/HomeScreen';
import { useAuthStore } from './lib/auth-store';
import { REFRESH_TOKEN_KEY } from './lib/api';
import type { RootStackParamList } from './navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 30_000,
    },
  },
});

export default function App() {
  const status = useAuthStore((s) => s.status);
  const setStatus = useAuthStore((s) => s.setStatus);

  useEffect(() => {
    async function bootstrap() {
      const refresh = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      setStatus(refresh ? 'authenticated' : 'unauthenticated');
    }
    void bootstrap();
  }, [setStatus]);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer>
          <StatusBar style="auto" />
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {status === 'authenticated' ? (
              <Stack.Screen name="Home" component={HomeScreen} />
            ) : (
              <Stack.Screen name="Login" component={LoginScreen} />
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
