// email-parser.js — heuristic detector for finance events in message text.
//
// A static web app cannot read your Gmail directly: that requires OAuth and a
// server-side token exchange (see README "Connecting a real inbox"). What this
// module DOES do is parse message text you paste in (or that a future backend
// forwards) and classify it into: payment, charge/debit, invoice/bill, or
// account-balance statement. It's regex + keyword scoring — transparent and
// auditable, no ML black box.

const CURRENCY = /(?:USD|EUR|GBP|\$|€|£)\s?([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)/i;

const KEYWORDS = {
  payment: ['payment received', 'thank you for your payment', 'payment confirmation', 'paid', 'receipt'],
  charge: ['was charged', 'purchase', 'transaction', 'debited', 'card ending', 'apple pay', 'wallet'],
  invoice: ['invoice', 'bill', 'amount due', 'due date', 'statement balance', 'minimum payment', 'past due'],
  balance: ['available balance', 'current balance', 'account balance', 'closing balance'],
};

const DATE_PATTERNS = [
  /due (?:date|by)[:\s]+([A-Za-z0-9 ,\/\-]{6,20})/i,
  /\b(\d{4}-\d{2}-\d{2})\b/,
  /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/,
];

function parseAmount(text) {
  const m = text.match(CURRENCY);
  if (!m) return null;
  let s = m[1];
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot > -1 && lastComma > -1) {
    // both present: the later one is the decimal separator
    const dec = lastDot > lastComma ? '.' : ',';
    const thou = dec === '.' ? ',' : '.';
    s = s.split(thou).join('').replace(dec, '.');
  } else if (lastComma > -1) {
    // comma only: decimal if exactly 2 trailing digits, else thousands
    s = /,\d{2}$/.test(s) ? s.replace(',', '.') : s.split(',').join('');
  } else if (/^\d{1,3}\.\d{3}$/.test(s)) {
    // dot only with 3 trailing digits → thousands grouping (e.g. 1.204)
    s = s.replace('.', '');
  }
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function parseDueDate(text) {
  for (const re of DATE_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const d = new Date(m[1]);
      if (!isNaN(d)) return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

function guessPayee(text, from) {
  if (from) return from.replace(/<.*?>/, '').trim() || from;
  // first capitalized-ish token sequence near "from" / merchant words
  const m = text.match(/(?:from|merchant|payee|at)\s+([A-Z][A-Za-z0-9 &.'-]{2,30})/);
  return m ? m[1].trim() : 'Unknown';
}

function score(text, words) {
  const t = text.toLowerCase();
  return words.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0);
}

// Returns { type, amount, payee, dueDate, confidence, raw }
export function classifyMessage(text, meta = {}) {
  const scores = {
    payment: score(text, KEYWORDS.payment),
    charge: score(text, KEYWORDS.charge),
    invoice: score(text, KEYWORDS.invoice),
    balance: score(text, KEYWORDS.balance),
  };
  const type = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  if (!total) return { type: 'unknown', confidence: 0, raw: text };

  return {
    type: type[0],
    confidence: Math.min(1, type[1] / 3),
    amount: parseAmount(text),
    payee: guessPayee(text, meta.from),
    dueDate: parseDueDate(text),
    raw: text,
  };
}

// Turn a classification into a store action descriptor the UI can apply/confirm.
export function toAction(c) {
  switch (c.type) {
    case 'payment':
      return {
        kind: 'transaction',
        label: `Payment to ${c.payee}`,
        tx: { amount: -(c.amount || 0), merchant: c.payee, category: 'bill-payment', source: 'email', necessity: 'need' },
      };
    case 'charge':
      return {
        kind: 'transaction',
        label: `Charge from ${c.payee}`,
        tx: { amount: -(c.amount || 0), merchant: c.payee, category: 'uncategorized', source: 'email', necessity: 'unknown' },
      };
    case 'invoice':
      return {
        kind: 'invoice',
        label: `Invoice from ${c.payee}`,
        invoice: { payee: c.payee, amount: c.amount || 0, dueDate: c.dueDate, source: 'email' },
      };
    case 'balance':
      return { kind: 'balance', label: `Balance update: ${c.payee}`, amount: c.amount };
    default:
      return { kind: 'unknown', label: 'Could not classify message' };
  }
}

// Sample inbox so the feature is demonstrable with one click.
export const SAMPLE_MESSAGES = [
  { from: 'Netflix <info@netflix.com>', text: 'Your payment of $15.99 was charged to your card ending 4242 via Apple Pay. Thanks for being a member.' },
  { from: 'City Power <billing@citypower.com>', text: 'Your electricity invoice is ready. Amount due: $84.20. Due date: 2026-07-05. Please pay to avoid late fees.' },
  { from: 'Chase <no-reply@chase.com>', text: 'Account alert: your available balance is $1,204.55 as of today.' },
  { from: 'Amazon <auto@amazon.com>', text: 'Your purchase: order total $63.40. Card ending 1881 was charged. Thank you for your order.' },
  { from: 'Verizon <bills@verizon.com>', text: 'Thank you for your payment of $70.00. Payment received. Receipt attached.' },
];
