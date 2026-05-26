# Gestionale Dipendenti — PWA

Applicazione web progressiva (PWA) per la gestione del personale. Funziona direttamente dal browser, installabile su desktop e mobile, e lavora offline.

## Funzionalità

- **Dashboard** con statistiche e grafici in tempo reale
- **5 tabelle**: Dipendenti, Contratti, Formazione, Sorveglianza Sanitaria, Aziende
- **Ricerca** full-text su ogni tabella
- **Ordinamento** per colonna
- **Aggiunta / Modifica / Eliminazione** record
- **Export CSV** per ogni tabella
- **3 ruoli utente**: admin, editor, viewer
- **Gestione utenti** (solo admin)
- **Offline** grazie al Service Worker
- **Installabile** come app su desktop e mobile

## Credenziali predefinite

| Username | Password   | Ruolo  | Permessi              |
|----------|-----------|--------|-----------------------|
| admin    | admin123  | admin  | tutto + gestione utenti |
| hr       | hr2024    | editor | visualizza + modifica |
| viewer   | viewer2024| viewer | solo lettura          |

> **Cambia le password** subito dopo il primo accesso dalla sezione "Gestione Utenti".

## Deploy su GitHub Pages

1. Crea un repository su GitHub (es. `gestionale-dipendenti`)
2. Carica tutti i file di questa cartella nel repository
3. Vai su **Settings → Pages**
4. Imposta **Source**: `Deploy from a branch` → `main` → `/ (root)`
5. Salva — dopo qualche minuto l'app sarà disponibile su:
   `https://tuousername.github.io/gestionale-dipendenti/`

## Struttura file

```
/
├── index.html          # HTML principale
├── app.js              # Logica applicazione
├── style.css           # Stili
├── manifest.json       # Manifest PWA
├── sw.js               # Service Worker (offline)
├── icons/
│   ├── icon-192.svg
│   └── icon-512.svg
└── data/
    ├── dipendenti.json
    ├── contratti.json
    ├── formazione.json
    ├── sorveglianza.json
    └── aziende.json
```

## Note sui dati

I dati vengono caricati dai file JSON al primo avvio e poi salvati nel `localStorage` del browser. Le modifiche apportate tramite l'interfaccia sono **persistenti** per ogni utente nel proprio browser.

Per resettare i dati ai valori originali: apri la console del browser (F12) e digita:
```javascript
['dipendenti','contratti','formazione','sorveglianza','aziende'].forEach(t => localStorage.removeItem('gestionale_data_' + t));
location.reload();
```
