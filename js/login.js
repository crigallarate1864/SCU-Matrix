import { SESSION_KEY } from './config.js';
import { backendConfigured, login, verifySession } from './api.js';

const form=document.getElementById('loginForm');
const username=document.getElementById('username');
const password=document.getElementById('password');
const button=document.getElementById('loginButton');
const errorBox=document.getElementById('loginError');
const infoBox=document.getElementById('loginInfo');

// Rimuove l'esperimento di sessione persistente che poteva lasciare il browser
// bloccato con un token vecchio/scaduto. Per ora torniamo al login stabile.
try{localStorage.removeItem(SESSION_KEY);}catch{}

function setBusy(value){button.disabled=value;button.textContent=value?'Accesso in corso…':'Accedi ad ATLAS SCU';}
function saveSession(data){sessionStorage.setItem(SESSION_KEY,JSON.stringify({token:data.token,user:data.user,expiresAt:data.expiresAt||''}));}
function readSession(){try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');}catch{return null;}}
function clearSession(){sessionStorage.removeItem(SESSION_KEY);}

async function tryExistingSession(){
  if(!backendConfigured()){
    infoBox.textContent='Backend non configurato.';
    return;
  }
  const current=readSession();
  if(!current?.token) return;
  try{
    const data=await verifySession(current.token);
    if(data?.user){saveSession({...current,...data,token:current.token});location.replace('app.html');return;}
  }catch{clearSession();}
}

form.addEventListener('submit',async event=>{
  event.preventDefault();
  errorBox.textContent='';
  infoBox.textContent='';
  const u=username.value.trim();
  const p=password.value;
  if(!u||!p){errorBox.textContent='Inserisci nome utente e password.';return;}
  setBusy(true);
  try{
    const data=await login(u,p);
    saveSession(data);
    location.replace('app.html');
  }catch(err){
    clearSession();
    errorBox.textContent=err.message||'Accesso non riuscito.';
  }finally{setBusy(false);}
});

tryExistingSession();
