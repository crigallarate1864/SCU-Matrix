import { SCU_DEFAULTS } from './config.js';

export const EVENT_TYPES=Object.freeze({
  SERVICE:'SERVIZIO',
  ORDINARY_PERMIT:'PERMESSO_ORDINARIO',
  EXTRAORDINARY_UNLIMITED:'PERMESSO_STRAORDINARIO_SENZA_LIMITAZIONE',
  EXTRAORDINARY_LIMITED:'PERMESSO_STRAORDINARIO_CON_LIMITAZIONE',
  SICKNESS:'MALATTIA',
  COMPENSATORY_REST:'RIPOSO_COMPENSATIVO',
  NATIONAL_HOLIDAY:'FESTIVITA_NAZIONALE',
  TRAINING:'FORMAZIONE',
  TUTORING:'TUTORAGGIO'
});

export const ABSENCE_RECOGNITION=Object.freeze({
  [EVENT_TYPES.ORDINARY_PERMIT]:0,
  [EVENT_TYPES.EXTRAORDINARY_UNLIMITED]:'scheduled',
  [EVENT_TYPES.EXTRAORDINARY_LIMITED]:'scheduled',
  [EVENT_TYPES.SICKNESS]:'scheduled',
  [EVENT_TYPES.COMPENSATORY_REST]:0,
  [EVENT_TYPES.NATIONAL_HOLIDAY]:0
});

export function timeToMinutes(value){
  const m=/^(\d{1,2}):(\d{2})$/.exec(String(value||''));
  if(!m)return null;
  const h=Number(m[1]),min=Number(m[2]);
  if(h<0||h>23||min<0||min>59)return null;
  return h*60+min;
}

export function durationHours(start,end){
  const a=timeToMinutes(start),b=timeToMinutes(end);
  if(a==null||b==null||b<a)return null;
  return Math.round(((b-a)/60)*100)/100;
}

export function recognizedAbsenceHours(type,scheduledHours){
  const rule=ABSENCE_RECOGNITION[type];
  if(rule==='scheduled')return Number(scheduledHours||0);
  if(rule===0)return 0;
  return Number(scheduledHours||0);
}

export function validateServiceEntry(entry,settings={}){
  const cfg={...SCU_DEFAULTS,...settings};
  const errors=[];
  const start=timeToMinutes(entry.start||entry.oraInizio||entry.ORA_INIZIO);
  const end=timeToMinutes(entry.end||entry.oraFine||entry.ORA_FINE);
  if(start==null||end==null){errors.push('Orario non valido.');return errors;}
  if(end<=start)errors.push('Il servizio deve essere continuativo nella stessa giornata.');
  const hours=(end-start)/60;
  if(hours<Number(cfg.minDailyHours))errors.push(`Turno inferiore a ${cfg.minDailyHours} ore.`);
  if(hours>Number(cfg.maxDailyHours))errors.push(`Turno superiore a ${cfg.maxDailyHours} ore.`);
  if(start<timeToMinutes(cfg.serviceStartMin))errors.push(`Inizio precedente alle ${cfg.serviceStartMin}.`);
  if(end>timeToMinutes(cfg.serviceEndMax))errors.push(`Fine successiva alle ${cfg.serviceEndMax}.`);
  return errors;
}

export function isoDateLocal(date){
  const y=date.getFullYear();const m=String(date.getMonth()+1).padStart(2,'0');const d=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

export function startOfWeek(date){
  const d=new Date(date);const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);d.setHours(0,0,0,0);return d;
}

export function weekKey(value){
  const d=startOfWeek(new Date(`${String(value).slice(0,10)}T00:00:00`));return isoDateLocal(d);
}

export function operatorHourTotals(calendarRows,operatorId){
  const rows=(calendarRows||[]).filter(r=>String(r.OPERATORE_ID??r.operatorId)===String(operatorId));
  return rows.reduce((acc,r)=>{
    acc.effective+=Number(r.ORE_EFFETTIVE??r.effectiveHours??0)||0;
    acc.recognized+=Number(r.ORE_RICONOSCIUTE??r.recognizedHours??0)||0;
    return acc;
  },{effective:0,recognized:0});
}

export function weeklyOperatorSummary(calendarRows,operatorId,settings={}){
  const cfg={...SCU_DEFAULTS,...settings};const map=new Map();
  for(const row of (calendarRows||[])){
    if(String(row.OPERATORE_ID??row.operatorId)!==String(operatorId))continue;
    const date=row.DATA??row.date;if(!date)continue;
    const key=weekKey(date);const rec=map.get(key)||{week:key,days:new Set(),hours:0};
    const recognized=Number(row.ORE_RICONOSCIUTE??row.recognizedHours??0)||0;
    const effective=Number(row.ORE_EFFETTIVE??row.effectiveHours??0)||0;
    if(recognized>0||effective>0)rec.days.add(String(date).slice(0,10));
    rec.hours+=recognized;
    map.set(key,rec);
  }
  return [...map.values()].map(r=>({week:r.week,days:r.days.size,hours:Math.round(r.hours*100)/100,daysOk:r.days.size===Number(cfg.weeklyDays)})).sort((a,b)=>a.week.localeCompare(b.week));
}

export function weeklyOlpSummary(presences,olpId,settings={}){
  const cfg={...SCU_DEFAULTS,...settings};const map=new Map();
  for(const row of (presences||[])){
    if(String(row.OLP_ID??row.olpId)!==String(olpId))continue;
    const date=row.DATA??row.date;if(!date)continue;
    const key=weekKey(date);map.set(key,(map.get(key)||0)+(Number(row.ORE??row.hours??0)||0));
  }
  return [...map].map(([week,hours])=>({week,hours:Math.round(hours*100)/100,ok:hours>=Number(cfg.minWeeklyOlpHours)})).sort((a,b)=>a.week.localeCompare(b.week));
}

export function trainingTotals(trainingRows,operatorId){
  const totals={GENERALE:0,SPECIFICA:0,TUTORAGGIO:0};
  for(const r of (trainingRows||[])){
    if(String(r.OPERATORE_ID??r.operatorId)!==String(operatorId))continue;
    const type=String(r.TIPO_FORMAZIONE??r.type??'').toUpperCase();
    if(type in totals)totals[type]+=Number(r.ORE??r.hours??0)||0;
  }
  return totals;
}
