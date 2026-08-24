# Backend ATLAS SCU — Google Apps Script

Il backend è pensato per essere **collegato direttamente** al file Google Sheets `ATLAS SCU - Database`.

## Prima configurazione

1. Aprire il Google Sheet `ATLAS SCU - Database`.
2. Aprire **Estensioni → Apps Script**.
3. Nel file `Code.gs` sostituire il contenuto con quello presente in `backend/Code.gs` di questo repository.
4. Salvare il progetto con nome `ATLAS SCU - Server`.
5. Dalle impostazioni del progetto impostare il fuso orario su **Europe/Rome**.
6. Selezionare la funzione `initializeAtlasScu` e premere **Esegui**.
7. Accettare le autorizzazioni richieste da Google.
8. Aprire il **Log di esecuzione**: vengono mostrati lo username `admin.scu` e una password temporanea generata casualmente.
9. Conservare le credenziali in un gestore password.

La password in chiaro non viene salvata nel foglio: viene conservato soltanto un hash SHA-256 con salt.

## Distribuzione Web App

1. In Apps Script scegliere **Distribuisci → Nuova distribuzione**.
2. Tipo: **Applicazione web**.
3. Esegui come: **Me**.
4. Chi ha accesso: configurare l'opzione che consenta al frontend GitHub Pages di chiamare la Web App secondo le policy dell'account Google utilizzato.
5. Distribuire e copiare l'URL che termina con `/exec`.
6. Inserire quell'URL in `js/config.js` nella costante `APPS_SCRIPT_URL`.

Dopo ogni modifica del backend, creare una nuova versione della distribuzione o aggiornare quella esistente.

## Cambio password

Nel sorgente Apps Script è disponibile `changeAdminPassword()`.

1. Inserire temporaneamente la nuova password nella costante locale `NEW_PASSWORD` della funzione.
2. Eseguire `changeAdminPassword()`.
3. Subito dopo ripristinare `NEW_PASSWORD='INSERIRE_QUI_UNA_PASSWORD_NUOVA'` e salvare.

La funzione revoca tutte le sessioni aperte.

## Dati sensibili

Non inserire mai nel repository GitHub:
- password;
- token di sessione;
- codici fiscali;
- IBAN;
- esportazioni del database;
- documentazione personale degli operatori.

Il repository contiene soltanto il codice applicativo. I dati risiedono nel Google Sheet privato.
