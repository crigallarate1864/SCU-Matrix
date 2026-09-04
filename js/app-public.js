import { SESSION_KEY } from './config.js';

// Modalità amministratore unico: nessuna pagina di accesso.
// Il backend in modalità pubblica ignora il token e usa il profilo amministratore fisso.
const publicSession = {
  token: 'PUBLIC_ADMIN',
  user: {
    id: 'PUBLIC_ADMIN',
    username: 'admin.scu',
    name: 'Amministratore SCU',
    role: 'AMMINISTRATORE_SCU'
  },
  expiresAt: ''
};

try {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(publicSession));
} catch {}

await import('./app-v5.js?v=0.6.0');
