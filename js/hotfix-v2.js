import { SESSION_KEY, SCU_DEFAULTS } from './config.js';
import { bootstrap, saveOperator, saveOlp, saveCalendarEntry } from './api.js';
import { durationHours, validateServiceEntry, operatorHourTotals } from './scu-rules.js';

const $ = s => document.querySelector(s);
const session = (() => {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
  catch { return null; }
})();
if (!session?.token) throw new Error('Sessione ATLAS SCU non disponibile.');

let busy = false;
let editorKind = null;
let editorId = null;
let currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

const style = document.createElement('style');
style.textContent = `
  .atlas-busy-overlay{position:fixed;inset:0;z-index:99999;display:none;place-items:center;background:rgba(3,9,14,.76);backdrop-filter:blur(7px)}
  .atlas-busy-overlay.show{display:grid}
  .atlas-busy-card{width:min(470px,calc(100vw - 32px));padding:25px;border:1px solid rgba(255,255,255,.12);border-radius:20px;background:#0d1823;color:#fff;box-shadow:0 30px 90px rgba(0,0,0,.48);text-align:center}
  .atlas-busy-spinner{width:38px;height:38px;margin:0 auto 14px;border:4px solid rgba(255,255,255,.14);border-top-color:#d9273f;border-radius:50%;animation:atlasSpin .8s linear infinite}
  .atlas-busy-card strong{display:block;font-size:16px}.atlas-busy-card span{display:block;margin-top:7px;color:#91a4b5;font-size:13px;line-height:1.45}
  .atlas-progress{height:11px;margin:18px 0 7px;border-radius:999px;overflow:hidden;background:#071019;border:1px solid rgba(255,255,255,.09)}
  .atlas-progress>i{display:block;width:0;height:100%;border-radius:999px;background:linear-gradient(90deg,#8dd8f3,#d9273f);transition:width .22s ease}
  .atlas-progress-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:4px;color:#8398aa;font-size:11px}.atlas-progress-row b{color:#e8f0f6;font-size:12px}
  .generator-shift-card{grid-column:span 1;padding:13px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.025)}
  .generator-shift-card h3{margin:0 0 10px;font-size:13px}.generator-shift-card .mini-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
  .generator-shift-card label{display:grid;gap:5px;color:#b6c4cf;font-size:11px}.generator-shift-card input{width:100%;height:40px;border:1px solid rgba(255,255,255,.09);border-radius:9px;background:#08121b;color:#fff;padding:0 9px}
  .generator-rule{grid-column:1/-1;padding:12px 14px;border-radius:12px;background:rgba(158,220,244,.07);border:1px solid rgba(158,220,244,.14);color:#a9bdcc;font-size:12px;line-height:1.5}
  @keyframes atlasSpin{to{transform:rotate(360deg)}}
  body.atlas-busy{overflow:hidden}
  body.atlas-busy .app-shell{pointer-events:none;user-select:none}
  @media(max-width:620px){.generator-shift-card{grid-column:1/-1}}
`;
document.head.appendChild(style);

const overlay = document.createElement('div');
overlay.className = 'atlas-busy-overlay';
overlay.setAttribute('role', 'status');
overlay.setAttribute('aria-live', 'polite');
overlay.innerHTML = `
  <div class="atlas-busy-card">
    <div class="atlas-busy-spinner"></div>
    <strong id="atlasBusyTitle">Operazione in corso</strong>
    <span id="atlasBusyText">Attendi qualche secondo e non premere più volte.</span>
    <div class="atlas-progress" id="atlasProgress"><i id="atlasProgressFill"></i></div>
    <div class="atlas-progress-row"><span id="atlasProgressLabel">Preparazione…</span><b id="atlasProgressPct">0%</b></div>
  </div>`;
document.body.appendChild(overlay);

function setProgress(percent, label = '') {
  const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  $('#atlasProgressFill').style.width = `${pct}%`;
  $('#atlasProgressPct').textContent = `${pct}%`;
  if (label) $('#atlasProgressLabel').textContent = label;
}
function setBusy(title, text = 'Attendi qualche secondo e non premere più volte.', progress = 0, label = 'Preparazione…') {
  busy = true;
  $('#atlasBusyTitle').textContent = title;
  $('#atlasBusyText').textContent = text;
  setProgress(progress, label);
  overlay.classList.add('show');
  document.body.classList.add('atlas-busy');
}
function updateBusy(title, text, progress, label) {
  if (title) $('#atlasBusyTitle').textContent = title;
  if (text) $('#atlasBusyText').textContent = text;
  if (progress !== undefined) setProgress(progress, label || 'In corso…');
}
function clearBusy() {
  busy = false;
  overlay.classList.remove('show');
  document.body.classList.remove('atlas-busy');
  setProgress(0, 'Preparazione…');
}
function message(text, kind = 'error') {
  const el = $('#globalMessage');
  if (!el) return;
  el.textContent = text;
  el.dataset.kind = kind;
  el.classList.toggle('show', Boolean(text));
}
function value(row, ...keys) {
  for (const k of keys) if (row && row[k] !== undefined && row[k] !== null) return row[k];
  return '';
}
function activeFlag(row) {
  const v = value(row, 'ATTIVO', 'active');
  return v === true || ['TRUE', '1', 'SI', 'SÌ'].includes(String(v).toUpperCase());
}
function dateOnly(v) { return String(v || '').slice(0, 10); }
function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function projectById(projects, id) { return projects.find(p => String(value(p, 'ID_PROGETTO', 'id')) === String(id)); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function pairKey(a, b) { return [String(a), String(b)].sort().join('|'); }

// Rende il generatore esplicito: 3 SCU al mattino e 3 al pomeriggio.
const generatorFields = $('#generatorForm .dialog-fields');
if (generatorFields) {
  generatorFields.innerHTML = `
    <div class="generator-shift-card">
      <h3>Mattina · 3 SCU</h3>
      <div class="mini-grid">
        <label>Inizio<input name="morningStart" type="time" value="08:00" required></label>
        <label>Fine<input name="morningEnd" type="time" value="13:00" required></label>
      </div>
    </div>
    <div class="generator-shift-card">
      <h3>Pomeriggio · 3 SCU</h3>
      <div class="mini-grid">
        <label>Inizio<input name="afternoonStart" type="time" value="13:00" required></label>
        <label>Fine<input name="afternoonEnd" type="time" value="18:00" required></label>
      </div>
    </div>
    <div class="generator-rule"><strong>Rotazione automatica dei gruppi.</strong> ATLAS evita squadre fisse: alterna mattina/pomeriggio e cerca ogni giorno combinazioni diverse, penalizzando le coppie di SCU che hanno già lavorato spesso insieme. Le giornate già compilate, le assenze e le festività nazionali restano invariate.</div>`;
}

// Anti rage-clicking: blocca doppi click ravvicinati sui comandi che scrivono dati.
document.addEventListener('click', event => {
  const action = event.target.closest('#dialogSave,#generatorSave,#saveSettingsButton,#newOperator,#newOlp,.edit-operator,.edit-olp');
  if (!action) return;
  const now = Date.now();
  const previous = Number(action.dataset.atlasClickAt || 0);
  if (now - previous < 900) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  action.dataset.atlasClickAt = String(now);
}, true);

document.addEventListener('click', event => {
  if (!busy) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

document.addEventListener('click', event => {
  if (event.target.closest('#newOperator')) { editorKind = 'operator'; editorId = null; return; }
  if (event.target.closest('#newOlp')) { editorKind = 'olp'; editorId = null; return; }
  const op = event.target.closest('[data-operator-id]');
  if (op && op.closest('#operatorsBody')) { editorKind = 'operator'; editorId = op.dataset.operatorId || event.target.closest('.edit-operator')?.dataset.id || null; return; }
  const olp = event.target.closest('[data-olp-id]');
  if (olp && olp.closest('#olpBody')) { editorKind = 'olp'; editorId = olp.dataset.olpId || event.target.closest('.edit-olp')?.dataset.id || null; }
}, true);

document.addEventListener('click', event => {
  if (event.target.closest('#prevMonth')) currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  if (event.target.closest('#nextMonth')) currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
}, true);

// Salvataggio anagrafiche robusto con overlay anti-rage-clicking.
document.addEventListener('submit', async event => {
  if (event.target?.id !== 'editorForm') return;
  const form = event.target;
  const inferred = form.querySelector('[name="substitute"]') ? 'operator' : (editorKind === 'olp' ? 'olp' : null);
  const kind = editorKind || inferred;
  if (!['operator', 'olp'].includes(kind)) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  if (busy) return;

  const data = Object.fromEntries(new FormData(form).entries());
  if (!String(data.surname || '').trim() || !String(data.name || '').trim()) {
    message('Nome e cognome sono obbligatori.');
    return;
  }

  setBusy(kind === 'operator' ? 'Salvataggio operatore…' : 'Salvataggio OLP…', 'Sto aggiornando l’anagrafica. I comandi sono temporaneamente bloccati per evitare invii multipli.', 25, 'Invio dati');
  try {
    if (kind === 'operator') {
      await saveOperator(session.token, { ...data, id: editorId || undefined, active: data.active === 'TRUE', substitute: data.substitute === 'TRUE' });
    } else {
      await saveOlp(session.token, { ...data, id: editorId || undefined, active: data.active === 'TRUE' });
    }
    updateBusy('Salvato', 'Aggiorno i dati…', 100, 'Completato');
    await sleep(250);
    location.reload();
  } catch (err) {
    clearBusy();
    message(err?.message || 'Salvataggio non riuscito.');
  }
}, true);

function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}
function isHoliday(date) {
  const md = `${date.getMonth() + 1}-${date.getDate()}`;
  const fixed = new Set(['1-1', '1-6', '4-25', '5-1', '6-2', '8-15', '11-1', '12-8', '12-25', '12-26']);
  if (fixed.has(md)) return true;
  const easter = easterSunday(date.getFullYear());
  const monday = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + 1);
  return iso(date) === iso(monday);
}
function withinServicePeriod(op, date) {
  const d = iso(date), start = dateOnly(value(op, 'DATA_INIZIO', 'startDate')), end = dateOnly(value(op, 'DATA_FINE', 'endDate'));
  return (!start || d >= start) && (!end || d <= end);
}
function shiftOf(entry, afternoonStart) {
  const start = String(value(entry, 'ORA_INIZIO', 'start') || '').slice(0, 5);
  return start && start >= afternoonStart ? 'A' : 'M';
}
function combinations(items, size) {
  if (size <= 0) return [[]];
  if (size > items.length) return [];
  const out = [];
  const walk = (start, chosen) => {
    if (chosen.length === size) { out.push([...chosen]); return; }
    for (let i = start; i <= items.length - (size - chosen.length); i++) {
      chosen.push(items[i]); walk(i + 1, chosen); chosen.pop();
    }
  };
  walk(0, []);
  return out;
}

function choosePartition(pool, morningNeed, afternoonNeed, ctx) {
  const totalNeed = morningNeed + afternoonNeed;
  const selected = pool.slice(0, totalNeed);
  if (!selected.length) return { morning: [], afternoon: [] };
  if (!morningNeed) return { morning: [], afternoon: selected.slice(0, afternoonNeed) };
  if (!afternoonNeed) return { morning: selected.slice(0, morningNeed), afternoon: [] };

  const combos = combinations(selected, morningNeed);
  let best = null;
  for (const morning of combos) {
    const morningIds = new Set(morning.map(x => x.id));
    const afternoon = selected.filter(x => !morningIds.has(x.id)).slice(0, afternoonNeed);
    if (afternoon.length < afternoonNeed) continue;

    let score = 0;
    const morningGroup = [...ctx.existingMorning, ...morning.map(x => x.id)];
    const afternoonGroup = [...ctx.existingAfternoon, ...afternoon.map(x => x.id)];

    // Priorità alta: evitare che si ricreino sempre le stesse terne/coppie.
    for (const group of [morningGroup, afternoonGroup]) {
      for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) score += (ctx.pairCounts.get(pairKey(group[i], group[j])) || 0) * 12;
    }

    // Alternanza personale mattina/pomeriggio.
    for (const x of morning) {
      const c = ctx.shiftCounts.get(x.id) || { M: 0, A: 0 };
      score += Math.max(0, c.M - c.A) * 4;
      if (ctx.lastShift.get(x.id) === 'M') score += 2.5;
      if (x.currentHours + x.plannedHours + ctx.morningHours > x.target + 0.001) score += 100000;
    }
    for (const x of afternoon) {
      const c = ctx.shiftCounts.get(x.id) || { M: 0, A: 0 };
      score += Math.max(0, c.A - c.M) * 4;
      if (ctx.lastShift.get(x.id) === 'A') score += 2.5;
      if (x.currentHours + x.plannedHours + ctx.afternoonHours > x.target + 0.001) score += 100000;
    }

    // Piccolo tie-break deterministico per non favorire sempre l'ordine anagrafico.
    score += morning.reduce((s, x) => s + ((ctx.daySeed + x.hash) % 17) / 1000, 0);
    if (!best || score < best.score) best = { score, morning, afternoon };
  }
  if (!best || best.score >= 100000) return { morning: [], afternoon: [] };
  return { morning: best.morning, afternoon: best.afternoon };
}

function addPairs(pairCounts, ids) {
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const key = pairKey(ids[i], ids[j]);
    pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
  }
}

// Generatore 3+3: rotazione delle terne e alternanza mattina/pomeriggio.
document.addEventListener('submit', async event => {
  if (event.target?.id !== 'generatorForm') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (busy) return;

  const formData = Object.fromEntries(new FormData(event.target).entries());
  const morning = { start: formData.morningStart, end: formData.morningEnd };
  const afternoon = { start: formData.afternoonStart, end: formData.afternoonEnd };
  const baseSettings = { ...SCU_DEFAULTS };
  const earlyErrors = [...validateServiceEntry(morning, baseSettings), ...validateServiceEntry(afternoon, baseSettings)];
  if (earlyErrors.length) { message([...new Set(earlyErrors)].join(' ')); return; }

  setBusy('Preparazione calendario…', 'Analizzo disponibilità e costruisco terne diverse per favorire la conoscenza tra tutti gli SCU.', 2, 'Lettura dati');
  try {
    const data = await bootstrap(session.token);
    const settings = { ...SCU_DEFAULTS, ...(data.settings || {}) };
    const errors = [...validateServiceEntry(morning, settings), ...validateServiceEntry(afternoon, settings)];
    if (errors.length) throw new Error([...new Set(errors)].join(' '));

    const operators = (data.operators || []).filter(activeFlag);
    const calendar = data.calendar || [];
    const absences = data.absences || [];
    const projects = data.projects || [];
    if (!operators.length) throw new Error('Non ci sono operatori attivi da programmare.');

    const morningHours = durationHours(morning.start, morning.end) || 0;
    const afternoonHours = durationHours(afternoon.start, afternoon.end) || 0;
    const monthPrefix = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
    const monthCalendar = calendar.filter(r => dateOnly(value(r, 'DATA', 'date')).startsWith(monthPrefix));
    const calendarKeys = new Set(calendar.map(r => `${value(r, 'OPERATORE_ID', 'operatorId')}|${dateOnly(value(r, 'DATA', 'date'))}`));
    const absenceKeys = new Set(absences.map(r => `${value(r, 'OPERATORE_ID', 'operatorId')}|${dateOnly(value(r, 'DATA', 'date'))}`));

    const pairCounts = new Map();
    const shiftCounts = new Map();
    const dayCounts = new Map();
    const lastShift = new Map();
    const plannedHours = new Map();
    const currentHours = new Map();
    const targets = new Map();

    for (const op of operators) {
      const id = String(value(op, 'ID_OPERATORE', 'id'));
      shiftCounts.set(id, { M: 0, A: 0 }); dayCounts.set(id, 0); plannedHours.set(id, 0);
      currentHours.set(id, Number(operatorHourTotals(calendar, id).recognized || 0));
      const project = projectById(projects, value(op, 'PROGETTO_ID', 'projectId'));
      targets.set(id, Number(value(project, 'MONTE_ORE', 'annualHours')) || Number(settings.annualHours) || 1145);
    }
    for (const entry of monthCalendar) {
      const id = String(value(entry, 'OPERATORE_ID', 'operatorId'));
      if (!shiftCounts.has(id)) continue;
      const sh = shiftOf(entry, afternoon.start);
      shiftCounts.get(id)[sh] += 1;
      dayCounts.set(id, (dayCounts.get(id) || 0) + 1);
    }

    updateBusy('Costruzione rotazioni…', 'Cerco combinazioni che riducano le coppie ripetute e bilancino mattina/pomeriggio.', 7, 'Ottimizzazione gruppi');

    const tasks = [];
    let capacitySkipped = 0;
    const days = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();

    for (let day = 1; day <= days; day++) {
      const dateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
      const date = iso(dateObj), dow = dateObj.getDay();
      if (dow === 0 || dow === 6 || isHoliday(dateObj)) continue;

      const existingToday = monthCalendar.filter(r => dateOnly(value(r, 'DATA', 'date')) === date && String(value(r, 'TIPO', 'type') || 'SERVIZIO').toUpperCase() === 'SERVIZIO');
      const existingMorning = existingToday.filter(r => shiftOf(r, afternoon.start) === 'M').map(r => String(value(r, 'OPERATORE_ID', 'operatorId'))).slice(0, 3);
      const existingAfternoon = existingToday.filter(r => shiftOf(r, afternoon.start) === 'A').map(r => String(value(r, 'OPERATORE_ID', 'operatorId'))).slice(0, 3);
      const morningNeed = Math.max(0, 3 - existingMorning.length);
      const afternoonNeed = Math.max(0, 3 - existingAfternoon.length);
      const needed = morningNeed + afternoonNeed;

      const candidates = operators.map(op => {
        const id = String(value(op, 'ID_OPERATORE', 'id'));
        return {
          op, id,
          currentHours: currentHours.get(id) || 0,
          plannedHours: plannedHours.get(id) || 0,
          target: targets.get(id) || 1145,
          hash: [...id].reduce((s, ch) => s + ch.charCodeAt(0), 0)
        };
      }).filter(x => withinServicePeriod(x.op, dateObj))
        .filter(x => !calendarKeys.has(`${x.id}|${date}`) && !absenceKeys.has(`${x.id}|${date}`))
        .filter(x => x.currentHours + x.plannedHours + Math.min(morningHours, afternoonHours) <= x.target + 0.001)
        .sort((a, b) => {
          const daysDiff = (dayCounts.get(a.id) || 0) - (dayCounts.get(b.id) || 0);
          if (daysDiff) return daysDiff;
          const hoursDiff = (a.currentHours + a.plannedHours) - (b.currentHours + b.plannedHours);
          if (hoursDiff) return hoursDiff;
          return ((a.hash + day * 7) % 97) - ((b.hash + day * 7) % 97);
        });

      if (candidates.length > needed) capacitySkipped += candidates.length - needed;
      const pool = candidates.slice(0, needed);
      const partition = choosePartition(pool, morningNeed, afternoonNeed, {
        existingMorning, existingAfternoon, pairCounts, shiftCounts, lastShift,
        morningHours, afternoonHours, daySeed: day * 31 + currentMonth.getMonth() * 17
      });

      const assignments = [
        ...partition.morning.map(x => ({ ...x, shift: 'M', start: morning.start, end: morning.end, hours: morningHours, label: 'Mattina' })),
        ...partition.afternoon.map(x => ({ ...x, shift: 'A', start: afternoon.start, end: afternoon.end, hours: afternoonHours, label: 'Pomeriggio' }))
      ];

      const generatedMorning = [];
      const generatedAfternoon = [];
      for (const a of assignments) {
        const projectId = value(a.op, 'PROGETTO_ID', 'projectId');
        const project = projectById(projects, projectId);
        tasks.push({
          operatorId: a.id,
          projectId,
          date,
          start: a.start,
          end: a.end,
          type: 'SERVIZIO',
          effectiveHours: a.hours,
          recognizedHours: a.hours,
          site: value(project, 'SEDE_ATTUAZIONE', 'site') || '',
          notes: `Generato automaticamente da ATLAS SCU · ${a.label} · rotazione gruppi`
        });
        plannedHours.set(a.id, (plannedHours.get(a.id) || 0) + a.hours);
        dayCounts.set(a.id, (dayCounts.get(a.id) || 0) + 1);
        shiftCounts.get(a.id)[a.shift] += 1;
        lastShift.set(a.id, a.shift);
        if (a.shift === 'M') generatedMorning.push(a.id); else generatedAfternoon.push(a.id);
      }

      addPairs(pairCounts, [...existingMorning, ...generatedMorning]);
      addPairs(pairCounts, [...existingAfternoon, ...generatedAfternoon]);
      for (const id of existingMorning) lastShift.set(id, 'M');
      for (const id of existingAfternoon) lastShift.set(id, 'A');
    }

    if (!tasks.length) {
      clearBusy();
      $('#generatorDialog')?.close();
      message('Nessuna giornata da generare: mese già compilato, periodi di servizio non compatibili o monte ore già raggiunto.', 'success');
      return;
    }

    const morningTotal = tasks.filter(t => t.start === morning.start && t.end === morning.end).length;
    const afternoonTotal = tasks.length - morningTotal;

    for (let i = 0; i < tasks.length; i++) {
      const pct = 10 + ((i + 1) / tasks.length) * 88;
      updateBusy('Generazione calendario…', `Salvataggio giornata ${i + 1} di ${tasks.length}. ATLAS sta alternando i gruppi per evitare terne fisse.`, pct, `${i + 1} / ${tasks.length}`);
      await saveCalendarEntry(session.token, tasks[i]);
      if ((i + 1) % 10 === 0) await sleep(100);
    }

    updateBusy('Calendario generato', `${morningTotal} assegnazioni al mattino e ${afternoonTotal} al pomeriggio salvate. Aggiorno la schermata…`, 100, 'Completato');
    await sleep(350);
    if (capacitySkipped > 0) sessionStorage.setItem('atlas-scu-generator-note', `Calendario generato con rotazione 3+3. In alcune giornate c'erano più di 6 operatori disponibili: ${capacitySkipped} disponibilità non sono state assegnate per rispettare il limite di 3 mattina + 3 pomeriggio.`);
    location.reload();
  } catch (err) {
    clearBusy();
    message(`Generazione non riuscita: ${err?.message || 'errore di comunicazione'}.`);
  }
}, true);

// Mostra eventuale nota lasciata dal generatore dopo il reload.
const generatorNote = sessionStorage.getItem('atlas-scu-generator-note');
if (generatorNote) {
  sessionStorage.removeItem('atlas-scu-generator-note');
  setTimeout(() => message(generatorNote, 'success'), 250);
}
