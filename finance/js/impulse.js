// impulse.js — on-device "impulse-spend risk" estimator.
//
// Honest framing: this is a heuristic, not a clinical or proven predictor. It
// combines a few weak signals into a single 0..1 score and, above a threshold,
// nudges you with a pause prompt. The point is friction before a "want" purchase,
// not surveillance. All inputs stay on the device; weights are user-editable in
// Settings so the logic is never a black box.
//
// Signals:
//   - hr:        elevation above your resting baseline (arousal proxy)
//   - noise:     ambient loudness (busy/retail/stress environment proxy)
//   - time:      late-night & payday-evening windows (known weak-impulse times)
//   - category:  your own recent ratio of "want" vs "need" spending momentum

export function timeRisk(date = new Date()) {
  const h = date.getHours();
  // late night (22–02) and early evening (18–21) score higher
  if (h >= 22 || h < 2) return 0.9;
  if (h >= 18 && h < 22) return 0.6;
  if (h >= 12 && h < 14) return 0.4; // lunchtime browsing
  return 0.2;
}

export function categoryMomentum(transactions, windowMs = 1000 * 60 * 60 * 24 * 3) {
  const cutoff = Date.now() - windowMs;
  const recent = transactions.filter((t) => new Date(t.date).getTime() > cutoff && t.amount < 0);
  if (!recent.length) return 0.3;
  const wants = recent.filter((t) => t.necessity === 'want').length;
  return Math.min(1, 0.2 + wants / recent.length);
}

export function hrRisk(latestHr, resting) {
  if (!latestHr) return 0.3;
  const elevation = (latestHr - resting) / resting; // fractional rise
  return Math.max(0, Math.min(1, elevation * 2.2));
}

export function noiseRisk(latestNoise) {
  if (latestNoise == null) return 0.3;
  return Math.max(0, Math.min(1, latestNoise));
}

// Returns { score, parts, fire } given current signals + config.
export function computeRisk({ hr, noise, transactions, impulse, now = new Date() }) {
  const parts = {
    hr: hrRisk(hr, impulse.restingHr) * impulse.hrWeight,
    noise: noiseRisk(noise) * impulse.noiseWeight,
    time: timeRisk(now) * impulse.timeWeight,
    category: categoryMomentum(transactions) * impulse.categoryWeight,
  };
  const totalWeight = impulse.hrWeight + impulse.noiseWeight + impulse.timeWeight + impulse.categoryWeight || 1;
  const score = (parts.hr + parts.noise + parts.time + parts.category) / totalWeight;
  return { score, parts, fire: score >= impulse.threshold };
}

export const INTERVENTIONS = [
  'High impulse-risk right now. Want to wait 20 minutes before buying?',
  "You're in a typical overspend window. Is this a need or a want?",
  'Pause: would you still want this tomorrow morning?',
  'Heads up — your signals look like a "want" moment. Add it to a wishlist instead?',
];
