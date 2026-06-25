# FinPulse — Personal Finance & Impulse Tracker

A local-first, installable web app (PWA) that tracks your money, detects
charges / bills / payments from message text, and gives you a gentle "pause
before you spend" nudge using opt-in on-device signals.

**Live demo:** open `/finance/` on the site (e.g. `https://cronicsm0ker.github.io/finance/`).

It runs entirely in your browser. All data is kept in `localStorage` on your
device. Nothing is uploaded anywhere — there is no backend and no analytics.

---

## What it does

| Feature | Status | Notes |
|---|---|---|
| Accounts, transactions, balances | ✅ Fully working | Manual entry + auto from parsed messages |
| Bill / invoice tracking & due dates | ✅ Fully working | Detected from message text or added manually |
| Detect charges / payments / invoices from emails | ✅ Working on pasted text | Heuristic classifier, runs on-device. Direct Gmail access needs OAuth + a backend (below) |
| Push / local notifications | ✅ Working in installed PWA | Android + iOS 16.4+ (home-screen installed) |
| Heart-rate sensor | ✅ Real, via Web Bluetooth | Standard `heart_rate` GATT profile; simulates if no device |
| Ambient sound **level** | ✅ Real, via Web Audio | Loudness only — see privacy note below |
| Impulse-spend risk + intervention | ✅ Working | Transparent on-device heuristic, tunable weights |
| Apple Wallet charge detection | ⚠️ Simulated | No API exists to read Wallet — see below |
| Tracking your browsing on other sites | ⚠️ Not possible from a web page | Needs a browser extension — see below |

---

## Honest notes on the harder requests

These were in the original brief. Here's the real engineering picture so the
app doesn't pretend to do things it can't.

### "Read my emails directly"
A static site **cannot** read your Gmail/Outlook. That requires an OAuth flow
and a server to hold the refresh token and call the Gmail API (you can't safely
keep those credentials in client-side JS). The clean path:

1. A small backend (Cloud Function / serverless) does Google OAuth.
2. It pulls messages via the Gmail API and forwards the text to the browser.
3. The browser runs the same `email-parser.js` classifier you can already test
   by pasting text into the **Inbox** tab.

So the detection logic is real and done; only the inbox connection needs a
backend. The Inbox tab's "Load sample inbox" button shows it working end-to-end.

### "Notify me when a debt is made via Apple Wallet"
There is **no public API** — web or native — that lets an app read your Apple
Pay / Wallet transactions. Wallet is a closed system by design. What actually
works is detecting the **bank/issuer notification or email** that follows the
charge, then raising your own alert. That's exactly the pipeline here:
issuer-message → `email-parser.js` → local notification. The
"Simulate Apple Wallet charge" button on the **Wellbeing** tab demonstrates it.

### "Listen to my microphone in real time"
The app measures **ambient loudness only** (an RMS number, 0–1, sampled ~1×/sec).
It deliberately does **not** record audio, does **not** transcribe speech, keeps
no waveform, and sends nothing off the device. The single loudness value feeds
the impulse heuristic as a "busy/stressful environment" proxy.

This is an intentional limit, not a missing feature. Continuous capture of
microphone *content* to profile someone is not something this app will do, and
mobile platforms (correctly) don't allow silent background audio capture anyway.
A loudness proxy gives the useful signal without the surveillance.

### "Track my web activity to predict overspending"
A web page is sandboxed and **cannot** see what you browse on other sites. Doing
that legitimately requires a **browser extension** you install and grant
permission to, which would post category hints (e.g. "shopping") to this app via
`postMessage`. Until that exists, the **Settings → Browsing context** form lets
you log context manually so you can see how the model responds.

### The impulse model
`impulse.js` is a small, transparent heuristic — not a clinical or validated
predictor. It blends heart-rate elevation, ambient noise, time-of-day, and your
own recent want-vs-need spending into a 0–1 score, and nudges you above a
threshold. Every weight is editable in **Settings**, and the score breakdown is
shown live, so it's never a black box. Treat it as a friction tool, not advice.

---

## Privacy model

- **Local-only.** Data lives in `localStorage`. No server, no tracking.
- **Opt-in everything.** Every sensor and the email parser are off by default
  and gated behind explicit consent toggles in **Settings**.
- **Mic = loudness only.** No audio content is ever captured or stored.
- **Export / erase.** Settings → Data lets you export your JSON or wipe it.

---

## Project structure

```
finance/
  index.html              app shell
  styles.css              UI
  manifest.webmanifest    PWA manifest
  sw.js                   service worker (offline + notifications)
  icons/                  app icons
  js/
    app.js                UI + wiring
    store.js              local-first data layer
    email-parser.js       message → finance-event classifier
    sensors.js            Web Bluetooth HR + Web Audio loudness
    impulse.js            on-device impulse-risk heuristic
    notify.js             notifications + wallet-charge simulation
```

## Run locally

It's static — serve the folder over http (service workers need http/https):

```bash
cd finance
python3 -m http.server 8080
# open http://localhost:8080
```

To install as an app: open it in Chrome/Safari → "Add to Home Screen" /
"Install". Notifications and offline use work once installed.
