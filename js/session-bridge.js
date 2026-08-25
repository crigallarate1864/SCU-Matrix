import { SESSION_KEY } from './config.js';

// Durante lo sviluppo mantiene la sessione del dispositivo tra chiusure/riaperture.
// L'autorizzazione resta comunque verificata dal backend.
try {
  const sessionValue = sessionStorage.getItem(SESSION_KEY);
  const savedValue = localStorage.getItem(SESSION_KEY);
  if (sessionValue) localStorage.setItem(SESSION_KEY, sessionValue);
  else if (savedValue) sessionStorage.setItem(SESSION_KEY, savedValue);
} catch {}

document.addEventListener('click',event=>{
  if(!event.target.closest('#logoutButton')) return;
  try{localStorage.removeItem(SESSION_KEY);}catch{}
},true);
