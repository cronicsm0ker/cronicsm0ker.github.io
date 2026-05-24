// Root stack: gates auth vs the tab navigator.
export type RootStackParamList = {
  Login: undefined;
  Tabs: undefined;
};

// Per-tab stacks.
export type LeadsStackParamList = {
  LeadsList: undefined;
  LeadDetail: { leadId: string };
};

export type InboxStackParamList = {
  InboxList: undefined;
  ThreadDetail: { threadId: string };
};

export type AppTabsParamList = {
  LeadsTab: undefined;
  InboxTab: undefined;
  ProfileTab: undefined;
};
