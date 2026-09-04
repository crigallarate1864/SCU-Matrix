import { SESSION_KEY } from './config.js';

const publicSession={
  token:'PUBLIC_ADMIN',
  user:{id:'PUBLIC_ADMIN',username:'admin.scu',name:'Amministratore SCU',role:'AMMINISTRATORE_SCU'},
  expiresAt:''
};
try{sessionStorage.setItem(SESSION_KEY,JSON.stringify(publicSession));}catch{}

await import('./bootstrap-cache-v1.js?v=0.7.0');
await import('./app-v7.js?v=0.7.0');
