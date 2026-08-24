import { APPS_SCRIPT_URL } from './config.js';

function withTimeout(ms){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),ms);
  return {controller,timer};
}

export function backendConfigured(){
  return /\/exec(?:\?|$)/.test(String(APPS_SCRIPT_URL||'').trim());
}

export async function api(action,payload={},timeoutMs=30000){
  if(!backendConfigured()) throw new Error('Backend non ancora configurato. Distribuire Google Apps Script e inserire il relativo URL /exec in js/config.js.');
  const {controller,timer}=withTimeout(timeoutMs);
  try{
    const response=await fetch(APPS_SCRIPT_URL,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({action,...payload}),
      redirect:'follow',
      signal:controller.signal
    });
    const raw=await response.text();
    let data;
    try{data=JSON.parse(raw);}catch{throw new Error('Risposta backend non valida. Controllare distribuzione e autorizzazioni Apps Script.');}
    if(!response.ok||!data.ok) throw new Error(data.error||`Errore HTTP ${response.status}`);
    return data;
  }catch(err){
    if(err?.name==='AbortError') throw new Error('Tempo scaduto durante la comunicazione con il backend.');
    throw err;
  }finally{clearTimeout(timer);}
}

export const login=(username,password)=>api('login',{username,password},20000);
export const logout=token=>api('logout',{token},15000);
export const verifySession=token=>api('session',{token},15000);
export const bootstrap=token=>api('bootstrap',{token},30000);
export const saveSettings=(token,settings)=>api('saveSettings',{token,settings});
export const saveProject=(token,project)=>api('saveProject',{token,project});
export const saveOperator=(token,operator)=>api('saveOperator',{token,operator});
export const deleteOperator=(token,id)=>api('deleteOperator',{token,id});
export const saveOlp=(token,olp)=>api('saveOlp',{token,olp});
export const saveCalendarEntry=(token,entry)=>api('saveCalendarEntry',{token,entry});
export const deleteCalendarEntry=(token,id)=>api('deleteCalendarEntry',{token,id});
export const saveAbsence=(token,absence)=>api('saveAbsence',{token,absence});
export const saveTraining=(token,training)=>api('saveTraining',{token,training});
export const saveDeadline=(token,deadline)=>api('saveDeadline',{token,deadline});
export const saveOlpPresence=(token,presence)=>api('saveOlpPresence',{token,presence});
