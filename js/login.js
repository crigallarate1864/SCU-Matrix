import { SESSION_KEY } from './config.js';
import { backendConfigured, login, verifySession } from './api.js';

const form=document.getElementById('loginForm');
const username=document.getElementById('username');
const password=document.getElementById('password');
const button=document.getElementById('loginButton');
const errorBox=document.getElementById('loginError');
const infoBox=document.getElementById('loginInfo');

function setBusy(value){button.disabled=value;button.textContent=value?'Accesso in corso…':'Accedi ad ATLAS SCU';}
function saveSession(data){
  const raw=JSON.stringify({token:data.token,user:data.user,expiresAt:data.expiresAt||''});
  sessionStorage.setItem(SESSION_KEY,raw);
  localStorage.setItem(SESSION_KEY,raw);
}
function readSession(){
  try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||localStorage.getItem(SESSION_KEY)||'null');}
  catch{return null;}
}
function clearSession(){sessionStorage.removeItem(SESSION_KEY);localStorage.removeItem(SESSION_KEY);}

async function tryExistingSession(){
  if(!backendConfigured()){
    infoBox.textContent='Frontend pronto. Manca solo il collegamento alla Web App Google Apps Script.';
    return;
  }
  const current=readSession();
  if(!current?.token) return;
  form.classList.add('checking-session');
  infoBox.textContent='Accesso automatico in corso…';
  try{
    const data=await verifySession(current.token);
    if(data?.user){saveSession({...current,...data,token:current.token});location.replace('app.html');return;}
  }catch{clearSession();}
  finally{form.classList.remove('checking-session');}
  infoBox.textContent='';
}

form.addEventListener('submit',async event=>{
  event.preventDefault();errorBox.textContent='';infoBox.textContent='';
  const u=username.value.trim();const p=password.value;
  if(!u||!p){errorBox.textContent='Inserisci nome utente e password.';return;}
  setBusy(true);
  try{
    const data=await login(u,p);
    saveSession(data);
    location.replace('app.html');
  }catch(err){errorBox.textContent=err.message||'Accesso non riuscito.';}
  finally{setBusy(false);}
});

tryExistingSession();
