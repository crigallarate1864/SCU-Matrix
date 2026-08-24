const SCU = Object.freeze({
  ROLE: 'AMMINISTRATORE_SCU',
  SESSION_HOURS: 8,
  SHEETS: {
    SETTINGS: 'IMPOSTAZIONI', USERS: 'UTENTI', PROJECTS: 'PROGETTI', OPERATORS: 'OPERATORI', OLP: 'OLP',
    CALENDAR: 'CALENDARIO', ABSENCES: 'ASSENZE', TRAINING: 'FORMAZIONE', DEADLINES: 'SCADENZE',
    OLP_PRESENCE: 'PRESENZE_OLP', AUDIT: 'AUDIT_LOG'
  }
});

const SCU_HEADERS = Object.freeze({
  IMPOSTAZIONI:['CHIAVE','VALORE','DESCRIZIONE'],
  UTENTI:['ID','USERNAME','PASSWORD_HASH','NOME','RUOLO','ATTIVO','ULTIMO_ACCESSO'],
  PROGETTI:['ID_PROGETTO','TITOLO','BANDO','CODICE_PROGETTO','SEDE_ATTUAZIONE','CODICE_SEDE','DATA_INIZIO','DATA_FINE','MONTE_ORE','GIORNI_SETTIMANALI','ORE_SETTIMANALI_MEDIE','OLP_PRINCIPALE'],
  OPERATORI:['ID_OPERATORE','CODICE_VOLONTARIO','COGNOME','NOME','CODICE_FISCALE','EMAIL','TELEFONO','PROGETTO_ID','DATA_INIZIO','DATA_FINE','SUBENTRANTE','PERMESSI_ORDINARI_MAX','ATTIVO','NOTE'],
  OLP:['ID_OLP','COGNOME','NOME','EMAIL','TELEFONO','PROGETTO_ID','DATA_INIZIO','DATA_FINE','ATTIVO','NOTE'],
  CALENDARIO:['ID','DATA','OPERATORE_ID','PROGETTO_ID','ORA_INIZIO','ORA_FINE','TIPO','ORE_EFFETTIVE','ORE_RICONOSCIUTE','SEDE','NOTE','MODIFICATO_IL','MODIFICATO_DA'],
  ASSENZE:['ID','DATA','OPERATORE_ID','TIPO','ORE_PREVISTE','ORE_RICONOSCIUTE','DOCUMENTO_PRESENTE','DATA_RICHIESTA','APPROVATO','NOTE'],
  FORMAZIONE:['ID','OPERATORE_ID','TIPO_FORMAZIONE','MODULO','DATA','ORA_INIZIO','ORA_FINE','ORE','MODALITA','FORMATORE','RECUPERO','NOTE'],
  SCADENZE:['ID','TIPO','DESCRIZIONE','DATA_SCADENZA','PROGETTO_ID','OPERATORE_ID','COMPLETATA','DATA_COMPLETAMENTO','NOTE'],
  PRESENZE_OLP:['ID','DATA','OLP_ID','PROGETTO_ID','ORA_INIZIO','ORA_FINE','ORE','NOTE'],
  AUDIT_LOG:['TIMESTAMP','UTENTE','AZIONE','ENTITA','ID_ENTITA','DETTAGLI']
});

const SCU_DEFAULT_SETTINGS = Object.freeze([
  ['MONTE_ORE_ANNUO','1145','Monte ore complessivo del progetto SCU'],
  ['GIORNI_SETTIMANALI','5','Giornate di servizio previste ogni settimana'],
  ['ORE_SETTIMANALI_MEDIA','25','Media consigliata: 5 ore per 5 giorni'],
  ['ORE_GIORNALIERE_MIN','3','Durata minima di un turno'],
  ['ORE_GIORNALIERE_MAX','8','Durata massima di un turno'],
  ['ORA_SERVIZIO_MIN','06:00','Ora minima consentita per l’inizio del servizio'],
  ['ORA_SERVIZIO_MAX','23:00','Ora massima consentita per la fine del servizio'],
  ['ORE_OLP_SETTIMANALI_MIN','10','Ore minime settimanali di copresenza per ciascun OLP'],
  ['PERMESSI_ORDINARI_DEFAULT','20','Default per operatori avviati con il progetto; i subentranti possono differire'],
  ['PERMESSI_STRAORDINARI_LIMITATI_MAX','15','Massimo complessivo previsto'],
  ['RIPOSO_COMPENSATIVO_MAX_GIORNI_MESE','1','Massimo una giornata intera al mese'],
  ['FORMAZIONE_GENERALE_ORE','30','Formazione generale obbligatoria'],
  ['FORMAZIONE_GENERALE_ENTRO_GIORNI','30','Da completare nei primi 30 giorni di servizio'],
  ['FORMAZIONE_SPECIFICA_ORE_MIN','72','Durata minima della formazione specifica'],
  ['FORMAZIONE_SPECIFICA_ENTRO_GIORNI','60','Da completare nei primi 60 giorni di servizio'],
  ['TUTORAGGIO_ORE','21','Percorso di tutoraggio obbligatorio']
]);

const SETTING_KEYS = Object.freeze({
  annualHours:'MONTE_ORE_ANNUO', weeklyDays:'GIORNI_SETTIMANALI', weeklyAverageHours:'ORE_SETTIMANALI_MEDIA',
  minDailyHours:'ORE_GIORNALIERE_MIN', maxDailyHours:'ORE_GIORNALIERE_MAX', serviceStartMin:'ORA_SERVIZIO_MIN',
  serviceEndMax:'ORA_SERVIZIO_MAX', minWeeklyOlpHours:'ORE_OLP_SETTIMANALI_MIN', ordinaryPermitDaysDefault:'PERMESSI_ORDINARI_DEFAULT',
  limitedExtraordinaryPermitDaysMax:'PERMESSI_STRAORDINARI_LIMITATI_MAX', compensatoryRestDaysMaxPerMonth:'RIPOSO_COMPENSATIVO_MAX_GIORNI_MESE',
  generalTrainingHours:'FORMAZIONE_GENERALE_ORE', generalTrainingDeadlineDays:'FORMAZIONE_GENERALE_ENTRO_GIORNI',
  specificTrainingHoursMin:'FORMAZIONE_SPECIFICA_ORE_MIN', specificTrainingDeadlineDays:'FORMAZIONE_SPECIFICA_ENTRO_GIORNI',
  tutoringHours:'TUTORAGGIO_ORE'
});

function doGet(){ return json_({ok:true,service:'ATLAS SCU',version:'0.1.0'}); }

function doPost(e){
  try{
    const body=JSON.parse((e&&e.postData&&e.postData.contents)||'{}');
    const action=String(body.action||'').trim();
    if(!action) throw new Error('Azione mancante.');
    if(action==='login') return json_(login_(body.username,body.password));
    if(action==='session') return json_(session_(body.token));
    if(action==='logout') return json_(logout_(body.token));

    const user=requireSession_(body.token);
    const handlers={
      bootstrap:()=>bootstrap_(user),
      saveSettings:()=>saveSettings_(user,body.settings),
      saveProject:()=>saveProject_(user,body.project),
      saveOperator:()=>saveOperator_(user,body.operator),
      deleteOperator:()=>deleteOperator_(user,body.id),
      saveOlp:()=>saveOlp_(user,body.olp),
      saveCalendarEntry:()=>saveCalendarEntry_(user,body.entry),
      deleteCalendarEntry:()=>deleteById_(user,SCU.SHEETS.CALENDAR,body.id),
      saveAbsence:()=>saveAbsence_(user,body.absence),
      saveTraining:()=>saveTraining_(user,body.training),
      saveDeadline:()=>saveDeadline_(user,body.deadline),
      saveOlpPresence:()=>saveOlpPresence_(user,body.presence)
    };
    if(!handlers[action]) throw new Error('Azione non supportata: '+action);
    return json_(handlers[action]());
  }catch(err){ return json_({ok:false,error:String(err&&err.message||err)}); }
}

/**
 * Eseguire UNA SOLA VOLTA dal progetto Apps Script collegato al foglio ATLAS SCU - Database.
 * Crea/controlla lo schema e genera le credenziali iniziali.
 * La password temporanea viene mostrata solo nel log di esecuzione.
 */
function initializeAtlasScu(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss) throw new Error('Aprire Apps Script dal foglio ATLAS SCU - Database (Estensioni > Apps Script).');
  PropertiesService.getScriptProperties().setProperty('SCU_SPREADSHEET_ID',ss.getId());
  ensureSchema_(ss);
  seedSettings_(ss);
  const users=ss.getSheetByName(SCU.SHEETS.USERS);
  const existing=readObjects_(users).filter(r=>truthy_(r.ATTIVO));
  if(existing.length){ Logger.log('ATLAS SCU inizializzato. Utente attivo già presente: '+existing[0].USERNAME); return; }
  const username='admin.scu';
  const password=randomPassword_();
  const salt=Utilities.getUuid().replace(/-/g,'');
  PropertiesService.getScriptProperties().setProperty('SCU_PASSWORD_SALT',salt);
  appendObject_(users,{ID:newId_('USR'),USERNAME:username,PASSWORD_HASH:hashPassword_(password,salt),NOME:'Amministratore SCU',RUOLO:SCU.ROLE,ATTIVO:true,ULTIMO_ACCESSO:''});
  Logger.log('ATLAS SCU inizializzato.');
  Logger.log('USERNAME TEMPORANEO: '+username);
  Logger.log('PASSWORD TEMPORANEA: '+password);
  Logger.log('Conservare la password e poi usare changeAdminPassword() per sostituirla.');
}

/** Modificare temporaneamente i due valori e avviare questa funzione; poi annullare la modifica del sorgente. */
function changeAdminPassword(){
  const NEW_USERNAME='admin.scu';
  const NEW_PASSWORD='INSERIRE_QUI_UNA_PASSWORD_NUOVA';
  if(NEW_PASSWORD==='INSERIRE_QUI_UNA_PASSWORD_NUOVA') throw new Error('Inserire una password nuova prima di eseguire la funzione.');
  const ss=db_(),salt=PropertiesService.getScriptProperties().getProperty('SCU_PASSWORD_SALT')||Utilities.getUuid().replace(/-/g,'');
  PropertiesService.getScriptProperties().setProperty('SCU_PASSWORD_SALT',salt);
  const sheet=ss.getSheetByName(SCU.SHEETS.USERS);const rows=readObjects_(sheet);const user=rows.find(r=>truthy_(r.ATTIVO));
  if(!user) throw new Error('Nessun utente attivo. Eseguire initializeAtlasScu().');
  user.USERNAME=NEW_USERNAME;user.PASSWORD_HASH=hashPassword_(NEW_PASSWORD,salt);upsertObject_(sheet,'ID',user);revokeAllSessions_();
  Logger.log('Credenziali amministratore aggiornate.');
}

function login_(username,password){
  username=String(username||'').trim();password=String(password||'');
  if(!username||!password) throw new Error('Credenziali mancanti.');
  const ss=db_(),users=readObjects_(ss.getSheetByName(SCU.SHEETS.USERS));
  const user=users.find(r=>String(r.USERNAME||'').toLowerCase()===username.toLowerCase()&&truthy_(r.ATTIVO));
  const salt=PropertiesService.getScriptProperties().getProperty('SCU_PASSWORD_SALT')||'';
  if(!user||hashPassword_(password,salt)!==String(user.PASSWORD_HASH||'')) throw new Error('Nome utente o password non validi.');
  if(String(user.RUOLO||'')!==SCU.ROLE) throw new Error('Ruolo non autorizzato.');
  const token=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
  const expiresAt=Date.now()+SCU.SESSION_HOURS*3600000;
  PropertiesService.getScriptProperties().setProperty('SESSION_'+token,JSON.stringify({userId:user.ID,username:user.USERNAME,name:user.NOME,role:user.RUOLO,expiresAt:expiresAt}));
  user.ULTIMO_ACCESSO=new Date();upsertObject_(ss.getSheetByName(SCU.SHEETS.USERS),'ID',user);audit_(user,'LOGIN','SESSION',token.slice(0,10),'Accesso effettuato');
  return {ok:true,token:token,expiresAt:new Date(expiresAt).toISOString(),user:publicUser_(user)};
}

function session_(token){ const s=requireSession_(token);return {ok:true,user:{id:s.userId,username:s.username,name:s.name,role:s.role},expiresAt:new Date(s.expiresAt).toISOString()}; }
function logout_(token){
  if(token) PropertiesService.getScriptProperties().deleteProperty('SESSION_'+token);
  return {ok:true};
}
function requireSession_(token){
  token=String(token||'');if(!token) throw new Error('Sessione mancante.');
  const p=PropertiesService.getScriptProperties(),raw=p.getProperty('SESSION_'+token);if(!raw) throw new Error('Sessione scaduta.');
  const s=JSON.parse(raw);if(Number(s.expiresAt)<Date.now()){p.deleteProperty('SESSION_'+token);throw new Error('Sessione scaduta.');}
  return s;
}
function revokeAllSessions_(){
  const p=PropertiesService.getScriptProperties(),all=p.getProperties();Object.keys(all).filter(k=>k.indexOf('SESSION_')===0).forEach(k=>p.deleteProperty(k));
}

function bootstrap_(user){
  const ss=db_();
  return {ok:true,user:{id:user.userId,username:user.username,name:user.name,role:user.role},settings:readSettings_(ss),
    projects:readObjects_(ss.getSheetByName(SCU.SHEETS.PROJECTS)),operators:readObjects_(ss.getSheetByName(SCU.SHEETS.OPERATORS)),
    olps:readObjects_(ss.getSheetByName(SCU.SHEETS.OLP)),calendar:readObjects_(ss.getSheetByName(SCU.SHEETS.CALENDAR)),
    absences:readObjects_(ss.getSheetByName(SCU.SHEETS.ABSENCES)),training:readObjects_(ss.getSheetByName(SCU.SHEETS.TRAINING)),
    deadlines:readObjects_(ss.getSheetByName(SCU.SHEETS.DEADLINES)),olpPresences:readObjects_(ss.getSheetByName(SCU.SHEETS.OLP_PRESENCE))};
}

function saveSettings_(user,settings){
  if(!settings||typeof settings!=='object') throw new Error('Impostazioni non valide.');
  const ss=db_(),sheet=ss.getSheetByName(SCU.SHEETS.SETTINGS),rows=readObjects_(sheet);
  Object.keys(SETTING_KEYS).forEach(frontKey=>{
    if(settings[frontKey]===undefined) return;const key=SETTING_KEYS[frontKey];const row=rows.find(r=>String(r.CHIAVE)===key);
    if(row){row.VALORE=settings[frontKey];upsertObject_(sheet,'CHIAVE',row);}else appendObject_(sheet,{CHIAVE:key,VALORE:settings[frontKey],DESCRIZIONE:''});
  });
  audit_(user,'SAVE','IMPOSTAZIONI','GLOBAL','Aggiornate impostazioni');return {ok:true,settings:readSettings_(ss)};
}

function saveProject_(user,p){
  p=p||{};const row={ID_PROGETTO:p.id||p.ID_PROGETTO||newId_('PRJ'),TITOLO:p.title||p.TITOLO||'',BANDO:p.call||p.BANDO||'',CODICE_PROGETTO:p.code||p.CODICE_PROGETTO||'',SEDE_ATTUAZIONE:p.site||p.SEDE_ATTUAZIONE||'',CODICE_SEDE:p.siteCode||p.CODICE_SEDE||'',DATA_INIZIO:dateValue_(p.startDate||p.DATA_INIZIO),DATA_FINE:dateValue_(p.endDate||p.DATA_FINE),MONTE_ORE:num_(p.annualHours||p.MONTE_ORE||1145),GIORNI_SETTIMANALI:num_(p.weeklyDays||p.GIORNI_SETTIMANALI||5),ORE_SETTIMANALI_MEDIE:num_(p.weeklyAverageHours||p.ORE_SETTIMANALI_MEDIE||25),OLP_PRINCIPALE:p.mainOlpId||p.OLP_PRINCIPALE||''};
  upsertObject_(db_().getSheetByName(SCU.SHEETS.PROJECTS),'ID_PROGETTO',row);audit_(user,'UPSERT','PROGETTO',row.ID_PROGETTO,row.TITOLO);return {ok:true,id:row.ID_PROGETTO};
}
function saveOperator_(user,o){
  o=o||{};const row={ID_OPERATORE:o.id||o.ID_OPERATORE||newId_('OP'),CODICE_VOLONTARIO:o.volunteerCode||o.CODICE_VOLONTARIO||'',COGNOME:o.surname||o.COGNOME||'',NOME:o.name||o.NOME||'',CODICE_FISCALE:o.fiscalCode||o.CODICE_FISCALE||'',EMAIL:o.email||o.EMAIL||'',TELEFONO:o.phone||o.TELEFONO||'',PROGETTO_ID:o.projectId||o.PROGETTO_ID||'',DATA_INIZIO:dateValue_(o.startDate||o.DATA_INIZIO),DATA_FINE:dateValue_(o.endDate||o.DATA_FINE),SUBENTRANTE:bool_(o.substitute??o.SUBENTRANTE),PERMESSI_ORDINARI_MAX:num_(o.ordinaryPermitMax||o.PERMESSI_ORDINARI_MAX||20),ATTIVO:bool_(o.active??o.ATTIVO??true),NOTE:o.notes||o.NOTE||''};
  if(!row.COGNOME||!row.NOME) throw new Error('Nome e cognome sono obbligatori.');
  upsertObject_(db_().getSheetByName(SCU.SHEETS.OPERATORS),'ID_OPERATORE',row);audit_(user,'UPSERT','OPERATORE',row.ID_OPERATORE,row.NOME+' '+row.COGNOME);return {ok:true,id:row.ID_OPERATORE};
}
function deleteOperator_(user,id){
  const sheet=db_().getSheetByName(SCU.SHEETS.OPERATORS),rows=readObjects_(sheet),row=rows.find(r=>String(r.ID_OPERATORE)===String(id));if(!row)throw new Error('Operatore non trovato.');row.ATTIVO=false;upsertObject_(sheet,'ID_OPERATORE',row);audit_(user,'DISABLE','OPERATORE',id,'Operatore disattivato');return {ok:true};
}
function saveOlp_(user,o){
  o=o||{};const row={ID_OLP:o.id||o.ID_OLP||newId_('OLP'),COGNOME:o.surname||o.COGNOME||'',NOME:o.name||o.NOME||'',EMAIL:o.email||o.EMAIL||'',TELEFONO:o.phone||o.TELEFONO||'',PROGETTO_ID:o.projectId||o.PROGETTO_ID||'',DATA_INIZIO:dateValue_(o.startDate||o.DATA_INIZIO),DATA_FINE:dateValue_(o.endDate||o.DATA_FINE),ATTIVO:bool_(o.active??o.ATTIVO??true),NOTE:o.notes||o.NOTE||''};
  if(!row.COGNOME||!row.NOME) throw new Error('Nome e cognome OLP sono obbligatori.');upsertObject_(db_().getSheetByName(SCU.SHEETS.OLP),'ID_OLP',row);audit_(user,'UPSERT','OLP',row.ID_OLP,row.NOME+' '+row.COGNOME);return {ok:true,id:row.ID_OLP};
}
function saveCalendarEntry_(user,e){
  e=e||{};const row={ID:e.id||e.ID||newId_('CAL'),DATA:dateValue_(e.date||e.DATA),OPERATORE_ID:e.operatorId||e.OPERATORE_ID||'',PROGETTO_ID:e.projectId||e.PROGETTO_ID||'',ORA_INIZIO:e.start||e.ORA_INIZIO||'',ORA_FINE:e.end||e.ORA_FINE||'',TIPO:e.type||e.TIPO||'SERVIZIO',ORE_EFFETTIVE:num_(e.effectiveHours??e.ORE_EFFETTIVE),ORE_RICONOSCIUTE:num_(e.recognizedHours??e.ORE_RICONOSCIUTE),SEDE:e.site||e.SEDE||'',NOTE:e.notes||e.NOTE||'',MODIFICATO_IL:new Date(),MODIFICATO_DA:user.username};
  if(!row.DATA||!row.OPERATORE_ID) throw new Error('Data e operatore sono obbligatori.');upsertObject_(db_().getSheetByName(SCU.SHEETS.CALENDAR),'ID',row);audit_(user,'UPSERT','CALENDARIO',row.ID,row.DATA+' '+row.OPERATORE_ID);return {ok:true,id:row.ID};
}
function saveAbsence_(user,a){
  a=a||{};const row={ID:a.id||a.ID||newId_('ASS'),DATA:dateValue_(a.date||a.DATA),OPERATORE_ID:a.operatorId||a.OPERATORE_ID||'',TIPO:a.type||a.TIPO||'',ORE_PREVISTE:num_(a.scheduledHours??a.ORE_PREVISTE),ORE_RICONOSCIUTE:num_(a.recognizedHours??a.ORE_RICONOSCIUTE),DOCUMENTO_PRESENTE:bool_(a.documentPresent??a.DOCUMENTO_PRESENTE),DATA_RICHIESTA:dateValue_(a.requestDate||a.DATA_RICHIESTA||new Date()),APPROVATO:bool_(a.approved??a.APPROVATO??true),NOTE:a.notes||a.NOTE||''};
  upsertObject_(db_().getSheetByName(SCU.SHEETS.ABSENCES),'ID',row);
  // Mantiene anche il calendario mensile coerente con l'assenza.
  saveCalendarEntry_(user,{date:row.DATA,operatorId:row.OPERATORE_ID,type:row.TIPO,effectiveHours:0,recognizedHours:row.ORE_RICONOSCIUTE,notes:row.NOTE});
  audit_(user,'UPSERT','ASSENZA',row.ID,row.TIPO);return {ok:true,id:row.ID};
}
function saveTraining_(user,t){
  t=t||{};const row={ID:t.id||t.ID||newId_('FOR'),OPERATORE_ID:t.operatorId||t.OPERATORE_ID||'',TIPO_FORMAZIONE:t.type||t.TIPO_FORMAZIONE||'',MODULO:t.module||t.MODULO||'',DATA:dateValue_(t.date||t.DATA),ORA_INIZIO:t.start||t.ORA_INIZIO||'',ORA_FINE:t.end||t.ORA_FINE||'',ORE:num_(t.hours??t.ORE),MODALITA:t.mode||t.MODALITA||'',FORMATORE:t.trainer||t.FORMATORE||'',RECUPERO:bool_(t.recovery??t.RECUPERO),NOTE:t.notes||t.NOTE||''};
  upsertObject_(db_().getSheetByName(SCU.SHEETS.TRAINING),'ID',row);audit_(user,'UPSERT','FORMAZIONE',row.ID,row.TIPO_FORMAZIONE);return {ok:true,id:row.ID};
}
function saveDeadline_(user,d){
  d=d||{};const completed=bool_(d.completed??d.COMPLETATA);const row={ID:d.id||d.ID||newId_('SCA'),TIPO:d.type||d.TIPO||'',DESCRIZIONE:d.description||d.DESCRIZIONE||'',DATA_SCADENZA:dateValue_(d.dueDate||d.DATA_SCADENZA),PROGETTO_ID:d.projectId||d.PROGETTO_ID||'',OPERATORE_ID:d.operatorId||d.OPERATORE_ID||'',COMPLETATA:completed,DATA_COMPLETAMENTO:completed?dateValue_(d.completedDate||d.DATA_COMPLETAMENTO||new Date()):'',NOTE:d.notes||d.NOTE||''};
  upsertObject_(db_().getSheetByName(SCU.SHEETS.DEADLINES),'ID',row);audit_(user,'UPSERT','SCADENZA',row.ID,row.DESCRIZIONE);return {ok:true,id:row.ID};
}
function saveOlpPresence_(user,p){
  p=p||{};const row={ID:p.id||p.ID||newId_('POLP'),DATA:dateValue_(p.date||p.DATA),OLP_ID:p.olpId||p.OLP_ID||'',PROGETTO_ID:p.projectId||p.PROGETTO_ID||'',ORA_INIZIO:p.start||p.ORA_INIZIO||'',ORA_FINE:p.end||p.ORA_FINE||'',ORE:num_(p.hours??p.ORE),NOTE:p.notes||p.NOTE||''};
  upsertObject_(db_().getSheetByName(SCU.SHEETS.OLP_PRESENCE),'ID',row);audit_(user,'UPSERT','PRESENZA_OLP',row.ID,row.OLP_ID);return {ok:true,id:row.ID};
}
function deleteById_(user,sheetName,id){
  const sheet=db_().getSheetByName(sheetName),values=sheet.getDataRange().getValues();if(values.length<2)return {ok:true};const headers=values[0],idx=headers.indexOf('ID');
  for(let r=values.length-1;r>=1;r--){if(String(values[r][idx])===String(id)){sheet.deleteRow(r+1);audit_(user,'DELETE',sheetName,id,'Riga eliminata');return {ok:true};}}
  throw new Error('Elemento non trovato.');
}

function db_(){
  const id=PropertiesService.getScriptProperties().getProperty('SCU_SPREADSHEET_ID');if(!id)throw new Error('Backend non inizializzato. Eseguire initializeAtlasScu().');return SpreadsheetApp.openById(id);
}
function ensureSchema_(ss){
  Object.keys(SCU_HEADERS).forEach(name=>{let sheet=ss.getSheetByName(name);if(!sheet)sheet=ss.insertSheet(name);const headers=SCU_HEADERS[name];const current=sheet.getRange(1,1,1,headers.length).getValues()[0];if(headers.some((h,i)=>String(current[i]||'')!==h))sheet.getRange(1,1,1,headers.length).setValues([headers]);sheet.setFrozenRows(1);});
}
function seedSettings_(ss){
  const sheet=ss.getSheetByName(SCU.SHEETS.SETTINGS),existing=readObjects_(sheet);SCU_DEFAULT_SETTINGS.forEach(row=>{if(!existing.some(r=>String(r.CHIAVE)===row[0]))sheet.appendRow(row);});
}
function readSettings_(ss){
  const rows=readObjects_(ss.getSheetByName(SCU.SHEETS.SETTINGS)),out={};Object.keys(SETTING_KEYS).forEach(frontKey=>{const key=SETTING_KEYS[frontKey],r=rows.find(x=>String(x.CHIAVE)===key);if(!r)return;let v=r.VALORE;if(/^(\d+(?:[\.,]\d+)?)$/.test(String(v)))v=Number(String(v).replace(',','.'));out[frontKey]=v;});return out;
}
function readObjects_(sheet){
  const values=sheet.getDataRange().getValues();if(!values.length)return[];const headers=values[0].map(String);return values.slice(1).filter(row=>row.some(v=>v!==''&&v!==null)).map(row=>{const o={};headers.forEach((h,i)=>o[h]=serializeCell_(row[i]));return o;});
}
function appendObject_(sheet,obj){
  const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(String);sheet.appendRow(headers.map(h=>obj[h]!==undefined?obj[h]:''));
}
function upsertObject_(sheet,key,obj){
  const values=sheet.getDataRange().getValues(),headers=values[0].map(String),keyIdx=headers.indexOf(key);if(keyIdx<0)throw new Error('Chiave '+key+' non presente in '+sheet.getName());const wanted=String(obj[key]);
  for(let r=1;r<values.length;r++){if(String(values[r][keyIdx])===wanted){sheet.getRange(r+1,1,1,headers.length).setValues([headers.map(h=>obj[h]!==undefined?obj[h]:values[r][headers.indexOf(h)])]);return;}}
  appendObject_(sheet,obj);
}
function audit_(user,action,entity,id,details){
  try{appendObject_(db_().getSheetByName(SCU.SHEETS.AUDIT),{TIMESTAMP:new Date(),UTENTE:user.username||user.USERNAME||'',AZIONE:action,ENTITA:entity,ID_ENTITA:id||'',DETTAGLI:details||''});}catch(_){ }
}
function publicUser_(u){return {id:u.ID,username:u.USERNAME,name:u.NOME,role:u.RUOLO};}
function newId_(prefix){return prefix+'_'+Utilities.getUuid().replace(/-/g,'').slice(0,14).toUpperCase();}
function randomPassword_(){return 'Scu!'+Utilities.getUuid().replace(/-/g,'').slice(0,16);}
function hashPassword_(password,salt){
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(salt||'')+'|'+String(password||''),Utilities.Charset.UTF_8);return bytes.map(b=>('0'+((b<0?b+256:b).toString(16))).slice(-2)).join('');
}
function serializeCell_(v){if(v instanceof Date)return Utilities.formatDate(v,Session.getScriptTimeZone()||'Europe/Rome',v.getHours()||v.getMinutes()?'yyyy-MM-dd HH:mm:ss':'yyyy-MM-dd');return v;}
function dateValue_(v){if(!v)return'';if(v instanceof Date)return Utilities.formatDate(v,Session.getScriptTimeZone()||'Europe/Rome','yyyy-MM-dd');const s=String(v);return s.length>=10?s.slice(0,10):s;}
function truthy_(v){return v===true||String(v).toUpperCase()==='TRUE'||String(v).toUpperCase()==='SI'||String(v)==='1';}
function bool_(v){return truthy_(v);}
function num_(v){const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:0;}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
