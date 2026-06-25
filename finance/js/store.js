// store.js — local-first data layer.
// Everything lives in localStorage. No network calls, no exfiltration.
// This is the single source of truth for the whole app.

const KEY = 'pft.state.v1';

const DEFAULT_STATE = {
  settings: {
    currency: 'USD',
    consent: {
      email: false,       // parse email/message text for finance events
      heartRate: false,   // connect a BLE heart-rate monitor
      microphone: false,  // sample ambient sound LEVEL only (never content)
      browsing: false,    // log browsing context the user provides
      notifications: false,
    },
    impulse: {
      // weights for the on-device impulse-risk score (0..1 each)
      hrWeight: 0.35,
      noiseWeight: 0.2,
      timeWeight: 0.2,
      categoryWeight: 0.25,
      threshold: 0.6,     // fire an intervention above this
      restingHr: 65,
    },
  },
  accounts: [
    { id: 'acc_checking', name: 'Checking', type: 'bank', balance: 0 },
    { id: 'acc_card', name: 'Credit Card', type: 'credit', balance: 0 },
  ],
  // transactions: { id, accountId, date, amount(+income/-expense), merchant, category, source, necessity }
  transactions: [],
  // invoices/bills detected or entered: { id, payee, amount, dueDate, status }
  invoices: [],
  // raw signal samples used by the impulse model (kept small, on-device)
  signals: { hr: [], noise: [], events: [] },
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    // shallow-merge defaults so new fields appear after upgrades
    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      settings: {
        ...DEFAULT_STATE.settings,
        ...(parsed.settings || {}),
        consent: { ...DEFAULT_STATE.settings.consent, ...(parsed.settings?.consent || {}) },
        impulse: { ...DEFAULT_STATE.settings.impulse, ...(parsed.settings?.impulse || {}) },
      },
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

const subscribers = new Set();

function persist() {
  localStorage.setItem(KEY, JSON.stringify(state));
  subscribers.forEach((fn) => fn(state));
}

export const store = {
  get: () => state,
  subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  },
  // generic patch of settings
  setSetting(path, value) {
    const segs = path.split('.');
    let node = state.settings;
    for (let i = 0; i < segs.length - 1; i++) node = node[segs[i]];
    node[segs[segs.length - 1]] = value;
    persist();
  },
  setConsent(key, value) {
    state.settings.consent[key] = value;
    persist();
  },
  addAccount(acc) {
    state.accounts.push({ id: 'acc_' + uid(), balance: 0, ...acc });
    persist();
  },
  addTransaction(tx) {
    const t = {
      id: 'tx_' + uid(),
      date: tx.date || new Date().toISOString(),
      amount: Number(tx.amount) || 0,
      merchant: tx.merchant || 'Unknown',
      category: tx.category || 'uncategorized',
      source: tx.source || 'manual',          // manual | email | wallet
      necessity: tx.necessity || 'unknown',   // need | want | unknown
      accountId: tx.accountId || state.accounts[0]?.id,
    };
    state.transactions.unshift(t);
    const acc = state.accounts.find((a) => a.id === t.accountId);
    if (acc) acc.balance += t.amount;
    persist();
    return t;
  },
  addInvoice(inv) {
    const i = {
      id: 'inv_' + uid(),
      payee: inv.payee || 'Unknown',
      amount: Number(inv.amount) || 0,
      dueDate: inv.dueDate || null,
      status: inv.status || 'open',           // open | paid | overdue
      source: inv.source || 'manual',
    };
    // de-dupe obvious repeats from re-parsing the same email
    const dup = state.invoices.find(
      (x) => x.payee === i.payee && x.amount === i.amount && x.dueDate === i.dueDate
    );
    if (dup) return dup;
    state.invoices.unshift(i);
    persist();
    return i;
  },
  markInvoice(id, status) {
    const inv = state.invoices.find((x) => x.id === id);
    if (inv) inv.status = status;
    persist();
  },
  pushSignal(kind, sample) {
    const arr = state.signals[kind];
    if (!arr) return;
    arr.push({ t: Date.now(), ...sample });
    // keep memory bounded — last ~500 samples per channel
    if (arr.length > 500) arr.splice(0, arr.length - 500);
    persist();
  },
  logEvent(ev) {
    state.signals.events.push({ t: Date.now(), ...ev });
    if (state.signals.events.length > 200) state.signals.events.shift();
    persist();
  },
  reset() {
    state = structuredClone(DEFAULT_STATE);
    persist();
  },
  export() {
    return JSON.stringify(state, null, 2);
  },
  import(json) {
    state = JSON.parse(json);
    persist();
  },
};

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function money(n, currency = state.settings.currency) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n || 0);
}
