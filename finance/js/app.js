import { store, money, uid } from './store.js';
import { classifyMessage, toAction, SAMPLE_MESSAGES } from './email-parser.js';
import { HeartRateSensor, AmbientLevelSensor } from './sensors.js';
import { computeRisk, INTERVENTIONS } from './impulse.js';
import { Notify, simulateWalletCharge } from './notify.js';

// ---- live sensor state (in-memory, not persisted beyond signal samples) ----
const live = { hr: null, noise: null, hrSensor: null, micSensor: null, lastFire: 0 };

const app = document.getElementById('app');
let activeTab = 'dashboard';

const tabs = {
  dashboard: renderDashboard,
  transactions: renderTransactions,
  inbox: renderInbox,
  wellbeing: renderWellbeing,
  settings: renderSettings,
};

function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function render() {
  const s = store.get();
  app.innerHTML = '';
  app.appendChild(h(`
    <div class="shell">
      <header class="topbar">
        <div class="brand"><span class="dot"></span> Fin<b>Pulse</b></div>
        <nav class="tabs">
          ${Object.keys(tabs).map((t) => `<button data-tab="${t}" class="${t === activeTab ? 'on' : ''}">${label(t)}</button>`).join('')}
        </nav>
      </header>
      <main id="view"></main>
      <div id="risk-banner"></div>
    </div>
  `));
  document.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => { activeTab = b.dataset.tab; render(); })
  );
  document.getElementById('view').appendChild(tabs[activeTab](s));
  updateRiskBanner();
}

function label(t) {
  return { dashboard: 'Dashboard', transactions: 'Transactions', inbox: 'Inbox', wellbeing: 'Wellbeing', settings: 'Settings' }[t];
}

// ---------------------------------------------------------------- Dashboard
function renderDashboard(s) {
  const netWorth = s.accounts.reduce((a, b) => a + b.balance, 0);
  const openBills = s.invoices.filter((i) => i.status !== 'paid');
  const owed = openBills.reduce((a, b) => a + b.amount, 0);
  const month = monthSpend(s.transactions);

  const el = h(`<section class="grid">
    <div class="card kpi"><span>Net position</span><b class="${netWorth < 0 ? 'neg' : 'pos'}">${money(netWorth)}</b></div>
    <div class="card kpi"><span>Spent this month</span><b>${money(-month.spent)}</b></div>
    <div class="card kpi"><span>Upcoming bills</span><b>${money(owed)}</b><small>${openBills.length} open</small></div>
    <div class="card kpi"><span>Want-spend ratio</span><b>${Math.round(month.wantRatio * 100)}%</b><small>of expenses</small></div>

    <div class="card span2">
      <h3>Accounts</h3>
      ${s.accounts.map((a) => `<div class="row"><span>${a.name} <em>${a.type}</em></span><b class="${a.balance < 0 ? 'neg' : ''}">${money(a.balance)}</b></div>`).join('')}
    </div>

    <div class="card span2">
      <h3>Upcoming bills</h3>
      ${openBills.length ? openBills.map((i) => `
        <div class="row"><span>${i.payee} <em>${i.dueDate || 'no date'}</em></span>
        <span><b>${money(i.amount)}</b> <button class="mini" data-pay="${i.id}">Mark paid</button></span></div>`).join('')
        : '<p class="muted">Nothing due. Detected bills from your inbox show up here.</p>'}
    </div>

    <div class="card span4">
      <h3>Recent activity</h3>
      ${txTable(s.transactions.slice(0, 8))}
    </div>
  </section>`);

  el.querySelectorAll('[data-pay]').forEach((b) =>
    b.addEventListener('click', () => { store.markInvoice(b.dataset.pay, 'paid'); render(); })
  );
  return el;
}

// ------------------------------------------------------------- Transactions
function renderTransactions(s) {
  const el = h(`<section>
    <div class="card">
      <h3>Add transaction</h3>
      <form id="txform" class="formgrid">
        <input name="merchant" placeholder="Merchant" required>
        <input name="amount" type="number" step="0.01" placeholder="Amount (− expense)" required>
        <select name="accountId">${s.accounts.map((a) => `<option value="${a.id}">${a.name}</option>`).join('')}</select>
        <input name="category" placeholder="Category" value="general">
        <select name="necessity"><option value="need">Need</option><option value="want">Want</option><option value="unknown">Unknown</option></select>
        <button type="submit">Add</button>
      </form>
    </div>
    <div class="card">
      <h3>All transactions <small>${s.transactions.length}</small></h3>
      ${txTable(s.transactions)}
    </div>
  </section>`);

  el.querySelector('#txform').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    store.addTransaction({
      merchant: f.get('merchant'),
      amount: Number(f.get('amount')),
      accountId: f.get('accountId'),
      category: f.get('category'),
      necessity: f.get('necessity'),
    });
    render();
  });
  return el;
}

// -------------------------------------------------------------------- Inbox
function renderInbox(s) {
  const consent = s.settings.consent.email;
  const el = h(`<section>
    <div class="card">
      <h3>Message inbox <small>parse finance events</small></h3>
      ${consent ? '' : '<p class="warn">Email parsing is off. Enable it in Settings → Consent first.</p>'}
      <p class="muted">A static site can't read Gmail directly (needs OAuth + a backend — see README).
      Paste a bank/receipt/invoice email below, or load samples, and FinPulse classifies it on-device.</p>
      <textarea id="msgbox" rows="4" placeholder="Paste an email or message here…"></textarea>
      <div class="actions">
        <button id="parse" ${consent ? '' : 'disabled'}>Detect</button>
        <button id="samples" class="ghost" ${consent ? '' : 'disabled'}>Load sample inbox</button>
      </div>
      <div id="parsed"></div>
    </div>
  </section>`);

  const out = el.querySelector('#parsed');

  function showResults(items) {
    out.innerHTML = '';
    items.forEach(({ from, text }) => {
      const c = classifyMessage(text, { from });
      const action = toAction(c);
      const card = h(`<div class="parsed-item">
        <div class="pi-head"><b>${escape(from || 'message')}</b>
          <span class="tag tag-${c.type}">${c.type} · ${Math.round((c.confidence || 0) * 100)}%</span></div>
        <div class="pi-body">${escape(action.label)} ${c.amount != null ? '— ' + money(c.amount) : ''} ${c.dueDate ? '· due ' + c.dueDate : ''}</div>
        <div class="pi-foot">${action.kind === 'unknown' ? '' : `<button class="mini" data-apply>Confirm → add</button>`}</div>
      </div>`);
      const btn = card.querySelector('[data-apply]');
      if (btn) btn.addEventListener('click', () => { applyAction(action); btn.textContent = 'Added ✓'; btn.disabled = true; });
      out.appendChild(card);
    });
  }

  el.querySelector('#parse').addEventListener('click', () => {
    const v = el.querySelector('#msgbox').value.trim();
    if (v) showResults([{ from: '', text: v }]);
  });
  el.querySelector('#samples').addEventListener('click', () => showResults(SAMPLE_MESSAGES));
  return el;
}

function applyAction(action) {
  if (action.kind === 'transaction') {
    store.addTransaction(action.tx);
    if (store.get().settings.consent.notifications) Notify.show('Charge detected', action.label);
  } else if (action.kind === 'invoice') {
    store.addInvoice(action.invoice);
    if (store.get().settings.consent.notifications) Notify.show('Bill detected', `${action.invoice.payee} ${money(action.invoice.amount)}`);
  }
}

// ---------------------------------------------------------------- Wellbeing
function renderWellbeing(s) {
  const c = s.settings.consent;
  const el = h(`<section class="grid">
    <div class="card span2">
      <h3>Live signals <small>on-device only</small></h3>
      <div class="gauge"><span>Heart rate</span><b id="hrv">${live.hr ?? '—'}</b><small>bpm ${live.hrSensor?.simulated ? '(sim)' : ''}</small></div>
      <div class="gauge"><span>Ambient level</span><b id="nzv">${live.noise ?? '—'}</b><small>0–1 loudness ${live.micSensor?.simulated ? '(sim)' : ''}</small></div>
      <div class="actions">
        <button id="hrtoggle" ${c.heartRate ? '' : 'disabled'}>${live.hrSensor ? 'Stop HR' : 'Connect HR'}</button>
        <button id="mictoggle" ${c.microphone ? '' : 'disabled'}>${live.micSensor ? 'Stop mic' : 'Start ambient'}</button>
      </div>
      ${(!c.heartRate || !c.microphone) ? '<p class="warn">Some sensors are off — enable them in Settings → Consent.</p>' : ''}
      <p class="muted">The microphone reads <b>loudness only</b>. No audio is recorded, transcribed, or sent anywhere.</p>
    </div>
    <div class="card span2">
      <h3>Impulse-spend risk</h3>
      <div class="meter"><div id="riskfill" class="meterfill"></div></div>
      <div id="riskparts" class="parts"></div>
      <p class="muted">A transparent heuristic, not a diagnosis. Tune the weights in Settings.</p>
      <button id="simcharge" class="ghost">Simulate Apple Wallet charge</button>
    </div>
  </section>`);

  el.querySelector('#hrtoggle').addEventListener('click', toggleHr);
  el.querySelector('#mictoggle').addEventListener('click', toggleMic);
  el.querySelector('#simcharge').addEventListener('click', async () => {
    const ch = simulateWalletCharge();
    store.addTransaction({ merchant: ch.merchant, amount: -ch.amount, source: 'wallet', category: 'card', necessity: 'unknown' });
    if (store.get().settings.consent.notifications) await Notify.show('Wallet charge', `${ch.merchant} ${money(-ch.amount)}`);
    render();
  });

  refreshRiskUI(el);
  return el;
}

async function toggleHr() {
  if (live.hrSensor) { live.hrSensor.stop(); live.hrSensor = null; live.hr = null; return render(); }
  const sensor = new HeartRateSensor((bpm) => { live.hr = bpm; store.pushSignal('hr', { bpm }); onSignalTick(); });
  live.hrSensor = sensor;
  await sensor.connect();
  render();
}

async function toggleMic() {
  if (live.micSensor) { live.micSensor.stop(); live.micSensor = null; live.noise = null; return render(); }
  const sensor = new AmbientLevelSensor((lvl) => { live.noise = lvl; store.pushSignal('noise', { level: lvl }); onSignalTick(); });
  live.micSensor = sensor;
  await sensor.start();
  render();
}

// called on every sensor sample — cheap UI + risk update without full re-render
function onSignalTick() {
  const hrv = document.getElementById('hrv'); if (hrv) hrv.textContent = live.hr ?? '—';
  const nzv = document.getElementById('nzv'); if (nzv) nzv.textContent = live.noise ?? '—';
  const view = document.getElementById('view');
  if (view && activeTab === 'wellbeing') refreshRiskUI(view);
  updateRiskBanner();
  maybeIntervene();
}

function currentRisk() {
  const s = store.get();
  return computeRisk({ hr: live.hr, noise: live.noise, transactions: s.transactions, impulse: s.settings.impulse });
}

function refreshRiskUI(scope) {
  const r = currentRisk();
  const fill = scope.querySelector('#riskfill');
  if (fill) {
    fill.style.width = Math.round(r.score * 100) + '%';
    fill.className = 'meterfill ' + (r.fire ? 'hot' : r.score > 0.4 ? 'warm' : '');
  }
  const parts = scope.querySelector('#riskparts');
  if (parts) parts.innerHTML = Object.entries(r.parts)
    .map(([k, v]) => `<span class="chip">${k}: ${Math.round(v * 100)}</span>`).join('');
}

function maybeIntervene() {
  const s = store.get();
  if (!s.settings.consent.notifications) return;
  const r = currentRisk();
  if (r.fire && Date.now() - live.lastFire > 60_000) {
    live.lastFire = Date.now();
    const msg = INTERVENTIONS[Math.floor((r.score * 1000) % INTERVENTIONS.length)];
    Notify.show('Pause before you spend', msg);
    store.logEvent({ kind: 'intervention', score: Number(r.score.toFixed(2)) });
  }
}

function updateRiskBanner() {
  const banner = document.getElementById('risk-banner');
  if (!banner) return;
  const anySensor = live.hrSensor || live.micSensor;
  if (!anySensor) { banner.innerHTML = ''; return; }
  const r = currentRisk();
  banner.innerHTML = `<div class="riskbar ${r.fire ? 'hot' : ''}">Impulse risk: <b>${Math.round(r.score * 100)}%</b>${r.fire ? ' — consider pausing' : ''}</div>`;
}

// ----------------------------------------------------------------- Settings
function renderSettings(s) {
  const c = s.settings.consent;
  const imp = s.settings.impulse;
  const el = h(`<section>
    <div class="card">
      <h3>Consent <small>everything is opt-in</small></h3>
      ${consentRow('email', 'Parse email/message text', c.email)}
      ${consentRow('notifications', 'Push notifications', c.notifications)}
      ${consentRow('heartRate', 'Heart-rate sensor (Bluetooth)', c.heartRate)}
      ${consentRow('microphone', 'Ambient sound level (mic loudness only)', c.microphone)}
      ${consentRow('browsing', 'Browsing-context logging', c.browsing)}
    </div>

    <div class="card">
      <h3>Impulse model weights</h3>
      ${weightRow('hrWeight', 'Heart rate', imp.hrWeight)}
      ${weightRow('noiseWeight', 'Ambient noise', imp.noiseWeight)}
      ${weightRow('timeWeight', 'Time of day', imp.timeWeight)}
      ${weightRow('categoryWeight', 'Spending momentum', imp.categoryWeight)}
      ${weightRow('threshold', 'Alert threshold', imp.threshold)}
      <label class="rng">Resting HR <input type="number" data-imp="restingHr" value="${imp.restingHr}" min="40" max="120"></label>
    </div>

    <div class="card">
      <h3>Browsing context <small>manual log</small></h3>
      <p class="muted">A web page cannot watch what you browse on other sites — that needs a browser
      extension (see README). Until then, log a context to feed the model.</p>
      <form id="browseform" class="formgrid">
        <input name="site" placeholder="Site/app (e.g. shopping)" ${c.browsing ? '' : 'disabled'}>
        <select name="kind" ${c.browsing ? '' : 'disabled'}><option value="want">tempting</option><option value="need">utility</option></select>
        <button ${c.browsing ? '' : 'disabled'}>Log</button>
      </form>
    </div>

    <div class="card">
      <h3>Data</h3>
      <p class="muted">All data is stored only in this browser's localStorage.</p>
      <div class="actions">
        <button id="export" class="ghost">Export JSON</button>
        <button id="reset" class="danger">Erase all data</button>
      </div>
    </div>
  </section>`);

  el.querySelectorAll('[data-consent]').forEach((cb) =>
    cb.addEventListener('change', async () => {
      const key = cb.dataset.consent;
      if (cb.checked && key === 'notifications') {
        const p = await Notify.requestPermission();
        if (p !== 'granted') { cb.checked = false; return; }
      }
      store.setConsent(key, cb.checked);
      render();
    })
  );
  el.querySelectorAll('[data-w]').forEach((r) =>
    r.addEventListener('input', () => { store.setSetting('impulse.' + r.dataset.w, Number(r.value)); refreshRiskUI(document); })
  );
  el.querySelector('[data-imp="restingHr"]').addEventListener('change', (e) =>
    store.setSetting('impulse.restingHr', Number(e.target.value))
  );
  el.querySelector('#browseform').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    store.logEvent({ kind: 'browse', site: f.get('site'), necessity: f.get('kind') });
    e.target.reset();
  });
  el.querySelector('#export').addEventListener('click', () => {
    const blob = new Blob([store.export()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'finpulse-data.json'; a.click();
  });
  el.querySelector('#reset').addEventListener('click', () => {
    if (confirm('Erase all FinPulse data on this device?')) { store.reset(); render(); }
  });
  return el;
}

function consentRow(key, text, on) {
  return `<label class="toggle"><input type="checkbox" data-consent="${key}" ${on ? 'checked' : ''}><span>${text}</span></label>`;
}
function weightRow(key, text, val) {
  return `<label class="rng">${text} <input type="range" min="0" max="1" step="0.05" value="${val}" data-w="${key}"><b>${val}</b></label>`;
}

// ---------------------------------------------------------------- helpers
function txTable(list) {
  if (!list.length) return '<p class="muted">No transactions yet.</p>';
  return `<table class="tx"><tbody>${list.map((t) => `
    <tr>
      <td>${new Date(t.date).toLocaleDateString()}</td>
      <td>${escape(t.merchant)} <em class="src">${t.source}</em></td>
      <td>${escape(t.category)}</td>
      <td class="nec ${t.necessity}">${t.necessity}</td>
      <td class="amt ${t.amount < 0 ? 'neg' : 'pos'}">${money(t.amount)}</td>
    </tr>`).join('')}</tbody></table>`;
}

function monthSpend(transactions) {
  const now = new Date();
  const inMonth = transactions.filter((t) => {
    const d = new Date(t.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && t.amount < 0;
  });
  const spent = inMonth.reduce((a, b) => a + b.amount, 0);
  const wants = inMonth.filter((t) => t.necessity === 'want').reduce((a, b) => a + Math.abs(b.amount), 0);
  const total = Math.abs(spent) || 1;
  return { spent, wantRatio: wants / total };
}

function escape(str) {
  return String(str ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// register service worker for PWA + notifications
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

store.subscribe(() => { if (activeTab === 'dashboard' || activeTab === 'settings') updateRiskBanner(); });
render();
