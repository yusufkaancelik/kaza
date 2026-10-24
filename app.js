'use strict';

const PRAYERS = [
  { id: 'sabah', name: 'Sabah' },
  { id: 'ogle', name: 'Öğle' },
  { id: 'ikindi', name: 'İkindi' },
  { id: 'aksam', name: 'Akşam' },
  { id: 'yatsi', name: 'Yatsı' },
  { id: 'vitir', name: 'Vitir' },
];
const STORAGE_KEY = 'kaza-takip';

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
const toastEl = document.getElementById('toast');

let state = load();
let tab = 'home';

// ---------- Storage ----------

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Kaydedilemedi!');
  }
}

// ---------- Helpers ----------

function dateKey(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

const todayKey = () => dateKey(new Date());
const fmtNum = (n) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const fmtDate = (d) => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

function fmtDuration(days) {
  const y = Math.floor(days / 365);
  const m = Math.floor((days % 365) / 30);
  if (y) return m ? `${y} yıl ${m} ay` : `${y} yıl`;
  if (m) return `${m} ay`;
  return `${days} gün`;
}

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { toastEl.hidden = true; }, 1800);
}

const activePrayers = () => PRAYERS.filter((p) => p.id !== 'vitir' || state.witr);
const remaining = (id) => Math.max(0, state.totals[id] - state.done[id]);

function dayTotal(key) {
  const entry = state.log[key];
  return entry ? Object.values(entry).reduce((a, b) => a + b, 0) : 0;
}

function summary() {
  let total = 0;
  let rem = 0;
  for (const p of activePrayers()) {
    total += state.totals[p.id];
    rem += remaining(p.id);
  }
  return { total, rem, done: total - rem };
}

// Average prayers per day over the last 30 days, counted from the first logged day.
function recentAverage() {
  const first = Object.keys(state.log).sort()[0];
  if (!first) return 0;
  let sum = 0;
  let span = 0;
  for (let i = 0; i < 30; i++) {
    const k = dateKey(daysAgo(i));
    if (k < first) break;
    sum += dayTotal(k);
    span++;
  }
  return sum / span;
}

// Consecutive days the daily goal was met; today counts only once it is met.
function streak() {
  let i = dayTotal(todayKey()) >= state.goal ? 0 : 1;
  let n = 0;
  while (dayTotal(dateKey(daysAgo(i))) >= state.goal) {
    n++;
    i++;
  }
  return n;
}

// Days between puberty and the date regular prayers started, minus menstruation days.
function debtDays(birth, pubertyAge, start, hayiz) {
  if (!birth || !start) return 0;
  const [by, bm, bd] = birth.split('-').map(Number);
  const [sy, sm, sd] = start.split('-').map(Number);
  let days = Math.floor((Date.UTC(sy, sm - 1, sd) - Date.UTC(by + pubertyAge, bm - 1, bd)) / 86400000);
  if (days <= 0) return 0;
  days -= Math.round((days / 30.44) * hayiz);
  return Math.max(0, days);
}

// ---------- Setup ----------

function renderSetup() {
  tabbar.hidden = true;
  view.innerHTML = `
    <section class="card">
      <h2>Hoş geldin</h2>
      <p class="muted">Önce kaza borcunu belirleyelim. Bu değerleri sonra Ayarlar'dan düzeltebilirsin.</p>
      <div class="segmented">
        <label><input type="radio" name="mode" value="calc" checked><span>Hesapla</span></label>
        <label><input type="radio" name="mode" value="manual"><span>Elle gir</span></label>
      </div>
      <label class="check"><input type="checkbox" id="witr" checked> Vitir namazını dahil et (Hanefi)</label>
    </section>

    <section class="card" id="calc">
      <label class="field">Doğum tarihi <input type="date" id="birth"></label>
      <div class="field">Cinsiyet
        <div class="segmented">
          <label><input type="radio" name="gender" value="m" checked><span>Erkek</span></label>
          <label><input type="radio" name="gender" value="f"><span>Kadın</span></label>
        </div>
      </div>
      <label class="field">Ergenlik (buluğ) yaşı <input type="number" id="puberty" min="9" max="15" value="12" inputmode="numeric"></label>
      <label class="field">Namazlarını düzenli kılmaya başladığın tarih <input type="date" id="start" value="${todayKey()}"></label>
      <label class="field" id="hayizField" hidden>Aylık ortalama hayız günü <input type="number" id="hayiz" min="0" max="15" value="0" inputmode="numeric"></label>
      <p class="hint">Buluğ yaşı kişiden kişiye değişir. Emin değilsen bir hocaya veya Diyanet'e danış.</p>
    </section>

    <section class="card" id="manual" hidden>
      <p class="muted">Her vakit için kılınmamış namaz sayısını gir.</p>
      ${PRAYERS.map((p) => `
        <label class="field row" id="manual-${p.id}">${p.name}
          <input type="number" min="0" value="0" inputmode="numeric" data-manual="${p.id}">
        </label>`).join('')}
    </section>

    <section class="card">
      <div class="preview" id="preview"></div>
      <button class="primary" data-action="startApp">Başla</button>
    </section>`;
  updatePreview();
}

function readSetup() {
  const witr = view.querySelector('#witr').checked;
  const mode = view.querySelector('[name=mode]:checked').value;
  const totals = {};
  let days = 0;
  if (mode === 'calc') {
    const female = view.querySelector('[name=gender]:checked').value === 'f';
    days = debtDays(
      view.querySelector('#birth').value,
      parseInt(view.querySelector('#puberty').value, 10) || 0,
      view.querySelector('#start').value,
      female ? parseInt(view.querySelector('#hayiz').value, 10) || 0 : 0,
    );
    for (const p of PRAYERS) totals[p.id] = days;
  } else {
    for (const p of PRAYERS) {
      totals[p.id] = Math.max(0, parseInt(view.querySelector(`[data-manual=${p.id}]`).value, 10) || 0);
    }
  }
  if (!witr) totals.vitir = 0;
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  return { mode, witr, totals, days, total };
}

function updatePreview() {
  const s = readSetup();
  const el = view.querySelector('#preview');
  el.innerHTML = s.mode === 'calc'
    ? `${fmtNum(s.days)} gün × ${s.witr ? 6 : 5} vakit<br>Toplam <strong>${fmtNum(s.total)}</strong> vakit kaza`
    : `Toplam <strong>${fmtNum(s.total)}</strong> vakit kaza`;
  view.querySelector('[data-action=startApp]').disabled = s.total === 0;
}

function onSetupInput(e) {
  const t = e.target;
  if (t.name === 'mode') {
    view.querySelector('#calc').hidden = t.value !== 'calc';
    view.querySelector('#manual').hidden = t.value !== 'manual';
  } else if (t.name === 'gender') {
    view.querySelector('#puberty').value = t.value === 'f' ? 9 : 12;
    view.querySelector('#hayizField').hidden = t.value !== 'f';
  } else if (t.id === 'witr') {
    view.querySelector('#manual-vitir').hidden = !t.checked;
  }
  updatePreview();
}

// ---------- Home ----------

function estimateRow(label, perDay, rem) {
  const days = Math.ceil(rem / perDay);
  return `
    <div class="est">
      <span>${label} <small>(${fmtNum(perDay)} vakit/gün)</small></span>
      <strong>${fmtDuration(days)}</strong>
      <small class="end">${fmtDate(daysAgo(-days))}</small>
    </div>`;
}

function renderHome() {
  const { total, rem, done } = summary();
  const pct = total ? (done / total) * 100 : 100;
  const today = state.log[todayKey()] || {};
  const avg = recentAverage();

  view.innerHTML = `
    <section class="card hero">
      <div class="muted">Kalan kaza</div>
      <div class="big">${fmtNum(rem)}</div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="muted small">${fmtNum(done)} / ${fmtNum(total)} kılındı · %${pct.toFixed(1)}</div>
    </section>

    <section class="card today">
      <div><div class="muted small">Bugün</div><strong>${dayTotal(todayKey())} / ${state.goal}</strong> vakit</div>
      <button class="primary" data-action="addDay" ${rem ? '' : 'disabled'}>+1 günlük kıldım</button>
    </section>

    <section class="prayers">
      ${activePrayers().map((p) => `
        <div class="card prayer">
          <div class="name">${p.name}</div>
          <div class="count">${fmtNum(remaining(p.id))}</div>
          <div class="muted small">bugün ${today[p.id] || 0}</div>
          <div class="actions">
            <button class="ghost" data-action="undo" data-id="${p.id}" ${today[p.id] ? '' : 'disabled'} aria-label="${p.name} geri al">−</button>
            <button class="primary" data-action="add" data-id="${p.id}" ${remaining(p.id) ? '' : 'disabled'}>+1</button>
          </div>
        </div>`).join('')}
    </section>

    <section class="card">
      <h3>Tahmini bitiş</h3>
      ${rem === 0
        ? '<p>Tüm kazalar tamamlandı. Allah kabul etsin!</p>'
        : estimateRow('Günlük hedefinle', state.goal, rem) + (avg > 0 ? estimateRow('Son 30 gün ortalamanla', avg, rem) : '')}
    </section>`;
}

function addPrayer(id) {
  if (!remaining(id)) return;
  const entry = (state.log[todayKey()] ||= {});
  entry[id] = (entry[id] || 0) + 1;
  state.done[id]++;
}

// ---------- History ----------

function renderHistory() {
  const rows = [];
  let max = state.goal;
  for (let i = 0; i < 30; i++) {
    const d = daysAgo(i);
    const n = dayTotal(dateKey(d));
    rows.push({ d, n });
    max = Math.max(max, n);
  }
  const sum = (list) => list.reduce((a, r) => a + r.n, 0);

  view.innerHTML = `
    <section class="card stats">
      <div><div class="muted small">Son 7 gün</div><strong>${fmtNum(sum(rows.slice(0, 7)))}</strong></div>
      <div><div class="muted small">Son 30 gün</div><strong>${fmtNum(sum(rows))}</strong></div>
      <div><div class="muted small">Hedef serisi</div><strong>${streak()} gün</strong></div>
    </section>

    <section class="card">
      <h3>Son 30 gün</h3>
      <ul class="history">
        ${rows.map((r) => `
          <li class="${r.n >= state.goal ? 'hit' : ''}">
            <span>${r.d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
              <small>${r.d.toLocaleDateString('tr-TR', { weekday: 'short' })}</small></span>
            <span class="bar"><span style="width:${(r.n / max) * 100}%"></span></span>
            <span class="n">${r.n}</span>
          </li>`).join('')}
      </ul>
    </section>`;
}

// ---------- Settings ----------

function renderSettings() {
  view.innerHTML = `
    <section class="card">
      <h3>Günlük hedef</h3>
      <label class="field row">Vakit / gün <input type="number" id="goal" min="1" value="${state.goal}" inputmode="numeric"></label>
    </section>

    <section class="card">
      <h3>Kalan borcu düzenle</h3>
      <p class="hint">Yanlış hesaplandıysa ya da daha önce kıldıkların varsa buradan düzelt.</p>
      ${activePrayers().map((p) => `
        <label class="field row">${p.name}
          <input type="number" min="0" value="${remaining(p.id)}" inputmode="numeric" data-rem="${p.id}">
        </label>`).join('')}
      <button class="primary" data-action="saveRemaining">Kaydet</button>
    </section>

    <section class="card">
      <h3>Yedek</h3>
      <p class="hint">Veriler sadece bu telefonda saklanır. Arada bir yedeği kopyalayıp Notlar'a yapıştırman iyi olur.</p>
      <button data-action="copyBackup">Yedeği kopyala</button>
      <textarea id="backup" rows="3" placeholder="Yedek metnini buraya yapıştır"></textarea>
      <button data-action="restore">Yedekten geri yükle</button>
    </section>

    <section class="card">
      <button class="danger" data-action="reset">Tüm verileri sıfırla</button>
    </section>

    <p class="hint center">Fıkhi konularda Diyanet'e veya bir hocaya danışmayı unutma.</p>`;
}

// ---------- Actions ----------

const actions = {
  startApp() {
    const s = readSetup();
    state = {
      witr: s.witr,
      totals: s.totals,
      done: Object.fromEntries(PRAYERS.map((p) => [p.id, 0])),
      log: {},
      goal: s.witr ? 6 : 5,
    };
    save();
    tab = 'home';
    render();
  },
  add(id) {
    addPrayer(id);
    save();
    render();
  },
  addDay() {
    for (const p of activePrayers()) addPrayer(p.id);
    save();
    render();
  },
  undo(id) {
    const entry = state.log[todayKey()];
    if (!entry?.[id]) return;
    entry[id]--;
    state.done[id]--;
    save();
    render();
  },
  saveRemaining() {
    for (const input of view.querySelectorAll('[data-rem]')) {
      const id = input.dataset.rem;
      state.totals[id] = state.done[id] + Math.max(0, parseInt(input.value, 10) || 0);
    }
    save();
    toast('Kaydedildi');
  },
  async copyBackup() {
    const text = JSON.stringify(state);
    try {
      await navigator.clipboard.writeText(text);
      toast('Yedek kopyalandı');
    } catch {
      const area = view.querySelector('#backup');
      area.value = text;
      area.select();
      toast('Metni seçip kopyala');
    }
  },
  restore() {
    let data;
    try {
      data = JSON.parse(view.querySelector('#backup').value);
    } catch {
      data = null;
    }
    if (!data?.totals || !data?.done || !data?.log) {
      toast('Geçersiz yedek');
      return;
    }
    if (!confirm('Mevcut verilerin yerine yedek yüklensin mi?')) return;
    state = data;
    save();
    tab = 'home';
    render();
    toast('Yedek yüklendi');
  },
  reset() {
    if (!confirm('Tüm veriler silinecek. Emin misin?')) return;
    state = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    render();
  },
};

// ---------- Wiring ----------

function render() {
  if (!state) return renderSetup();
  tabbar.hidden = false;
  for (const b of tabbar.querySelectorAll('button')) b.classList.toggle('active', b.dataset.tab === tab);
  ({ home: renderHome, history: renderHistory, settings: renderSettings })[tab]();
}

view.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (btn && !btn.disabled) actions[btn.dataset.action](btn.dataset.id);
});

view.addEventListener('input', (e) => {
  if (!state) onSetupInput(e);
});

view.addEventListener('change', (e) => {
  if (e.target.id === 'goal') {
    state.goal = Math.max(1, parseInt(e.target.value, 10) || 1);
    e.target.value = state.goal;
    save();
  }
});

tabbar.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tab]');
  if (!btn) return;
  tab = btn.dataset.tab;
  render();
  window.scrollTo(0, 0);
});

// Refresh "today" when the app comes back from the background.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state) render();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
navigator.storage?.persist?.().catch(() => {});

render();
