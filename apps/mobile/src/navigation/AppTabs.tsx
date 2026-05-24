import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '@roofops/ui/tokens';
import { LeadsScreen } from '../screens/LeadsScreen';
import { LeadDetailScreen } from '../screens/LeadDetailScreen';
import { InboxScreen } from '../screens/InboxScreen';
import { ThreadDetailScreen } from '../screens/ThreadDetailScreen';
import { HomeScreen } from '../screens/HomeScreen';
import type {
  AppTabsParamList,
  InboxStackParamList,
  LeadsStackParamList,
} from './types';

const Tabs = createBottomTabNavigator<AppTabsParamList>();
const LeadsStack = createNativeStackNavigator<LeadsStackParamList>();
const InboxStack = createNativeStackNavigator<InboxStackParamList>();

function LeadsNavigator() {
  return (
    <LeadsStack.Navigator>
      <LeadsStack.Screen
        name="LeadsList"
        component={LeadsScreen}
        options={{ title: 'Leads' }}
      />
      <LeadsStack.Screen
        name="LeadDetail"
        component={LeadDetailScreen}
        options={{ title: 'Lead' }}
      />
    </LeadsStack.Navigator>
  );
}

function InboxNavigator() {
  return (
    <InboxStack.Navigator>
      <InboxStack.Screen
        name="InboxList"
        component={InboxScreen}
        options={{ title: 'Inbox' }}
      />
      <InboxStack.Screen
        name="ThreadDetail"
        component={ThreadDetailScreen}
        options={{ title: 'Conversation' }}
      />
    </InboxStack.Navigator>
  );
}

export function AppTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand[600],
        tabBarInactiveTintColor: colors.neutral[600],
      }}
    >
      <Tabs.Screen
        name="LeadsTab"
        component={LeadsNavigator}
        options={{ title: 'Leads' }}
      />
      <Tabs.Screen
        name="InboxTab"
        component={InboxNavigator}
        options={{ title: 'Inbox' }}
      />
      <Tabs.Screen
        name="ProfileTab"
        component={HomeScreen}
        options={{ title: 'Profile' }}
      />
    </Tabs.Navigator>
  );
}
