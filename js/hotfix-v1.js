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
  .atlas-busy-overlay{position:fixed;inset:0;z-index:99999;display:none;place-items:center;background:rgba(3,9,14,.72);backdrop-filter:blur(6px)}
  .atlas-busy-overlay.show{display:grid}
  .atlas-busy-card{width:min(420px,calc(100vw - 32px));padding:24px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:#0d1823;color:#fff;box-shadow:0 30px 90px rgba(0,0,0,.45);text-align:center}
  .atlas-busy-spinner{width:38px;height:38px;margin:0 auto 14px;border:4px solid rgba(255,255,255,.14);border-top-color:#d9273f;border-radius:50%;animation:atlasSpin .8s linear infinite}
  .atlas-busy-card strong{display:block;font-size:16px}.atlas-busy-card span{display:block;margin-top:7px;color:#91a4b5;font-size:13px;line-height:1.45}
  @keyframes atlasSpin{to{transform:rotate(360deg)}}
  body.atlas-busy{overflow:hidden}
  body.atlas-busy .app-shell{pointer-events:none;user-select:none}
`;
document.head.appendChild(style);

const overlay = document.createElement('div');
overlay.className = 'atlas-busy-overlay';
overlay.setAttribute('role', 'status');
overlay.setAttribute('aria-live', 'polite');
overlay.innerHTML = '<div class="atlas-busy-card"><div class="atlas-busy-spinner"></div><strong id="atlasBusyTitle">Operazione in corso</strong><span id="atlasBusyText">Attendi qualche secondo e non premere più volte.</span></div>';
document.body.appendChild(overlay);

function setBusy(title, text = 'Attendi qualche secondo e non premere più volte.') {
  busy = true;
  $('#atlasBusyTitle').textContent = title;
  $('#atlasBusyText').textContent = text;
  overlay.classList.add('show');
  document.body.classList.add('atlas-busy');
}
function updateBusy(title, text) {
  if (title) $('#atlasBusyTitle').textContent = title;
  if (text) $('#atlasBusyText').textContent = text;
}
function clearBusy() {
  busy = false;
  overlay.classList.remove('show');
  document.body.classList.remove('atlas-busy');
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

// Se una scrittura e' in corso, nessun altro click puo' avviare una seconda operazione.
document.addEventListener('click', event => {
  if (!busy) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

// Tracciamo quale anagrafica si sta modificando prima che app-v2 apra il dialog.
document.addEventListener('click', event => {
  if (event.target.closest('#newOperator')) { editorKind = 'operator'; editorId = null; return; }
  if (event.target.closest('#newOlp')) { editorKind = 'olp'; editorId = null; return; }
  const op = event.target.closest('[data-operator-id]');
  if (op && op.closest('#operatorsBody')) { editorKind = 'operator'; editorId = op.dataset.operatorId || event.target.closest('.edit-operator')?.dataset.id || null; return; }
  const olp = event.target.closest('[data-olp-id]');
  if (olp && olp.closest('#olpBody')) { editorKind = 'olp'; editorId = olp.dataset.olpId || event.target.closest('.edit-olp')?.dataset.id || null; }
}, true);

// Manteniamo sincronizzato il mese del generatore con i pulsanti precedente/successivo.
document.addEventListener('click', event => {
  if (event.target.closest('#prevMonth')) currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  if (event.target.closest('#nextMonth')) currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
}, true);

// Salvataggio anagrafiche robusto: una sola richiesta, overlay, reload pulito dopo il successo.
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

  setBusy(kind === 'operator' ? 'Salvataggio operatore…' : 'Salvataggio OLP…', 'Sto aggiornando l’anagrafica. I comandi sono temporaneamente bloccati per evitare invii multipli.');
  try {
    if (kind === 'operator') {
      await saveOperator(session.token, {
        ...data,
        id: editorId || undefined,
        active: data.active === 'TRUE',
        substitute: data.substitute === 'TRUE'
      });
    } else {
      await saveOlp(session.token, {
        ...data,
        id: editorId || undefined,
        active: data.active === 'TRUE'
      });
    }
    updateBusy('Salvato', 'Aggiorno i dati…');
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

// Generatore sostitutivo: niente Promise.all sulle scritture Google Sheets.
// Le giornate vengono salvate in sequenza per evitare collisioni tra esecuzioni Apps Script.
document.addEventListener('submit', async event => {
  if (event.target?.id !== 'generatorForm') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (busy) return;

  const formData = Object.fromEntries(new FormData(event.target).entries());
  const baseSettings = { ...SCU_DEFAULTS };
  const validation = validateServiceEntry({ start: formData.start, end: formData.end }, baseSettings);
  if (validation.length) { message(validation.join(' ')); return; }

  setBusy('Preparazione calendario…', 'Controllo operatori, giornate già presenti, assenze e monte ore.');
  try {
    const data = await bootstrap(session.token);
    const settings = { ...SCU_DEFAULTS, ...(data.settings || {}) };
    const errors = validateServiceEntry({ start: formData.start, end: formData.end }, settings);
    if (errors.length) throw new Error(errors.join(' '));

    const operators = (data.operators || []).filter(activeFlag);
    const calendar = data.calendar || [];
    const absences = data.absences || [];
    const projects = data.projects || [];
    if (!operators.length) throw new Error('Non ci sono operatori attivi da programmare.');

    const dailyHours = durationHours(formData.start, formData.end) || 0;
    const calendarKeys = new Set(calendar.map(r => `${value(r, 'OPERATORE_ID', 'operatorId')}|${dateOnly(value(r, 'DATA', 'date'))}`));
    const absenceKeys = new Set(absences.map(r => `${value(r, 'OPERATORE_ID', 'operatorId')}|${dateOnly(value(r, 'DATA', 'date'))}`));
    const tasks = [];
    const days = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();

    for (const op of operators) {
      const oid = String(value(op, 'ID_OPERATORE', 'id'));
      const projectId = value(op, 'PROGETTO_ID', 'projectId');
      const project = projectById(projects, projectId);
      const current = operatorHourTotals(calendar, oid).recognized;
      const target = Number(value(project, 'MONTE_ORE', 'annualHours')) || Number(settings.annualHours) || 1145;
      let planned = 0;

      for (let day = 1; day <= days; day++) {
        const dateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        const date = iso(dateObj), dow = dateObj.getDay();
        if (dow === 0 || dow === 6 || isHoliday(dateObj)) continue;
        if (!withinServicePeriod(op, dateObj)) continue;
        if (calendarKeys.has(`${oid}|${date}`) || absenceKeys.has(`${oid}|${date}`)) continue;
        if (current + planned + dailyHours > target + 0.001) continue;
        planned += dailyHours;
        tasks.push({
          operatorId: oid,
          projectId,
          date,
          start: formData.start,
          end: formData.end,
          type: 'SERVIZIO',
          effectiveHours: dailyHours,
          recognizedHours: dailyHours,
          site: value(project, 'SEDE_ATTUAZIONE', 'site') || '',
          notes: 'Generato automaticamente da ATLAS SCU'
        });
      }
    }

    if (!tasks.length) {
      clearBusy();
      $('#generatorDialog')?.close();
      message('Nessuna giornata da generare: mese già compilato, periodo di servizio non compatibile o monte ore già raggiunto.', 'success');
      return;
    }

    for (let i = 0; i < tasks.length; i++) {
      updateBusy('Generazione calendario…', `Salvataggio giornata ${i + 1} di ${tasks.length}. Non chiudere la pagina.`);
      await saveCalendarEntry(session.token, tasks[i]);
      if ((i + 1) % 10 === 0) await sleep(120);
    }

    updateBusy('Calendario generato', `${tasks.length} giornate salvate. Aggiorno la schermata…`);
    await sleep(300);
    location.reload();
  } catch (err) {
    clearBusy();
    message(`Generazione non riuscita: ${err?.message || 'errore di comunicazione'}.`);
  }
}, true);
