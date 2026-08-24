import { SESSION_KEY, SCU_DEFAULTS } from './config.js';
import { bootstrap, logout, saveSettings, saveOperator, saveOlp, saveCalendarEntry, saveAbsence, saveTraining, saveDeadline } from './api.js';
import { durationHours, operatorHourTotals, weeklyOlpSummary, trainingTotals, validateServiceEntry, recognizedAbsenceHours, EVENT_TYPES } from './scu-rules.js';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const session=(()=>{try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');}catch{return null;}})();
if(!session?.token) location.replace('index.html');

const state={
  token:session?.token||'',
  user:session?.user||null,
  projects:[],operators:[],olps:[],calendar:[],absences:[],training:[],deadlines:[],olpPresences:[],
  settings:{...SCU_DEFAULTS},
  month:new Date(new Date().getFullYear(),new Date().getMonth(),1),
  editor:null
};

const settingDefinitions=[
  ['Servizio',[
    ['annualHours','Monte ore complessivo','Ore previste per l’intero progetto','number'],
    ['weeklyDays','Giorni settimanali','Numero di giornate di servizio a settimana','number'],
    ['weeklyAverageHours','Media ore settimanali','Valore di riferimento per la programmazione','number'],
    ['minDailyHours','Ore minime giornaliere','Durata minima del turno','number'],
    ['maxDailyHours','Ore massime giornaliere','Durata massima del turno','number'],
    ['serviceStartMin','Inizio servizio minimo','Orario minimo consentito','time'],
    ['serviceEndMax','Fine servizio massima','Orario massimo consentito','time']
  ]],
  ['OLP',[
    ['minWeeklyOlpHours','Copresenza minima OLP','Ore settimanali minime per ciascun OLP','number']
  ]],
  ['Permessi',[
    ['ordinaryPermitDaysDefault','Permessi ordinari default','Valore iniziale, modificabile sul singolo operatore','number'],
    ['limitedExtraordinaryPermitDaysMax','Straordinari con limitazione','Massimo complessivo in giorni','number'],
    ['compensatoryRestDaysMaxPerMonth','Riposi compensativi','Massimo giorni interi al mese','number']
  ]],
  ['Formazione',[
    ['generalTrainingHours','Formazione generale','Ore obbligatorie','number'],
    ['generalTrainingDeadlineDays','Scadenza generale','Giorni dall’avvio','number'],
    ['specificTrainingHoursMin','Formazione specifica','Ore minime obbligatorie','number'],
    ['specificTrainingDeadlineDays','Scadenza specifica','Giorni dall’avvio','number'],
    ['tutoringHours','Tutoraggio','Ore obbligatorie','number']
  ]]
];

function value(row,...keys){for(const k of keys){if(row&&row[k]!==undefined&&row[k]!==null)return row[k];}return '';}
function idOf(row){return String(value(row,'ID','ID_OPERATORE','ID_OLP','ID_PROGETTO','id')||'');}
function escapeHtml(v){return String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function formatDate(v){if(!v)return '–';const s=String(v).slice(0,10);const [y,m,d]=s.split('-');return y&&m&&d?`${d}/${m}/${y}`:s;}
function formatHours(v){const n=Number(v||0);return `${n.toLocaleString('it-IT',{maximumFractionDigits:1})} h`;}
function personName(row){return `${value(row,'NOME','name')} ${value(row,'COGNOME','surname')}`.trim()||'Senza nome';}
function projectById(id){return state.projects.find(p=>String(value(p,'ID_PROGETTO','id'))===String(id));}
function operatorById(id){return state.operators.find(o=>String(value(o,'ID_OPERATORE','id'))===String(id));}
function olpById(id){return state.olps.find(o=>String(value(o,'ID_OLP','id'))===String(id));}
function activeFlag(row){const v=value(row,'ATTIVO','active');return v===true||String(v).toUpperCase()==='TRUE'||String(v)==='1'||String(v).toUpperCase()==='SI';}
function completedFlag(row){const v=value(row,'COMPLETATA','completed');return v===true||String(v).toUpperCase()==='TRUE'||String(v)==='1'||String(v).toUpperCase()==='SI';}
function iso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function monthKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
function setMessage(text=''){const el=$('#globalMessage');el.textContent=text;el.classList.toggle('show',Boolean(text));}

function switchView(view){
  $$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  $$('.view').forEach(p=>p.classList.toggle('active',p.dataset.viewPanel===view));
  const titles={dashboard:'Dashboard',calendar:'Calendario',operators:'Operatori SCU',olp:'OLP',absences:'Assenze e permessi',training:'Formazione',deadlines:'Scadenze',settings:'Impostazioni'};
  $('#viewTitle').textContent=titles[view]||'ATLAS SCU';
  $('#sidebar').classList.remove('open');
  history.replaceState(null,'',`#${view}`);
}

async function loadData(){
  setMessage('');$('#refreshButton').disabled=true;
  try{
    const data=await bootstrap(state.token);
    state.user=data.user||state.user;
    state.projects=data.projects||[];state.operators=data.operators||[];state.olps=data.olps||[];state.calendar=data.calendar||[];state.absences=data.absences||[];state.training=data.training||[];state.deadlines=data.deadlines||[];state.olpPresences=data.olpPresences||[];
    state.settings={...SCU_DEFAULTS,...(data.settings||{})};
    $('#backendStatus').classList.add('online');$('#backendStatus').innerHTML='<i></i> Backend online';
    $('#userName').textContent=state.user?.name||state.user?.username||'Amministratore SCU';
    renderAll();
  }catch(err){
    $('#backendStatus').classList.remove('online');$('#backendStatus').innerHTML='<i></i> Backend non disponibile';
    setMessage(err.message||'Impossibile caricare i dati.');
  }finally{$('#refreshButton').disabled=false;}
}

function renderAll(){renderDashboard();renderCalendar();renderOperators();renderOlp();renderAbsences();renderTraining();renderDeadlines();renderSettings();}

function renderDashboard(){
  const active=state.operators.filter(activeFlag);
  $('#metricOperators').textContent=active.length;
  const totalHours=state.calendar.reduce((s,r)=>s+(Number(value(r,'ORE_RICONOSCIUTE','recognizedHours'))||0),0);
  $('#metricHours').textContent=Math.round(totalHours).toLocaleString('it-IT');
  $('#metricDeadlines').textContent=state.deadlines.filter(d=>!completedFlag(d)).length;
  const olpOk=state.olps.filter(activeFlag).filter(o=>{
    const summaries=weeklyOlpSummary(state.olpPresences,value(o,'ID_OLP','id'),state.settings);
    const latest=summaries.at(-1);return latest?.ok;
  }).length;
  $('#metricOlp').textContent=`${olpOk}/${state.olps.filter(activeFlag).length}`;

  const hp=$('#hoursProgress');
  if(!active.length){hp.className='progress-list empty-state';hp.textContent='Nessun operatore attivo.';}else{
    hp.className='progress-list';
    hp.innerHTML=active.map(o=>{
      const totals=operatorHourTotals(state.calendar,value(o,'ID_OPERATORE','id'));
      const target=Number(state.settings.annualHours)||1145;const pct=Math.max(0,Math.min(100,totals.recognized/target*100));
      return `<div class="progress-row"><div class="name">${escapeHtml(personName(o))}</div><div class="progress-track"><i style="width:${pct}%"></i></div><div class="value">${formatHours(totals.recognized)} / ${target}</div></div>`;
    }).join('');
  }

  const alerts=[];
  state.deadlines.filter(d=>!completedFlag(d)).forEach(d=>{
    const due=String(value(d,'DATA_SCADENZA','dueDate')).slice(0,10);if(!due)return;
    const days=Math.ceil((new Date(`${due}T00:00:00`)-new Date())/86400000);
    if(days<=14)alerts.push({title:value(d,'DESCRIZIONE','description')||'Scadenza',detail:days<0?`Scaduta da ${Math.abs(days)} giorni`:`Tra ${days} giorni`});
  });
  active.forEach(o=>{
    const totals=operatorHourTotals(state.calendar,value(o,'ID_OPERATORE','id'));const target=Number(state.settings.annualHours)||1145;
    if(totals.recognized>target)alerts.push({title:personName(o),detail:`Monte ore superato: ${formatHours(totals.recognized)}`});
  });
  const al=$('#alertsList');
  if(!alerts.length){al.className='alert-list empty-state';al.textContent='Nessun avviso prioritario.';}else{al.className='alert-list';al.innerHTML=alerts.slice(0,8).map(a=>`<div class="alert"><strong>${escapeHtml(a.title)}</strong><span>${escapeHtml(a.detail)}</span></div>`).join('');}
}

function renderCalendar(){
  $('#monthLabel').textContent=state.month.toLocaleDateString('it-IT',{month:'long',year:'numeric'});
  const days=new Date(state.month.getFullYear(),state.month.getMonth()+1,0).getDate();
  const ops=state.operators.filter(activeFlag);
  if(!ops.length){$('#calendarMatrix').className='calendar-matrix empty-state';$('#calendarMatrix').textContent='Aggiungi almeno un operatore SCU.';return;}
  const mk=monthKey(state.month);
  const rows=state.calendar.filter(r=>String(value(r,'DATA','date')).slice(0,7)===mk);
  let html='<table class="calendar-table"><thead><tr><th>Operatore</th>';
  for(let d=1;d<=days;d++){const date=new Date(state.month.getFullYear(),state.month.getMonth(),d);html+=`<th><span class="calendar-day">${d}<small>${date.toLocaleDateString('it-IT',{weekday:'short'})}</small></span></th>`;}
  html+='</tr></thead><tbody>';
  for(const op of ops){const oid=String(value(op,'ID_OPERATORE','id'));html+=`<tr><td><strong>${escapeHtml(personName(op))}</strong></td>`;
    for(let d=1;d<=days;d++){
      const date=iso(new Date(state.month.getFullYear(),state.month.getMonth(),d));const entries=rows.filter(r=>String(value(r,'OPERATORE_ID','operatorId'))===oid&&String(value(r,'DATA','date')).slice(0,10)===date);
      if(!entries.length){html+='<td></td>';continue;}
      const e=entries[0];const type=String(value(e,'TIPO','type')).toUpperCase();const cls=type.includes('SERV')||type.includes('FORMAZ')?'service':'absence';
      const start=value(e,'ORA_INIZIO','start'),end=value(e,'ORA_FINE','end'),hours=value(e,'ORE_RICONOSCIUTE','recognizedHours');
      const issues=type==='SERVIZIO'?validateServiceEntry({start,end},state.settings):[];
      html+=`<td><div class="calendar-cell ${cls} ${issues.length?'issue':''}" title="${escapeHtml(issues.join(' · '))}">${start&&end?`${escapeHtml(start)}–${escapeHtml(end)}`:escapeHtml(type.replaceAll('_',' '))}<br><strong>${formatHours(hours)}</strong></div></td>`;
    }
    html+='</tr>';
  }
  html+='</tbody></table>';$('#calendarMatrix').className='calendar-matrix';$('#calendarMatrix').innerHTML=html;
}

function renderOperators(){
  const body=$('#operatorsBody');
  if(!state.operators.length){body.innerHTML='<tr><td colspan="6" class="empty-state">Nessun operatore registrato.</td></tr>';return;}
  body.innerHTML=state.operators.map(o=>{
    const project=projectById(value(o,'PROGETTO_ID','projectId'));const totals=operatorHourTotals(state.calendar,value(o,'ID_OPERATORE','id'));const max=value(o,'PERMESSI_ORDINARI_MAX','ordinaryPermitMax')||state.settings.ordinaryPermitDaysDefault;
    return `<tr data-id="${escapeHtml(value(o,'ID_OPERATORE','id'))}"><td class="person"><strong>${escapeHtml(personName(o))}</strong><small>${escapeHtml(value(o,'CODICE_VOLONTARIO','volunteerCode')||'')}</small></td><td>${escapeHtml(value(project,'TITOLO','title')||'–')}</td><td>${formatDate(value(o,'DATA_INIZIO','startDate'))} → ${formatDate(value(o,'DATA_FINE','endDate'))}</td><td>${formatHours(totals.recognized)}</td><td>${escapeHtml(max)} gg</td><td><span class="badge ${activeFlag(o)?'ok':'off'}">${activeFlag(o)?'Attivo':'Non attivo'}</span></td></tr>`;
  }).join('');
}

function renderOlp(){
  const body=$('#olpBody');
  if(!state.olps.length){body.innerHTML='<tr><td colspan="5" class="empty-state">Nessun OLP registrato.</td></tr>';return;}
  body.innerHTML=state.olps.map(o=>{
    const project=projectById(value(o,'PROGETTO_ID','projectId'));const sums=weeklyOlpSummary(state.olpPresences,value(o,'ID_OLP','id'),state.settings);const last=sums.at(-1);const h=last?.hours||0;
    return `<tr><td class="person"><strong>${escapeHtml(personName(o))}</strong><small>${escapeHtml(value(o,'EMAIL','email')||'')}</small></td><td>${escapeHtml(value(project,'TITOLO','title')||'–')}</td><td>${formatDate(value(o,'DATA_INIZIO','startDate'))} → ${formatDate(value(o,'DATA_FINE','endDate'))}</td><td>${formatHours(h)} / ${state.settings.minWeeklyOlpHours} h</td><td><span class="badge ${last?.ok?'ok':'warn'}">${last?.ok?'Conforme':'Da verificare'}</span></td></tr>`;
  }).join('');
}

function renderAbsences(){
  const body=$('#absencesBody');
  if(!state.absences.length){body.innerHTML='<tr><td colspan="6" class="empty-state">Nessuna assenza registrata.</td></tr>';return;}
  body.innerHTML=[...state.absences].sort((a,b)=>String(value(b,'DATA','date')).localeCompare(String(value(a,'DATA','date')))).map(a=>{
    const op=operatorById(value(a,'OPERATORE_ID','operatorId'));const doc=String(value(a,'DOCUMENTO_PRESENTE','documentPresent')).toUpperCase();
    return `<tr><td>${formatDate(value(a,'DATA','date'))}</td><td>${escapeHtml(personName(op))}</td><td>${escapeHtml(String(value(a,'TIPO','type')).replaceAll('_',' '))}</td><td>${formatHours(value(a,'ORE_PREVISTE','scheduledHours'))}</td><td>${formatHours(value(a,'ORE_RICONOSCIUTE','recognizedHours'))}</td><td><span class="badge ${['TRUE','SI','1'].includes(doc)?'ok':'off'}">${['TRUE','SI','1'].includes(doc)?'Presente':'–'}</span></td></tr>`;
  }).join('');
}

function renderTraining(){
  const el=$('#trainingCards');const ops=state.operators.filter(activeFlag);
  if(!ops.length){el.className='training-grid empty-state';el.textContent='Nessun operatore attivo.';return;}
  const targets=[['GENERALE',state.settings.generalTrainingHours],['SPECIFICA',state.settings.specificTrainingHoursMin],['TUTORAGGIO',state.settings.tutoringHours]];
  el.className='training-grid';el.innerHTML=ops.flatMap(o=>{const totals=trainingTotals(state.training,value(o,'ID_OPERATORE','id'));return targets.map(([type,target])=>{const done=Number(totals[type]||0);const pct=Math.max(0,Math.min(100,done/Number(target||1)*100));return `<article class="training-card"><h3>${escapeHtml(personName(o))}</h3><p>${type.charAt(0)+type.slice(1).toLowerCase()}</p><div class="training-bar"><i style="width:${pct}%"></i></div><footer><span>${formatHours(done)}</span><span>Obiettivo ${target} h</span></footer></article>`;});}).join('');
}

function renderDeadlines(){
  const body=$('#deadlinesBody');
  if(!state.deadlines.length){body.innerHTML='<tr><td colspan="5" class="empty-state">Nessuna scadenza registrata.</td></tr>';return;}
  body.innerHTML=[...state.deadlines].sort((a,b)=>String(value(a,'DATA_SCADENZA','dueDate')).localeCompare(String(value(b,'DATA_SCADENZA','dueDate')))).map(d=>{
    const op=operatorById(value(d,'OPERATORE_ID','operatorId'));const project=projectById(value(d,'PROGETTO_ID','projectId'));const ref=op?personName(op):(value(project,'TITOLO','title')||'–');
    return `<tr><td>${formatDate(value(d,'DATA_SCADENZA','dueDate'))}</td><td>${escapeHtml(value(d,'TIPO','type'))}</td><td>${escapeHtml(value(d,'DESCRIZIONE','description'))}</td><td>${escapeHtml(ref)}</td><td><span class="badge ${completedFlag(d)?'ok':'warn'}">${completedFlag(d)?'Completata':'Aperta'}</span></td></tr>`;
  }).join('');
}

function renderSettings(){
  $('#settingsGrid').innerHTML=settingDefinitions.map(([title,items])=>`<article class="settings-card"><h3>${title}</h3>${items.map(([key,label,desc,type])=>`<div class="setting-row"><label for="setting-${key}"><strong>${label}</strong><small>${desc}</small></label><input id="setting-${key}" data-setting="${key}" type="${type}" value="${escapeHtml(state.settings[key]??'')}"></div>`).join('')}</article>`).join('');
}

function options(rows,idKey,labelFn){return rows.map(r=>`<option value="${escapeHtml(value(r,idKey,'id'))}">${escapeHtml(labelFn(r))}</option>`).join('');}
function field(name,label,type='text',extra=''){return `<label class="dialog-field ${extra.includes('full')?'full':''}"><span>${label}</span><input name="${name}" type="${type}" ${extra.replace('full','')}></label>`;}
function selectField(name,label,html,extra=''){return `<label class="dialog-field ${extra}"><span>${label}</span><select name="${name}">${html}</select></label>`;}
function textareaField(name,label){return `<label class="dialog-field full"><span>${label}</span><textarea name="${name}"></textarea></label>`;}

function openEditor(kind){
  state.editor=kind;const title=$('#dialogTitle'),fields=$('#dialogFields');$('#dialogKicker').textContent='NUOVO INSERIMENTO';
  if(kind==='operator'){
    title.textContent='Nuovo operatore SCU';fields.innerHTML=field('surname','Cognome')+field('name','Nome')+field('volunteerCode','Codice volontario')+selectField('projectId','Progetto',options(state.projects,'ID_PROGETTO',p=>value(p,'TITOLO','title')))+field('startDate','Data inizio','date')+field('endDate','Data fine','date')+field('ordinaryPermitMax','Permessi ordinari max','number',`value="${state.settings.ordinaryPermitDaysDefault}"`)+selectField('active','Stato','<option value="TRUE">Attivo</option><option value="FALSE">Non attivo</option>')+textareaField('notes','Note');
  }else if(kind==='olp'){
    title.textContent='Nuovo OLP';fields.innerHTML=field('surname','Cognome')+field('name','Nome')+field('email','Email','email')+field('phone','Telefono')+selectField('projectId','Progetto',options(state.projects,'ID_PROGETTO',p=>value(p,'TITOLO','title')))+field('startDate','Data inizio','date')+field('endDate','Data fine','date')+selectField('active','Stato','<option value="TRUE">Attivo</option><option value="FALSE">Non attivo</option>')+textareaField('notes','Note');
  }else if(kind==='calendar'){
    title.textContent='Inserisci giornata di servizio';fields.innerHTML=selectField('operatorId','Operatore',options(state.operators.filter(activeFlag),'ID_OPERATORE',personName))+field('date','Data','date')+field('start','Ora inizio','time',`value="08:00"`)+field('end','Ora fine','time',`value="13:00"`)+selectField('type','Tipo','<option value="SERVIZIO">Servizio</option><option value="FORMAZIONE">Formazione</option><option value="TUTORAGGIO">Tutoraggio</option>')+field('site','Sede')+textareaField('notes','Note');
  }else if(kind==='absence'){
    const types=[EVENT_TYPES.ORDINARY_PERMIT,EVENT_TYPES.EXTRAORDINARY_UNLIMITED,EVENT_TYPES.EXTRAORDINARY_LIMITED,EVENT_TYPES.SICKNESS,EVENT_TYPES.COMPENSATORY_REST,EVENT_TYPES.NATIONAL_HOLIDAY];
    title.textContent='Registra assenza';fields.innerHTML=selectField('operatorId','Operatore',options(state.operators.filter(activeFlag),'ID_OPERATORE',personName))+field('date','Data','date')+selectField('type','Tipo',types.map(t=>`<option value="${t}">${t.replaceAll('_',' ')}</option>`).join(''))+field('scheduledHours','Ore previste','number','step="0.25" value="5"')+selectField('documentPresent','Documentazione','<option value="FALSE">Non richiesta / assente</option><option value="TRUE">Presente</option>')+textareaField('notes','Note');
  }else if(kind==='training'){
    title.textContent='Registra formazione';fields.innerHTML=selectField('operatorId','Operatore',options(state.operators.filter(activeFlag),'ID_OPERATORE',personName))+selectField('type','Tipo','<option>GENERALE</option><option>SPECIFICA</option><option>TUTORAGGIO</option>')+field('module','Modulo')+field('date','Data','date')+field('start','Ora inizio','time')+field('end','Ora fine','time')+selectField('mode','Modalità','<option value="PRESENZA">Presenza</option><option value="ONLINE_SINCRONA">Online sincrona</option>')+field('trainer','Formatore')+textareaField('notes','Note');
  }else if(kind==='deadline'){
    title.textContent='Nuova scadenza';fields.innerHTML=field('type','Tipo')+field('dueDate','Data scadenza','date')+selectField('projectId','Progetto','<option value="">–</option>'+options(state.projects,'ID_PROGETTO',p=>value(p,'TITOLO','title')))+selectField('operatorId','Operatore','<option value="">–</option>'+options(state.operators,'ID_OPERATORE',personName))+field('description','Descrizione','text','full')+textareaField('notes','Note');
  }
  $('#editorDialog').showModal();
}

async function saveEditor(event){
  event.preventDefault();
  const data=Object.fromEntries(new FormData($('#editorForm')).entries());$('#dialogSave').disabled=true;
  try{
    if(state.editor==='operator')await saveOperator(state.token,{...data,active:data.active==='TRUE'});
    if(state.editor==='olp')await saveOlp(state.token,{...data,active:data.active==='TRUE'});
    if(state.editor==='calendar'){
      const errors=validateServiceEntry(data,state.settings);if(data.type==='SERVIZIO'&&errors.length)throw new Error(errors.join(' '));
      const hours=durationHours(data.start,data.end)||0;await saveCalendarEntry(state.token,{...data,effectiveHours:hours,recognizedHours:hours});
    }
    if(state.editor==='absence'){
      const scheduled=Number(data.scheduledHours)||0;await saveAbsence(state.token,{...data,scheduledHours:scheduled,recognizedHours:recognizedAbsenceHours(data.type,scheduled),documentPresent:data.documentPresent==='TRUE'});
    }
    if(state.editor==='training'){
      const hours=durationHours(data.start,data.end)||0;await saveTraining(state.token,{...data,hours});
    }
    if(state.editor==='deadline')await saveDeadline(state.token,{...data,completed:false});
    $('#editorDialog').close();await loadData();
  }catch(err){setMessage(err.message||'Salvataggio non riuscito.');}
  finally{$('#dialogSave').disabled=false;}
}

$('#mainNav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)switchView(b.dataset.view);});
$$('[data-go]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.go)));
$('#sidebarToggle').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
$('#refreshButton').addEventListener('click',loadData);
$('#prevMonth').addEventListener('click',()=>{state.month=new Date(state.month.getFullYear(),state.month.getMonth()-1,1);renderCalendar();});
$('#nextMonth').addEventListener('click',()=>{state.month=new Date(state.month.getFullYear(),state.month.getMonth()+1,1);renderCalendar();});
$('#newOperator').addEventListener('click',()=>openEditor('operator'));
$('#newOlp').addEventListener('click',()=>openEditor('olp'));
$('#newCalendarEntry').addEventListener('click',()=>openEditor('calendar'));
$('#newAbsence').addEventListener('click',()=>openEditor('absence'));
$('#newTraining').addEventListener('click',()=>openEditor('training'));
$('#newDeadline').addEventListener('click',()=>openEditor('deadline'));
$('#editorForm').addEventListener('submit',saveEditor);
$('#saveSettingsButton').addEventListener('click',async()=>{
  const next={...state.settings};$$('[data-setting]').forEach(input=>{next[input.dataset.setting]=input.type==='number'?Number(input.value):input.value;});
  try{await saveSettings(state.token,next);state.settings=next;setMessage('');renderAll();}catch(err){setMessage(err.message||'Impossibile salvare le impostazioni.');}
});
$('#logoutButton').addEventListener('click',async()=>{try{await logout(state.token);}catch{}sessionStorage.removeItem(SESSION_KEY);location.replace('index.html');});

const initialView=location.hash.replace('#','');switchView(['dashboard','calendar','operators','olp','absences','training','deadlines','settings'].includes(initialView)?initialView:'dashboard');
loadData();
