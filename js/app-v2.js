import { SESSION_KEY, SCU_DEFAULTS } from './config.js';
import {
  bootstrap, logout, saveSettings, saveOperator, saveOlp,
  saveCalendarEntry, saveAbsence, saveTraining, saveDeadline
} from './api.js';
import {
  durationHours, operatorHourTotals, weeklyOlpSummary, trainingTotals,
  validateServiceEntry, recognizedAbsenceHours, EVENT_TYPES
} from './scu-rules.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const session = (() => {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
  catch { return null; }
})();
if (!session?.token) location.replace('index.html');

const state = {
  token: session?.token || '',
  user: session?.user || null,
  projects: [], operators: [], olps: [], calendar: [], absences: [], training: [], deadlines: [], olpPresences: [],
  settings: { ...SCU_DEFAULTS },
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  editor: null,
  editorRecord: null
};

const settingDefinitions = [
  ['Servizio', [
    ['annualHours', 'Monte ore complessivo', 'Ore previste per l’intero progetto', 'number'],
    ['weeklyDays', 'Giorni settimanali', 'Numero di giornate di servizio a settimana', 'number'],
    ['weeklyAverageHours', 'Media ore settimanali', 'Valore di riferimento per la programmazione', 'number'],
    ['minDailyHours', 'Ore minime giornaliere', 'Durata minima del turno', 'number'],
    ['maxDailyHours', 'Ore massime giornaliere', 'Durata massima del turno', 'number'],
    ['serviceStartMin', 'Inizio servizio minimo', 'Orario minimo consentito', 'time'],
    ['serviceEndMax', 'Fine servizio massima', 'Orario massimo consentito', 'time']
  ]],
  ['OLP', [
    ['minWeeklyOlpHours', 'Copresenza minima OLP', 'Ore settimanali minime per ciascun OLP', 'number']
  ]],
  ['Permessi', [
    ['ordinaryPermitDaysDefault', 'Permessi ordinari default', 'Valore iniziale, modificabile sul singolo operatore', 'number'],
    ['limitedExtraordinaryPermitDaysMax', 'Straordinari con limitazione', 'Massimo complessivo in giorni', 'number'],
    ['compensatoryRestDaysMaxPerMonth', 'Riposi compensativi', 'Massimo giorni interi al mese', 'number']
  ]],
  ['Formazione', [
    ['generalTrainingHours', 'Formazione generale', 'Ore obbligatorie', 'number'],
    ['generalTrainingDeadlineDays', 'Scadenza generale', 'Giorni dall’avvio', 'number'],
    ['specificTrainingHoursMin', 'Formazione specifica', 'Ore minime obbligatorie', 'number'],
    ['specificTrainingDeadlineDays', 'Scadenza specifica', 'Giorni dall’avvio', 'number'],
    ['tutoringHours', 'Tutoraggio', 'Ore obbligatorie', 'number']
  ]]
];

function value(row, ...keys) {
  for (const k of keys) if (row && row[k] !== undefined && row[k] !== null) return row[k];
  return '';
}
function escapeHtml(v) { return String(v ?? '').replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[c])); }
function formatDate(v) {
  if (!v) return '–';
  const s = String(v).slice(0, 10), [y, m, d] = s.split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}
function formatHours(v) { return `${Number(v || 0).toLocaleString('it-IT', { maximumFractionDigits: 1 })} h`; }
function personName(row) { return `${value(row, 'NOME', 'name')} ${value(row, 'COGNOME', 'surname')}`.trim() || 'Senza nome'; }
function projectById(id) { return state.projects.find(p => String(value(p, 'ID_PROGETTO', 'id')) === String(id)); }
function operatorById(id) { return state.operators.find(o => String(value(o, 'ID_OPERATORE', 'id')) === String(id)); }
function activeFlag(row) {
  const v = value(row, 'ATTIVO', 'active');
  return v === true || ['TRUE', '1', 'SI', 'SÌ'].includes(String(v).toUpperCase());
}
function completedFlag(row) {
  const v = value(row, 'COMPLETATA', 'completed');
  return v === true || ['TRUE', '1', 'SI', 'SÌ'].includes(String(v).toUpperCase());
}
function boolString(v) { return activeFlag({ active: v }) ? 'TRUE' : 'FALSE'; }
function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function dateOnly(v) { return String(v || '').slice(0, 10); }
function setMessage(text = '', kind = 'error') {
  const el = $('#globalMessage');
  el.textContent = text;
  el.dataset.kind = kind;
  el.classList.toggle('show', Boolean(text));
}
function closeDialog(id) {
  const d = $(id);
  if (d?.open) d.close();
}
function setFormValue(name, val) {
  const control = $(`#editorForm [name="${CSS.escape(name)}"]`);
  if (control) control.value = val ?? '';
}

function switchView(view) {
  $$('.nav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach(p => p.classList.toggle('active', p.dataset.viewPanel === view));
  const titles = { dashboard: 'Dashboard', calendar: 'Calendario', operators: 'Operatori SCU', olp: 'OLP', absences: 'Assenze e permessi', training: 'Formazione', deadlines: 'Scadenze', settings: 'Impostazioni' };
  $('#viewTitle').textContent = titles[view] || 'ATLAS SCU';
  $('#sidebar').classList.remove('open');
  history.replaceState(null, '', `#${view}`);
}

async function loadData() {
  setMessage('');
  $('#refreshButton').disabled = true;
  try {
    const data = await bootstrap(state.token);
    state.user = data.user || state.user;
    state.projects = data.projects || [];
    state.operators = data.operators || [];
    state.olps = data.olps || [];
    state.calendar = data.calendar || [];
    state.absences = data.absences || [];
    state.training = data.training || [];
    state.deadlines = data.deadlines || [];
    state.olpPresences = data.olpPresences || [];
    state.settings = { ...SCU_DEFAULTS, ...(data.settings || {}) };
    $('#backendStatus').classList.add('online');
    $('#backendStatus').innerHTML = '<i></i> Backend online';
    $('#userName').textContent = state.user?.name || state.user?.username || 'Amministratore SCU';
    renderAll();
  } catch (err) {
    $('#backendStatus').classList.remove('online');
    $('#backendStatus').innerHTML = '<i></i> Backend non disponibile';
    setMessage(err.message || 'Impossibile caricare i dati.');
  } finally {
    $('#refreshButton').disabled = false;
  }
}

function renderAll() {
  renderDashboard(); renderCalendar(); renderOperators(); renderOlp();
  renderAbsences(); renderTraining(); renderDeadlines(); renderSettings();
}

function renderDashboard() {
  const active = state.operators.filter(activeFlag);
  $('#metricOperators').textContent = active.length;
  const totalHours = state.calendar.reduce((s, r) => s + (Number(value(r, 'ORE_RICONOSCIUTE', 'recognizedHours')) || 0), 0);
  $('#metricHours').textContent = Math.round(totalHours).toLocaleString('it-IT');
  $('#metricDeadlines').textContent = state.deadlines.filter(d => !completedFlag(d)).length;
  const olpOk = state.olps.filter(activeFlag).filter(o => weeklyOlpSummary(state.olpPresences, value(o, 'ID_OLP', 'id'), state.settings).at(-1)?.ok).length;
  $('#metricOlp').textContent = `${olpOk}/${state.olps.filter(activeFlag).length}`;

  const hp = $('#hoursProgress');
  if (!active.length) {
    hp.className = 'progress-list empty-state'; hp.textContent = 'Nessun operatore attivo.';
  } else {
    hp.className = 'progress-list';
    hp.innerHTML = active.map(o => {
      const totals = operatorHourTotals(state.calendar, value(o, 'ID_OPERATORE', 'id'));
      const target = Number(state.settings.annualHours) || 1145;
      const pct = Math.max(0, Math.min(100, totals.recognized / target * 100));
      return `<div class="progress-row"><div class="name">${escapeHtml(personName(o))}</div><div class="progress-track"><i style="width:${pct}%"></i></div><div class="value">${formatHours(totals.recognized)} / ${target}</div></div>`;
    }).join('');
  }

  const alerts = [];
  state.deadlines.filter(d => !completedFlag(d)).forEach(d => {
    const due = dateOnly(value(d, 'DATA_SCADENZA', 'dueDate')); if (!due) return;
    const days = Math.ceil((new Date(`${due}T00:00:00`) - new Date()) / 86400000);
    if (days <= 14) alerts.push({ title: value(d, 'DESCRIZIONE', 'description') || 'Scadenza', detail: days < 0 ? `Scaduta da ${Math.abs(days)} giorni` : `Tra ${days} giorni` });
  });
  active.forEach(o => {
    const totals = operatorHourTotals(state.calendar, value(o, 'ID_OPERATORE', 'id'));
    const target = Number(state.settings.annualHours) || 1145;
    if (totals.recognized > target) alerts.push({ title: personName(o), detail: `Monte ore superato: ${formatHours(totals.recognized)}` });
  });
  const al = $('#alertsList');
  if (!alerts.length) { al.className = 'alert-list empty-state'; al.textContent = 'Nessun avviso prioritario.'; }
  else { al.className = 'alert-list'; al.innerHTML = alerts.slice(0, 8).map(a => `<div class="alert"><strong>${escapeHtml(a.title)}</strong><span>${escapeHtml(a.detail)}</span></div>`).join(''); }
}

function calendarEntryFor(operatorId, date) {
  return state.calendar.find(r => String(value(r, 'OPERATORE_ID', 'operatorId')) === String(operatorId) && dateOnly(value(r, 'DATA', 'date')) === date);
}
function absenceFor(operatorId, date) {
  return state.absences.find(r => String(value(r, 'OPERATORE_ID', 'operatorId')) === String(operatorId) && dateOnly(value(r, 'DATA', 'date')) === date);
}

function renderCalendar() {
  $('#monthLabel').textContent = state.month.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const days = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 0).getDate();
  const ops = state.operators.filter(activeFlag);
  if (!ops.length) {
    $('#calendarMatrix').className = 'calendar-matrix empty-state';
    $('#calendarMatrix').textContent = 'Aggiungi almeno un operatore SCU.';
    return;
  }
  let html = '<table class="calendar-table"><thead><tr><th>Operatore</th>';
  for (let d = 1; d <= days; d++) {
    const date = new Date(state.month.getFullYear(), state.month.getMonth(), d);
    const holiday = isItalianNationalHoliday(date);
    html += `<th class="${holiday ? 'holiday-head' : ''}"><span class="calendar-day">${d}<small>${date.toLocaleDateString('it-IT', { weekday: 'short' })}${holiday ? ' · fest.' : ''}</small></span></th>`;
  }
  html += '</tr></thead><tbody>';

  for (const op of ops) {
    const oid = String(value(op, 'ID_OPERATORE', 'id'));
    html += `<tr><td><strong>${escapeHtml(personName(op))}</strong><small>${escapeHtml(value(projectById(value(op, 'PROGETTO_ID', 'projectId')), 'TITOLO', 'title') || '')}</small></td>`;
    for (let d = 1; d <= days; d++) {
      const dateObj = new Date(state.month.getFullYear(), state.month.getMonth(), d);
      const date = iso(dateObj);
      const entry = calendarEntryFor(oid, date);
      const absence = absenceFor(oid, date);
      const holiday = isItalianNationalHoliday(dateObj);
      if (entry) {
        const type = String(value(entry, 'TIPO', 'type')).toUpperCase();
        const start = String(value(entry, 'ORA_INIZIO', 'start') || '').slice(0, 5);
        const end = String(value(entry, 'ORA_FINE', 'end') || '').slice(0, 5);
        const hours = value(entry, 'ORE_RICONOSCIUTE', 'recognizedHours');
        const issues = type === 'SERVIZIO' ? validateServiceEntry({ start, end }, state.settings) : [];
        html += `<td><button type="button" class="calendar-cell service ${issues.length ? 'issue' : ''}" data-calendar-id="${escapeHtml(value(entry, 'ID', 'id'))}" title="Clicca per modificare${issues.length ? ' · ' + escapeHtml(issues.join(' · ')) : ''}">${start && end ? `${escapeHtml(start)}–${escapeHtml(end)}` : escapeHtml(type.replaceAll('_', ' '))}<br><strong>${formatHours(hours)}</strong></button></td>`;
      } else if (absence) {
        const type = String(value(absence, 'TIPO', 'type')).replaceAll('_', ' ');
        html += `<td><div class="calendar-cell absence" title="Assenza registrata">${escapeHtml(type)}<br><strong>${formatHours(value(absence, 'ORE_RICONOSCIUTE', 'recognizedHours'))}</strong></div></td>`;
      } else if (holiday) {
        html += '<td><div class="calendar-cell holiday">Festività<br><strong>0 h</strong></div></td>';
      } else {
        html += `<td><button type="button" class="calendar-empty" data-operator-id="${escapeHtml(oid)}" data-date="${date}" title="Inserisci giornata">+</button></td>`;
      }
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  $('#calendarMatrix').className = 'calendar-matrix';
  $('#calendarMatrix').innerHTML = html;
}

function renderOperators() {
  const body = $('#operatorsBody');
  if (!state.operators.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty-state">Nessun operatore registrato.</td></tr>'; return;
  }
  body.innerHTML = state.operators.map(o => {
    const id = value(o, 'ID_OPERATORE', 'id');
    const project = projectById(value(o, 'PROGETTO_ID', 'projectId'));
    const totals = operatorHourTotals(state.calendar, id);
    const max = value(o, 'PERMESSI_ORDINARI_MAX', 'ordinaryPermitMax') || state.settings.ordinaryPermitDaysDefault;
    return `<tr data-operator-id="${escapeHtml(id)}"><td class="person"><strong>${escapeHtml(personName(o))}</strong><small>${escapeHtml(value(o, 'CODICE_VOLONTARIO', 'volunteerCode') || '')}</small></td><td>${escapeHtml(value(project, 'TITOLO', 'title') || '–')}</td><td>${formatDate(value(o, 'DATA_INIZIO', 'startDate'))} → ${formatDate(value(o, 'DATA_FINE', 'endDate'))}</td><td>${formatHours(totals.recognized)}</td><td>${escapeHtml(max)} gg</td><td><span class="badge ${activeFlag(o) ? 'ok' : 'off'}">${activeFlag(o) ? 'Attivo' : 'Non attivo'}</span></td><td><button type="button" class="secondary small edit-operator" data-id="${escapeHtml(id)}">Modifica</button></td></tr>`;
  }).join('');
}

function renderOlp() {
  const body = $('#olpBody');
  if (!state.olps.length) { body.innerHTML = '<tr><td colspan="6" class="empty-state">Nessun OLP registrato.</td></tr>'; return; }
  body.innerHTML = state.olps.map(o => {
    const id = value(o, 'ID_OLP', 'id');
    const project = projectById(value(o, 'PROGETTO_ID', 'projectId'));
    const last = weeklyOlpSummary(state.olpPresences, id, state.settings).at(-1);
    const h = last?.hours || 0;
    return `<tr data-olp-id="${escapeHtml(id)}"><td class="person"><strong>${escapeHtml(personName(o))}</strong><small>${escapeHtml(value(o, 'EMAIL', 'email') || '')}</small></td><td>${escapeHtml(value(project, 'TITOLO', 'title') || '–')}</td><td>${formatDate(value(o, 'DATA_INIZIO', 'startDate'))} → ${formatDate(value(o, 'DATA_FINE', 'endDate'))}</td><td>${formatHours(h)} / ${state.settings.minWeeklyOlpHours} h</td><td><span class="badge ${last?.ok ? 'ok' : 'warn'}">${last?.ok ? 'Conforme' : 'Da verificare'}</span></td><td><button type="button" class="secondary small edit-olp" data-id="${escapeHtml(id)}">Modifica</button></td></tr>`;
  }).join('');
}

function renderAbsences() {
  const body = $('#absencesBody');
  if (!state.absences.length) { body.innerHTML = '<tr><td colspan="6" class="empty-state">Nessuna assenza registrata.</td></tr>'; return; }
  body.innerHTML = [...state.absences].sort((a, b) => dateOnly(value(b, 'DATA', 'date')).localeCompare(dateOnly(value(a, 'DATA', 'date')))).map(a => {
    const op = operatorById(value(a, 'OPERATORE_ID', 'operatorId'));
    const doc = String(value(a, 'DOCUMENTO_PRESENTE', 'documentPresent')).toUpperCase();
    const hasDoc = ['TRUE', 'SI', 'SÌ', '1'].includes(doc);
    return `<tr><td>${formatDate(value(a, 'DATA', 'date'))}</td><td>${escapeHtml(personName(op))}</td><td>${escapeHtml(String(value(a, 'TIPO', 'type')).replaceAll('_', ' '))}</td><td>${formatHours(value(a, 'ORE_PREVISTE', 'scheduledHours'))}</td><td>${formatHours(value(a, 'ORE_RICONOSCIUTE', 'recognizedHours'))}</td><td><span class="badge ${hasDoc ? 'ok' : 'off'}">${hasDoc ? 'Presente' : '–'}</span></td></tr>`;
  }).join('');
}

function renderTraining() {
  const el = $('#trainingCards'), ops = state.operators.filter(activeFlag);
  if (!ops.length) { el.className = 'training-grid empty-state'; el.textContent = 'Nessun operatore attivo.'; return; }
  const targets = [['GENERALE', state.settings.generalTrainingHours], ['SPECIFICA', state.settings.specificTrainingHoursMin], ['TUTORAGGIO', state.settings.tutoringHours]];
  el.className = 'training-grid';
  el.innerHTML = ops.flatMap(o => {
    const totals = trainingTotals(state.training, value(o, 'ID_OPERATORE', 'id'));
    return targets.map(([type, target]) => {
      const done = Number(totals[type] || 0), pct = Math.max(0, Math.min(100, done / Number(target || 1) * 100));
      return `<article class="training-card"><h3>${escapeHtml(personName(o))}</h3><p>${type.charAt(0) + type.slice(1).toLowerCase()}</p><div class="training-bar"><i style="width:${pct}%"></i></div><footer><span>${formatHours(done)}</span><span>Obiettivo ${target} h</span></footer></article>`;
    });
  }).join('');
}

function renderDeadlines() {
  const body = $('#deadlinesBody');
  if (!state.deadlines.length) { body.innerHTML = '<tr><td colspan="5" class="empty-state">Nessuna scadenza registrata.</td></tr>'; return; }
  body.innerHTML = [...state.deadlines].sort((a, b) => dateOnly(value(a, 'DATA_SCADENZA', 'dueDate')).localeCompare(dateOnly(value(b, 'DATA_SCADENZA', 'dueDate')))).map(d => {
    const op = operatorById(value(d, 'OPERATORE_ID', 'operatorId'));
    const project = projectById(value(d, 'PROGETTO_ID', 'projectId'));
    const ref = op ? personName(op) : (value(project, 'TITOLO', 'title') || '–');
    return `<tr><td>${formatDate(value(d, 'DATA_SCADENZA', 'dueDate'))}</td><td>${escapeHtml(value(d, 'TIPO', 'type'))}</td><td>${escapeHtml(value(d, 'DESCRIZIONE', 'description'))}</td><td>${escapeHtml(ref)}</td><td><span class="badge ${completedFlag(d) ? 'ok' : 'warn'}">${completedFlag(d) ? 'Completata' : 'Aperta'}</span></td></tr>`;
  }).join('');
}

function renderSettings() {
  $('#settingsGrid').innerHTML = settingDefinitions.map(([title, items]) => `<article class="settings-card"><h3>${title}</h3>${items.map(([key, label, desc, type]) => `<div class="setting-row"><label for="setting-${key}"><strong>${label}</strong><small>${desc}</small></label><input id="setting-${key}" data-setting="${key}" type="${type}" value="${escapeHtml(state.settings[key] ?? '')}"></div>`).join('')}</article>`).join('');
}

function options(rows, idKey, labelFn, selected = '') {
  return rows.map(r => {
    const v = String(value(r, idKey, 'id'));
    return `<option value="${escapeHtml(v)}" ${v === String(selected) ? 'selected' : ''}>${escapeHtml(labelFn(r))}</option>`;
  }).join('');
}
function field(name, label, type = 'text', val = '', extra = '') {
  const full = extra.includes('full');
  return `<label class="dialog-field ${full ? 'full' : ''}"><span>${label}</span><input name="${name}" type="${type}" value="${escapeHtml(val)}" ${extra.replace('full', '')}></label>`;
}
function selectField(name, label, html, extra = '') { return `<label class="dialog-field ${extra}"><span>${label}</span><select name="${name}">${html}</select></label>`; }
function textareaField(name, label, val = '') { return `<label class="dialog-field full"><span>${label}</span><textarea name="${name}">${escapeHtml(val)}</textarea></label>`; }

function openEditor(kind, record = null, preset = {}) {
  state.editor = kind;
  state.editorRecord = record;
  const editing = Boolean(record);
  const title = $('#dialogTitle'), fields = $('#dialogFields');
  $('#dialogKicker').textContent = editing ? 'MODIFICA ANAGRAFICA' : 'NUOVO INSERIMENTO';

  if (kind === 'operator') {
    const r = record || {};
    title.textContent = editing ? `Modifica ${personName(r)}` : 'Nuovo operatore SCU';
    fields.innerHTML =
      field('surname', 'Cognome', 'text', value(r, 'COGNOME', 'surname')) +
      field('name', 'Nome', 'text', value(r, 'NOME', 'name')) +
      field('volunteerCode', 'Codice volontario', 'text', value(r, 'CODICE_VOLONTARIO', 'volunteerCode')) +
      field('fiscalCode', 'Codice fiscale', 'text', value(r, 'CODICE_FISCALE', 'fiscalCode')) +
      field('email', 'Email', 'email', value(r, 'EMAIL', 'email')) +
      field('phone', 'Telefono', 'tel', value(r, 'TELEFONO', 'phone')) +
      selectField('projectId', 'Progetto', options(state.projects, 'ID_PROGETTO', p => value(p, 'TITOLO', 'title'), value(r, 'PROGETTO_ID', 'projectId'))) +
      selectField('substitute', 'Subentrante', `<option value="FALSE" ${activeFlag({ active: value(r, 'SUBENTRANTE', 'substitute') }) ? '' : 'selected'}>No</option><option value="TRUE" ${activeFlag({ active: value(r, 'SUBENTRANTE', 'substitute') }) ? 'selected' : ''}>Sì</option>`) +
      field('startDate', 'Data inizio', 'date', dateOnly(value(r, 'DATA_INIZIO', 'startDate'))) +
      field('endDate', 'Data fine', 'date', dateOnly(value(r, 'DATA_FINE', 'endDate'))) +
      field('ordinaryPermitMax', 'Permessi ordinari max', 'number', value(r, 'PERMESSI_ORDINARI_MAX', 'ordinaryPermitMax') || state.settings.ordinaryPermitDaysDefault) +
      selectField('active', 'Stato', `<option value="TRUE" ${editing && !activeFlag(r) ? '' : 'selected'}>Attivo</option><option value="FALSE" ${editing && !activeFlag(r) ? 'selected' : ''}>Non attivo</option>`) +
      textareaField('notes', 'Note', value(r, 'NOTE', 'notes'));
  } else if (kind === 'olp') {
    const r = record || {};
    title.textContent = editing ? `Modifica ${personName(r)}` : 'Nuovo OLP';
    fields.innerHTML =
      field('surname', 'Cognome', 'text', value(r, 'COGNOME', 'surname')) + field('name', 'Nome', 'text', value(r, 'NOME', 'name')) +
      field('email', 'Email', 'email', value(r, 'EMAIL', 'email')) + field('phone', 'Telefono', 'tel', value(r, 'TELEFONO', 'phone')) +
      selectField('projectId', 'Progetto', options(state.projects, 'ID_PROGETTO', p => value(p, 'TITOLO', 'title'), value(r, 'PROGETTO_ID', 'projectId'))) +
      field('startDate', 'Data inizio', 'date', dateOnly(value(r, 'DATA_INIZIO', 'startDate'))) + field('endDate', 'Data fine', 'date', dateOnly(value(r, 'DATA_FINE', 'endDate'))) +
      selectField('active', 'Stato', `<option value="TRUE" ${editing && !activeFlag(r) ? '' : 'selected'}>Attivo</option><option value="FALSE" ${editing && !activeFlag(r) ? 'selected' : ''}>Non attivo</option>`) +
      textareaField('notes', 'Note', value(r, 'NOTE', 'notes'));
  } else if (kind === 'calendar') {
    const r = record || {};
    const opId = preset.operatorId || value(r, 'OPERATORE_ID', 'operatorId');
    title.textContent = editing ? 'Modifica giornata di servizio' : 'Inserisci giornata di servizio';
    fields.innerHTML =
      selectField('operatorId', 'Operatore', options(state.operators.filter(activeFlag), 'ID_OPERATORE', personName, opId)) +
      field('date', 'Data', 'date', preset.date || dateOnly(value(r, 'DATA', 'date'))) +
      field('start', 'Ora inizio', 'time', String(value(r, 'ORA_INIZIO', 'start') || '08:00').slice(0, 5)) +
      field('end', 'Ora fine', 'time', String(value(r, 'ORA_FINE', 'end') || '13:00').slice(0, 5)) +
      selectField('type', 'Tipo', `<option value="SERVIZIO">Servizio</option><option value="FORMAZIONE">Formazione</option><option value="TUTORAGGIO">Tutoraggio</option>`) +
      field('site', 'Sede', 'text', value(r, 'SEDE', 'site')) + textareaField('notes', 'Note', value(r, 'NOTE', 'notes'));
    setTimeout(() => setFormValue('type', value(r, 'TIPO', 'type') || 'SERVIZIO'), 0);
  } else if (kind === 'absence') {
    const types = [EVENT_TYPES.ORDINARY_PERMIT, EVENT_TYPES.EXTRAORDINARY_UNLIMITED, EVENT_TYPES.EXTRAORDINARY_LIMITED, EVENT_TYPES.SICKNESS, EVENT_TYPES.COMPENSATORY_REST, EVENT_TYPES.NATIONAL_HOLIDAY];
    title.textContent = 'Registra assenza';
    fields.innerHTML = selectField('operatorId', 'Operatore', options(state.operators.filter(activeFlag), 'ID_OPERATORE', personName)) + field('date', 'Data', 'date') + selectField('type', 'Tipo', types.map(t => `<option value="${t}">${t.replaceAll('_', ' ')}</option>`).join('')) + field('scheduledHours', 'Ore previste', 'number', '5', 'step="0.25"') + selectField('documentPresent', 'Documentazione', '<option value="FALSE">Non richiesta / assente</option><option value="TRUE">Presente</option>') + textareaField('notes', 'Note');
  } else if (kind === 'training') {
    title.textContent = 'Registra formazione';
    fields.innerHTML = selectField('operatorId', 'Operatore', options(state.operators.filter(activeFlag), 'ID_OPERATORE', personName)) + selectField('type', 'Tipo', '<option>GENERALE</option><option>SPECIFICA</option><option>TUTORAGGIO</option>') + field('module', 'Modulo') + field('date', 'Data', 'date') + field('start', 'Ora inizio', 'time') + field('end', 'Ora fine', 'time') + selectField('mode', 'Modalità', '<option value="PRESENZA">Presenza</option><option value="ONLINE_SINCRONA">Online sincrona</option>') + field('trainer', 'Formatore') + textareaField('notes', 'Note');
  } else if (kind === 'deadline') {
    title.textContent = 'Nuova scadenza';
    fields.innerHTML = field('type', 'Tipo') + field('dueDate', 'Data scadenza', 'date') + selectField('projectId', 'Progetto', '<option value="">–</option>' + options(state.projects, 'ID_PROGETTO', p => value(p, 'TITOLO', 'title'))) + selectField('operatorId', 'Operatore', '<option value="">–</option>' + options(state.operators, 'ID_OPERATORE', personName)) + field('description', 'Descrizione', 'text', '', 'full') + textareaField('notes', 'Note');
  }
  $('#editorDialog').showModal();
}

async function saveEditor(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData($('#editorForm')).entries());
  $('#dialogSave').disabled = true;
  try {
    if (state.editor === 'operator') {
      await saveOperator(state.token, { ...data, id: value(state.editorRecord, 'ID_OPERATORE', 'id') || undefined, active: data.active === 'TRUE', substitute: data.substitute === 'TRUE' });
    }
    if (state.editor === 'olp') {
      await saveOlp(state.token, { ...data, id: value(state.editorRecord, 'ID_OLP', 'id') || undefined, active: data.active === 'TRUE' });
    }
    if (state.editor === 'calendar') {
      const errors = validateServiceEntry(data, state.settings);
      if (data.type === 'SERVIZIO' && errors.length) throw new Error(errors.join(' '));
      const hours = durationHours(data.start, data.end) || 0;
      const op = operatorById(data.operatorId);
      await saveCalendarEntry(state.token, { ...data, id: value(state.editorRecord, 'ID', 'id') || undefined, projectId: value(op, 'PROGETTO_ID', 'projectId'), effectiveHours: hours, recognizedHours: hours });
    }
    if (state.editor === 'absence') {
      const scheduled = Number(data.scheduledHours) || 0;
      await saveAbsence(state.token, { ...data, scheduledHours: scheduled, recognizedHours: recognizedAbsenceHours(data.type, scheduled), documentPresent: data.documentPresent === 'TRUE' });
    }
    if (state.editor === 'training') {
      const hours = durationHours(data.start, data.end) || 0;
      await saveTraining(state.token, { ...data, hours });
    }
    if (state.editor === 'deadline') await saveDeadline(state.token, { ...data, completed: false });
    closeDialog('#editorDialog');
    await loadData();
    setMessage('Salvataggio completato.', 'success');
  } catch (err) {
    setMessage(err.message || 'Salvataggio non riuscito.');
  } finally {
    $('#dialogSave').disabled = false;
  }
}

function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}
function isItalianNationalHoliday(date) {
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

async function generateCalendar(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData($('#generatorForm')).entries());
  const errors = validateServiceEntry({ start: data.start, end: data.end }, state.settings);
  if (errors.length) { setMessage(errors.join(' ')); return; }
  const dailyHours = durationHours(data.start, data.end) || 0;
  const ops = state.operators.filter(activeFlag);
  if (!ops.length) { setMessage('Non ci sono operatori attivi da programmare.'); return; }

  const button = $('#generatorSave');
  button.disabled = true;
  const tasks = [];
  const days = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 0).getDate();
  for (const op of ops) {
    const oid = String(value(op, 'ID_OPERATORE', 'id'));
    const current = operatorHourTotals(state.calendar, oid).recognized;
    const target = Number(state.settings.annualHours) || 1145;
    let planned = 0;
    for (let day = 1; day <= days; day++) {
      const dateObj = new Date(state.month.getFullYear(), state.month.getMonth(), day);
      const dow = dateObj.getDay(), date = iso(dateObj);
      if (dow === 0 || dow === 6 || isItalianNationalHoliday(dateObj)) continue;
      if (!withinServicePeriod(op, dateObj)) continue;
      if (calendarEntryFor(oid, date) || absenceFor(oid, date)) continue;
      if (current + planned + dailyHours > target + 0.001) continue;
      planned += dailyHours;
      tasks.push({ operatorId: oid, projectId: value(op, 'PROGETTO_ID', 'projectId'), date, start: data.start, end: data.end, type: 'SERVIZIO', effectiveHours: dailyHours, recognizedHours: dailyHours, site: value(projectById(value(op, 'PROGETTO_ID', 'projectId')), 'SEDE_ATTUAZIONE', 'site') || '', notes: 'Generato automaticamente da ATLAS SCU' });
    }
  }

  if (!tasks.length) {
    button.disabled = false;
    closeDialog('#generatorDialog');
    setMessage('Nessuna giornata da generare: il calendario risulta già compilato o non ci sono giorni utili.', 'success');
    return;
  }

  try {
    let done = 0;
    setMessage(`Generazione calendario in corso: 0/${tasks.length} giornate…`, 'success');
    for (let i = 0; i < tasks.length; i += 5) {
      const chunk = tasks.slice(i, i + 5);
      await Promise.all(chunk.map(entry => saveCalendarEntry(state.token, entry)));
      done += chunk.length;
      setMessage(`Generazione calendario in corso: ${done}/${tasks.length} giornate…`, 'success');
    }
    closeDialog('#generatorDialog');
    await loadData();
    setMessage(`Calendario generato: ${tasks.length} giornate inserite. Le giornate già presenti non sono state sovrascritte.`, 'success');
  } catch (err) {
    setMessage(`Generazione interrotta: ${err.message || 'errore di comunicazione'}. Le giornate già salvate restano valide.`);
    await loadData();
  } finally {
    button.disabled = false;
  }
}

$('#mainNav').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) switchView(b.dataset.view); });
$$('[data-go]').forEach(b => b.addEventListener('click', () => switchView(b.dataset.go)));
$('#sidebarToggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#refreshButton').addEventListener('click', loadData);
$('#prevMonth').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); renderCalendar(); });
$('#nextMonth').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); renderCalendar(); });
$('#newOperator').addEventListener('click', () => openEditor('operator'));
$('#newOlp').addEventListener('click', () => openEditor('olp'));
$('#newCalendarEntry').addEventListener('click', () => openEditor('calendar'));
$('#newAbsence').addEventListener('click', () => openEditor('absence'));
$('#newTraining').addEventListener('click', () => openEditor('training'));
$('#newDeadline').addEventListener('click', () => openEditor('deadline'));
$('#editorForm').addEventListener('submit', saveEditor);

$('#dialogClose').addEventListener('click', () => closeDialog('#editorDialog'));
$('#dialogCancel').addEventListener('click', () => closeDialog('#editorDialog'));
$('#editorDialog').addEventListener('cancel', e => { e.preventDefault(); closeDialog('#editorDialog'); });

$('#generateCalendar').addEventListener('click', () => $('#generatorDialog').showModal());
$('#generatorForm').addEventListener('submit', generateCalendar);
$('#generatorClose').addEventListener('click', () => closeDialog('#generatorDialog'));
$('#generatorCancel').addEventListener('click', () => closeDialog('#generatorDialog'));
$('#generatorDialog').addEventListener('cancel', e => { e.preventDefault(); closeDialog('#generatorDialog'); });

$('#helpButton').addEventListener('click', () => $('#helpDialog').showModal());
$('#helpClose').addEventListener('click', () => closeDialog('#helpDialog'));
$('#helpCancel').addEventListener('click', () => closeDialog('#helpDialog'));
$('#helpDialog').addEventListener('cancel', e => { e.preventDefault(); closeDialog('#helpDialog'); });

$('#operatorsBody').addEventListener('click', e => {
  const b = e.target.closest('.edit-operator');
  const row = e.target.closest('[data-operator-id]');
  const id = b?.dataset.id || row?.dataset.operatorId;
  if (id) openEditor('operator', state.operators.find(o => String(value(o, 'ID_OPERATORE', 'id')) === String(id)));
});
$('#olpBody').addEventListener('click', e => {
  const b = e.target.closest('.edit-olp');
  const row = e.target.closest('[data-olp-id]');
  const id = b?.dataset.id || row?.dataset.olpId;
  if (id) openEditor('olp', state.olps.find(o => String(value(o, 'ID_OLP', 'id')) === String(id)));
});
$('#calendarMatrix').addEventListener('click', e => {
  const existing = e.target.closest('[data-calendar-id]');
  if (existing) {
    const record = state.calendar.find(r => String(value(r, 'ID', 'id')) === String(existing.dataset.calendarId));
    if (record) openEditor('calendar', record);
    return;
  }
  const empty = e.target.closest('.calendar-empty');
  if (empty) openEditor('calendar', null, { operatorId: empty.dataset.operatorId, date: empty.dataset.date });
});

$('#saveSettingsButton').addEventListener('click', async () => {
  const next = { ...state.settings };
  $$('[data-setting]').forEach(input => { next[input.dataset.setting] = input.type === 'number' ? Number(input.value) : input.value; });
  try {
    await saveSettings(state.token, next);
    state.settings = next;
    setMessage('Impostazioni salvate.', 'success');
    renderAll();
  } catch (err) { setMessage(err.message || 'Impossibile salvare le impostazioni.'); }
});
$('#logoutButton').addEventListener('click', async () => {
  try { await logout(state.token); } catch {}
  sessionStorage.removeItem(SESSION_KEY);
  location.replace('index.html');
});

const initialView = location.hash.replace('#', '');
switchView(['dashboard', 'calendar', 'operators', 'olp', 'absences', 'training', 'deadlines', 'settings'].includes(initialView) ? initialView : 'dashboard');
loadData();
