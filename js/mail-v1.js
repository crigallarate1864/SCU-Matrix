const $=s=>document.querySelector(s);
const val=(r,...keys)=>{for(const k of keys)if(r&&r[k]!==undefined&&r[k]!==null)return r[k];return'';};
const active=r=>{const v=val(r,'ATTIVO','active');return v===true||['TRUE','1','SI','SÌ'].includes(String(v).toUpperCase());};
const personName=r=>`${val(r,'NOME','name')} ${val(r,'COGNOME','surname')}`.trim()||'Senza nome';
const dateOnly=v=>String(v||'').slice(0,10);
const pad=n=>String(n).padStart(2,'0');
let bootstrapData=window.__ATLAS_BOOTSTRAP__||null;

window.addEventListener('atlas:bootstrap',e=>{bootstrapData=e.detail||bootstrapData;});

const months={
  gennaio:1,febbraio:2,marzo:3,aprile:4,maggio:5,giugno:6,
  luglio:7,agosto:8,settembre:9,ottobre:10,novembre:11,dicembre:12
};

function currentMonth(){
  const label=($('#monthLabel')?.textContent||'').trim().toLowerCase();
  const match=label.match(/([a-zàèéìòù]+)\s+(\d{4})/i);
  if(match&&months[match[1]]) return {year:Number(match[2]),month:months[match[1]],label};
  const d=new Date();
  return {year:d.getFullYear(),month:d.getMonth()+1,label:d.toLocaleDateString('it-IT',{month:'long',year:'numeric'})};
}

function formatLongDate(iso){
  const [y,m,d]=iso.split('-').map(Number);
  const dt=new Date(y,m-1,d);
  const text=dt.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});
  return text.charAt(0).toUpperCase()+text.slice(1);
}

function copyText(text,button){
  const done=()=>{
    const old=button.textContent;
    button.textContent='Copiato ✓';
    setTimeout(()=>button.textContent=old,1300);
  };
  if(navigator.clipboard?.writeText){
    navigator.clipboard.writeText(text).then(done).catch(()=>fallbackCopy(text,done));
  }else fallbackCopy(text,done);
}
function fallbackCopy(text,done){
  const ta=document.createElement('textarea');
  ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();
  try{document.execCommand('copy');done();}catch{}finally{ta.remove();}
}

function prepareMail(){
  const data=window.__ATLAS_BOOTSTRAP__||bootstrapData;
  if(!data?.ok){
    const msg=$('#globalMessage');
    if(msg){msg.textContent='I dati non sono ancora disponibili. Premi Aggiorna e riprova.';msg.dataset.kind='error';msg.classList.add('show');}
    return;
  }

  const {year,month,label}=currentMonth();
  const key=`${year}-${pad(month)}`;
  const operators=(data.operators||[]).filter(active);
  const opMap=new Map(operators.map(o=>[String(val(o,'ID_OPERATORE','id')),o]));
  const recipients=[...new Set(operators.map(o=>String(val(o,'EMAIL','email')||'').trim()).filter(e=>e.includes('@')))];

  const allowedTypes=new Set(['SERVIZIO','FORMAZIONE','TUTORAGGIO']);
  const rows=(data.calendar||[]).filter(r=>{
    const date=dateOnly(val(r,'DATA','date'));
    const type=String(val(r,'TIPO','type')||'').toUpperCase();
    return date.startsWith(key)&&opMap.has(String(val(r,'OPERATORE_ID','operatorId')))&&allowedTypes.has(type);
  }).sort((a,b)=>{
    const da=dateOnly(val(a,'DATA','date')),db=dateOnly(val(b,'DATA','date'));
    if(da!==db)return da.localeCompare(db);
    return String(val(a,'ORA_INIZIO','start')||'').localeCompare(String(val(b,'ORA_INIZIO','start')||''));
  });

  const byDate=new Map();
  for(const r of rows){
    const date=dateOnly(val(r,'DATA','date'));
    const start=String(val(r,'ORA_INIZIO','start')||'').slice(0,5);
    const end=String(val(r,'ORA_FINE','end')||'').slice(0,5);
    const type=String(val(r,'TIPO','type')||'SERVIZIO').toUpperCase();
    const shiftKey=`${start}|${end}|${type}`;
    if(!byDate.has(date))byDate.set(date,new Map());
    const shifts=byDate.get(date);
    if(!shifts.has(shiftKey))shifts.set(shiftKey,[]);
    shifts.get(shiftKey).push(personName(opMap.get(String(val(r,'OPERATORE_ID','operatorId')))));
  }

  const monthTitle=label.charAt(0).toUpperCase()+label.slice(1);
  const sections=[];
  for(const [date,shifts] of byDate){
    const lines=[formatLongDate(date)];
    for(const [shiftKey,names] of shifts){
      const [start,end,type]=shiftKey.split('|');
      const activity=type==='SERVIZIO'?'':` · ${type.charAt(0)+type.slice(1).toLowerCase()}`;
      lines.push(`${start&&end?`${start}–${end}`:'Orario da definire'}${activity}: ${names.sort((a,b)=>a.localeCompare(b,'it')).join(', ')}`);
    }
    sections.push(lines.join('\n'));
  }

  const subject=`Turnazione SCU – ${monthTitle}`;
  const body=[
    'Buongiorno a tutti,',
    '',
    `di seguito la turnazione SCU prevista per il mese di ${monthTitle}.`,
    '',
    sections.length?sections.join('\n\n'):'Al momento non risultano turni programmati per questo mese.',
    '',
    'Vi chiedo di verificare con attenzione i turni assegnati e di segnalare tempestivamente eventuali problemi o incongruenze.',
    '',
    'Grazie,',
    'Amministrazione SCU',
    'Croce Rossa Italiana – Comitato di Gallarate'
  ].join('\n');

  $('#mailRecipients').value=recipients.join(', ');
  $('#mailSubject').value=subject;
  $('#mailBody').value=body;
  $('#mailMissingEmails').textContent=recipients.length===operators.length?'':`${operators.length-recipients.length} operatore/i senza email in anagrafica.`;
  $('#mailDialog').showModal();
}

$('#prepareMail')?.addEventListener('click',prepareMail);
$('#mailClose')?.addEventListener('click',()=>$('#mailDialog')?.close());
$('#mailCancel')?.addEventListener('click',()=>$('#mailDialog')?.close());
$('#mailDialog')?.addEventListener('cancel',e=>{e.preventDefault();$('#mailDialog')?.close();});
$('#copyRecipients')?.addEventListener('click',e=>copyText($('#mailRecipients').value,e.currentTarget));
$('#copySubject')?.addEventListener('click',e=>copyText($('#mailSubject').value,e.currentTarget));
$('#copyBody')?.addEventListener('click',e=>copyText($('#mailBody').value,e.currentTarget));
