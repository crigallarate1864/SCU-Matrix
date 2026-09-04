const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
const val=(r,...keys)=>{for(const k of keys)if(r&&r[k]!==undefined&&r[k]!==null)return r[k];return'';};
const active=r=>{const v=val(r,'ATTIVO','active');return v===true||['TRUE','1','SI','SÌ'].includes(String(v).toUpperCase());};
const name=r=>`${val(r,'NOME','name')} ${val(r,'COGNOME','surname')}`.trim()||'Senza nome';
const fmt=n=>Number(n||0).toLocaleString('it-IT',{maximumFractionDigits:1});

function render(data){
  if(!data?.ok)return;
  const operators=(data.operators||[]).filter(active).sort((a,b)=>name(a).localeCompare(name(b),'it'));
  const calendar=data.calendar||[];
  const absences=data.absences||[];
  const training=data.training||[];
  const projects=data.projects||[];
  const settings=data.settings||{};

  const projectTitle=id=>val(projects.find(p=>String(val(p,'ID_PROGETTO','id'))===String(id)),'TITOLO','title')||'—';
  const byOp=(rows,id,key='OPERATORE_ID')=>rows.filter(r=>String(val(r,key,'operatorId'))===String(id));

  let totalEffective=0,totalAbs=0,totalTraining=0;
  const cards=operators.map(op=>{
    const id=String(val(op,'ID_OPERATORE','id'));
    const cal=byOp(calendar,id);
    const abs=byOp(absences,id);
    const tr=byOp(training,id);
    const effective=cal.reduce((s,r)=>s+(Number(val(r,'ORE_EFFETTIVE','effectiveHours'))||0),0);
    const recognized=cal.reduce((s,r)=>s+(Number(val(r,'ORE_RICONOSCIUTE','recognizedHours'))||0),0);
    const trainingHours=tr.reduce((s,r)=>s+(Number(val(r,'ORE','hours'))||0),0);
    const general=tr.filter(r=>String(val(r,'TIPO_FORMAZIONE','type')).toUpperCase()==='GENERALE').reduce((s,r)=>s+(Number(val(r,'ORE','hours'))||0),0);
    const specific=tr.filter(r=>String(val(r,'TIPO_FORMAZIONE','type')).toUpperCase()==='SPECIFICA').reduce((s,r)=>s+(Number(val(r,'ORE','hours'))||0),0);
    const tutoring=tr.filter(r=>String(val(r,'TIPO_FORMAZIONE','type')).toUpperCase()==='TUTORAGGIO').reduce((s,r)=>s+(Number(val(r,'ORE','hours'))||0),0);
    const ordinary=abs.filter(r=>String(val(r,'TIPO','type')).toUpperCase()==='PERMESSO_ORDINARIO').length;
    const sickness=abs.filter(r=>String(val(r,'TIPO','type')).toUpperCase()==='MALATTIA').length;
    const project=projects.find(p=>String(val(p,'ID_PROGETTO','id'))===String(val(op,'PROGETTO_ID','projectId')));
    const target=Number(val(project,'MONTE_ORE','annualHours'))||Number(settings.annualHours)||1145;
    const pct=Math.max(0,Math.min(100,(recognized/target)*100));
    totalEffective+=effective; totalAbs+=abs.length; totalTraining+=trainingHours;
    return `<article class="scu-person-card">
      <header><div><strong>${esc(name(op))}</strong><span>${esc(projectTitle(val(op,'PROGETTO_ID','projectId')))}</span></div><b>${fmt(recognized)} / ${fmt(target)} h</b></header>
      <div class="scu-person-stats">
        <div><span>Ore svolte</span><strong>${fmt(effective)} h</strong></div>
        <div><span>Assenze</span><strong>${abs.length} gg</strong><small>${ordinary} perm. ord. · ${sickness} malattia</small></div>
        <div><span>Formazione</span><strong>${fmt(trainingHours)} h</strong><small>G ${fmt(general)} · S ${fmt(specific)} · T ${fmt(tutoring)}</small></div>
      </div>
      <div class="scu-person-progress"><i style="width:${pct}%"></i></div>
      <footer><span>Monte ore riconosciuto</span><strong>${Math.round(pct)}%</strong></footer>
    </article>`;
  }).join('');

  if($('#metricOperators'))$('#metricOperators').textContent=operators.length;
  if($('#metricHours'))$('#metricHours').textContent=fmt(totalEffective);
  if($('#metricAbsences'))$('#metricAbsences').textContent=totalAbs;
  if($('#metricTraining'))$('#metricTraining').textContent=fmt(totalTraining);
  const host=$('#hoursProgress');
  if(host){
    host.className=operators.length?'operator-overview':'operator-overview empty-state';
    host.innerHTML=operators.length?cards:'Nessun operatore attivo.';
  }

  removeOlpSettings();
}

function removeOlpSettings(){
  document.querySelector('[data-view="olp"]')?.remove();
  const olpInput=$('#setting-minWeeklyOlpHours');
  olpInput?.closest('.settings-card')?.remove();
}

window.addEventListener('atlas:bootstrap',e=>render(e.detail));
if(window.__ATLAS_BOOTSTRAP__)render(window.__ATLAS_BOOTSTRAP__);

const observer=new MutationObserver(()=>removeOlpSettings());
const settings=$('#settingsGrid');
if(settings)observer.observe(settings,{childList:true,subtree:true});
