'use strict';

// ─── AUTH ─────────────────────────────────────────────────────────────────────
const DEFAULT_USERS = [
  { username:'admin',  password:'admin123',   role:'admin',  nome:'Amministratore' },
  { username:'hr',     password:'hr2024',     role:'editor', nome:'Ufficio HR' },
  { username:'viewer', password:'viewer2024', role:'viewer', nome:'Visualizzatore' },
];
const ALL_PERMISSIONS={view:{label:'Visualizza record',desc:'Vedere i dati nelle tabelle'},add:{label:'Aggiungi record',desc:'Inserire nuovi record'},edit:{label:'Modifica record',desc:'Modificare record esistenti'},delete:{label:'Elimina record',desc:'Cancellare record'},import:{label:'Importa dati',desc:'Caricare file Excel o ZIP'},export:{label:'Esporta dati',desc:'Scaricare Excel e backup'},print:{label:'Stampa',desc:'Stampare tabelle e report'},allegati:{label:'Gestione allegati PDF',desc:'Caricare e scaricare PDF'},quick_search:{label:'Ricerche rapide',desc:'Ricerche predefinite'},adv_search:{label:'Ricerca avanzata',desc:'Filtri avanzati'},stats:{label:'Statistiche per anno',desc:'Vedere le statistiche'},clear_table:{label:'Svuota tabella',desc:'Eliminare tutti i record'},manage_users:{label:'Gestione utenti',desc:'Solo admin'}};
const ROLE_DEFAULTS={admin:Object.keys(ALL_PERMISSIONS),editor:['view','add','edit','import','export','print','allegati','quick_search','adv_search','stats'],viewer:['view','quick_search','adv_search','stats','print']};
const Auth={
  getUsers(){const s=localStorage.getItem('gest_users');const users=s?JSON.parse(s):DEFAULT_USERS;return users.map(u=>{if(!u.permissions)u.permissions=ROLE_DEFAULTS[u.role]||ROLE_DEFAULTS.viewer;return u;});},
  saveUsers(u){localStorage.setItem('gest_users',JSON.stringify(u));},
  login(u,p){const x=this.getUsers().find(x=>x.username===u&&x.password===p);if(x){sessionStorage.setItem('gest_sess',JSON.stringify(x));return x;}return null;},
  logout(){sessionStorage.removeItem('gest_sess');},
  current(){const s=sessionStorage.getItem('gest_sess');return s?JSON.parse(s):null;},
  isAdmin(){const u=this.current();return u&&u.role==='admin';},
  can(perm){const u=this.current();if(!u)return false;if(u.role==='admin')return true;return(u.permissions||ROLE_DEFAULTS[u.role]||[]).includes(perm);},
  canEdit(){return this.can('edit')||this.can('add');},
};

// ─── STORE ────────────────────────────────────────────────────────────────────
const Store = {
  data:{},
  _nasBase(){ return typeof NAS_API !== 'undefined' ? NAS_API.replace('/api','') : ''; },

  // Carica i dati: se il NAS è configurato e raggiungibile, usa quelli (fonte di verità condivisa);
  // altrimenti fallback su localStorage (modalità locale/offline/GitHub Pages)
  async load(){
    const base = this._nasBase();
    for(const t of ['dipendenti','contratti','formazione','sorveglianza','aziende']){
      let loadedFromNas = false;
      if(base){
        try{
          const r = await fetch(`${base}/api/${t}`);
          if(r.ok){
            const remote = await r.json();
            // Solo se il NAS ha REALMENTE dati validi con colonne popolate.
            // Se columns è vuoto (tabella non ancora inizializzata sul server),
            // NON sovrascrivere: meglio usare i dati locali/embedded e poi sincronizzarli.
            if(remote && Array.isArray(remote.rows) && Array.isArray(remote.columns) && remote.columns.length>0){
              this.data[t] = remote;
              localStorage.setItem('gest_data_'+t, JSON.stringify(remote)); // cache locale di backup
              loadedFromNas = true;
            }
          }
        }catch(e){ console.warn('Store.load: NAS non raggiungibile per', t, e.message); }
      }
      if(!loadedFromNas){
        const local = localStorage.getItem('gest_data_'+t);
        if(local){
          try{
            const parsedLocal = JSON.parse(local);
            // Stesso controllo: se anche il locale ha columns vuoto, usa l'embedded
            if(parsedLocal && Array.isArray(parsedLocal.columns) && parsedLocal.columns.length>0){
              this.data[t] = parsedLocal;
            } else {
              this.data[t] = JSON.parse(JSON.stringify(EMBEDDED_DATA[t]));
            }
          }catch{ this.data[t]=JSON.parse(JSON.stringify(EMBEDDED_DATA[t])); }
        }
        else{ this.data[t]=JSON.parse(JSON.stringify(EMBEDDED_DATA[t])); }
        // Se il NAS è configurato ma non aveva ancora dati validi per questa tabella, inizializzalo ora
        if(base) this.save(t);
      }
    }
    // Riallineamento retroattivo: propaga Data fine rapporto e Data Assunzione
    // da Contratti → Dipendenti per tutti i record dove Dipendenti li ha vuoti.
    // Questo risolve i casi in cui il dato esiste in Contratti ma non è mai stato
    // sincronizzato in Dipendenti (es. record creati prima dell'aggiunta di questa logica).
    this._retroSyncDateFromContratti();
  },

  // Copia Data fine rapporto e Data Assunzione da Contratti verso Dipendenti
  // per ogni dipendente che ha quei campi vuoti in Dipendenti.
  // Viene eseguita al caricamento e non sovrascrive valori già presenti.
  _retroSyncDateFromContratti(){
    const dipRows = this.data['dipendenti']?.rows;
    const conRows = this.data['contratti']?.rows;
    if(!dipRows || !conRows) return;
    const normalize = s => String(s||'').trim().replace(',','.').toUpperCase();

    // Costruisce una mappa N°Socio → record contratto più recente (per Data Assunzione)
    // e raccoglie la Data fine rapporto più recente tra tutti i contratti dello stesso socio
    const conBySocio = {};
    conRows.forEach(r => {
      const socio = normalize(r['Id Dipendente (N° Socio)'] || '');
      if(!socio) return;
      if(!conBySocio[socio]) conBySocio[socio] = [];
      conBySocio[socio].push(r);
    });

    let changed = false;
    dipRows.forEach(d => {
      const socio = normalize(d['N° Socio'] || '');
      if(!socio) return;
      const contracts = conBySocio[socio];
      if(!contracts || !contracts.length) return;

      // Data Assunzione: prende la più vecchia tra i contratti (prima assunzione)
      if(!d['Data assunzione'] || !d['Data assunzione'].trim()){
        const dates = contracts.map(c => c['Data Assunzione'] || '').filter(v => v.trim());
        if(dates.length){
          // ordina ISO-compatibile DD-MM-YYYY → YYYY-MM-DD per sort
          const toISO = s => { const p=s.split(/[-\/]/); return p[0].length===4?s:`${p[2]}-${p[1]}-${p[0]}`; };
          dates.sort((a,b) => toISO(a) > toISO(b) ? 1 : -1);
          d['Data assunzione'] = dates[0]; // la più vecchia
          changed = true;
        }
      }

      // Data fine rapporto: prende la più recente tra i contratti
      if(!d['Data fine rapporto'] || !d['Data fine rapporto'].trim()){
        const dates = contracts.map(c => c['Data fine rapporto'] || '').filter(v => v.trim());
        if(dates.length){
          const toISO = s => { const p=s.split(/[-\/]/); return p[0].length===4?s:`${p[2]}-${p[1]}-${p[0]}`; };
          dates.sort((a,b) => toISO(a) > toISO(b) ? -1 : 1);
          d['Data fine rapporto'] = dates[0]; // la più recente
          changed = true;
        }
      }
    });

    if(changed) this.save('dipendenti');
  },

  // Salva: sempre in localStorage (cache/fallback) e, se il NAS è configurato, anche lì (sorgente condivisa)
  save(t){
    localStorage.setItem('gest_data_'+t, JSON.stringify(this.data[t]));
    const base = this._nasBase();
    if(base){
      fetch(`${base}/api/${t}`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(this.data[t])
      }).catch(e => console.warn('Store.save: sync NAS fallita per', t, e.message));
    }
  },
  getRows(t){ return this.data[t]?.rows||[]; },
  getCols(t){ return this.data[t]?.columns||[]; },
  addRow(t,row){
    row._id=Date.now().toString(36)+Math.random().toString(36).slice(2);
    this.data[t].rows.push(row);
    this.save(t);
    if(['dipendenti','contratti','formazione','sorveglianza'].includes(t)) this._syncAllTablesForSocio(row);
    if(['contratti','formazione','sorveglianza'].includes(t)) this._ensureDipendenteExists(row);
  },
  updateRow(t,idx,row){
    const id=this.data[t].rows[idx]?._id;
    this.data[t].rows[idx]={...row,_id:id};
    this.save(t);
    if(['dipendenti','contratti','formazione','sorveglianza'].includes(t)) this._syncAllTablesForSocio(this.data[t].rows[idx]);
    if(['contratti','formazione','sorveglianza'].includes(t)) this._ensureDipendenteExists(this.data[t].rows[idx]);
  },
  deleteRow(t,idx){ this.data[t].rows.splice(idx,1); this.save(t); },

  // Sincronizzazione UNIVERSALE tra tutte le tabelle collegate (Dipendenti, Contratti,
  // Formazione, Sorveglianza), tramite N° Socio. A differenza della vecchia logica
  // (che partiva solo da Dipendenti), questa funzione viene chiamata da QUALSIASI tabella
  // venga salvata/importata — così se modifichi "Stato Dipendente" direttamente in Contratti,
  // anche Formazione e Sorveglianza (e Dipendenti) si aggiornano, e viceversa.
  // Per ogni campo condiviso, usa il valore più recente trovato (quello della riga appena
  // salvata ha sempre priorità, dato che è la modifica più fresca).
  _syncAllTablesForSocio(sourceRow){
    const normalize = s => String(s||'').trim().replace(',', '.').toUpperCase();
    // N° Socio può chiamarsi "N° Socio" (Dipendenti) o "Id Dipendente (N° Socio)" (altre tabelle)
    const nSocioRaw = String(sourceRow['N° Socio'] || sourceRow['Id Dipendente (N° Socio)'] || '').trim();
    if(!nSocioRaw) return;
    const nSocioNorm = normalize(nSocioRaw);

    // Campi condivisi da sincronizzare ovunque esistano (in forma lowercase per il match)
    const SYNC_FIELDS = ['cognome','nome','azienda','stato dipendente','mansione',
      'data di nascita','luogo di nascita','codice fiscale','data assunzione',
      'data fine rapporto','causa fine rapporto'];

    // Gruppi di campi EQUIVALENTI che rappresentano lo stesso dato ma con nomi diversi
    // in tabelle diverse (es. "Telefono Cellulare" in Dipendenti = "Recapito telefonico"
    // in Sorveglianza). Ogni gruppo è un array di nomi lowercase considerati intercambiabili:
    // se uno qualsiasi viene compilato/modificato, il valore si propaga a tutti gli altri.
    const FIELD_ALIAS_GROUPS = [
      ['telefono cellulare', 'recapito telefonico'],
    ];

    // Mappa: campo lowercase → valore preso dalla riga appena salvata (sourceRow),
    // usando la chiave reale presente lì (case-insensitive)
    const sourceKeyByLower = {};
    Object.keys(sourceRow).forEach(k=>{ sourceKeyByLower[k.toLowerCase().trim()] = k; });
    const valuesToSync = {};
    SYNC_FIELDS.forEach(fieldLower=>{
      const realKey = sourceKeyByLower[fieldLower];
      if(realKey && sourceRow[realKey] !== '' && sourceRow[realKey] !== undefined){
        valuesToSync[fieldLower] = sourceRow[realKey];
      }
    });
    // Per ogni gruppo di alias, se la riga sorgente ha compilato UNO dei nomi del gruppo,
    // quel valore va sincronizzato verso TUTTI i nomi del gruppo (non solo verso lo stesso nome)
    const aliasValuesToSync = []; // array di {names:[...], value}
    FIELD_ALIAS_GROUPS.forEach(group=>{
      for(const fieldLower of group){
        const realKey = sourceKeyByLower[fieldLower];
        if(realKey && sourceRow[realKey] !== '' && sourceRow[realKey] !== undefined){
          aliasValuesToSync.push({ names: group, value: sourceRow[realKey] });
          break; // basta il primo trovato nella riga sorgente
        }
      }
    });
    if(!Object.keys(valuesToSync).length && !aliasValuesToSync.length) return;

    ['dipendenti','contratti','formazione','sorveglianza'].forEach(targetTable=>{
      const rows = this.data[targetTable]?.rows;
      if(!rows) return;
      let changed = false;
      rows.forEach(r=>{
        if(r === sourceRow) return; // non risincronizzare la riga che ha appena scatenato l'update
        const rNSocio = normalize(r['N° Socio'] || r['Id Dipendente (N° Socio)'] || '');
        if(rNSocio !== nSocioNorm) return;

        const keyByLower = {};
        Object.keys(r).forEach(k=>{ keyByLower[k.toLowerCase().trim()] = k; });

        Object.entries(valuesToSync).forEach(([fieldLower, val])=>{
          const realKey = keyByLower[fieldLower];
          if(!realKey) return; // questa tabella non ha questo campo: salta
          if(r[realKey] !== val){ r[realKey] = val; changed = true; }
        });

        // Applica i gruppi di alias: scrive il valore su QUALSIASI nome del gruppo
        // presente in questa riga (es. sia "Telefono Cellulare" che "Recapito telefonico"
        // se per qualche motivo entrambi esistessero nella stessa tabella)
        aliasValuesToSync.forEach(({names, value})=>{
          names.forEach(fieldLower=>{
            const realKey = keyByLower[fieldLower];
            if(!realKey) return;
            if(r[realKey] !== value){ r[realKey] = value; changed = true; }
          });
        });
      });
      if(changed) this.save(targetTable);
    });
  },

  // Direzione INVERSA: quando si importa/salva un record in Contratti, Formazione o
  // Sorveglianza, verifica se esiste già un Dipendente con lo stesso N° Socio. Se manca,
  // lo crea automaticamente (con i dati anagrafici disponibili: Cognome, Nome, Azienda,
  // N° Socio) così la tabella Dipendenti resta sempre completa indipendentemente
  // dall'ordine in cui si importano i file.
  _ensureDipendenteExists(sourceRow){
    const nSocioRaw = String(sourceRow['Id Dipendente (N° Socio)']||'').trim();
    if(!nSocioRaw) return;
    const normalize = s => String(s||'').trim().replace(',', '.').toUpperCase();
    const nSocioNorm = normalize(nSocioRaw);

    const dipRows = this.data['dipendenti']?.rows;
    if(!dipRows) return;
    const exists = dipRows.some(d => normalize(d['N° Socio']) === nSocioNorm);
    if(exists) return;

    if(!this.data['dipendenti'].columns || !this.data['dipendenti'].columns.length){
      this.data['dipendenti'].columns = JSON.parse(JSON.stringify(EMBEDDED_DATA['dipendenti'].columns));
    }
    // Copia tutti i campi condivisi disponibili nella riga sorgente (non solo Cognome/Nome/
    // Azienda), così se importi prima Sorveglianza o Formazione (che magari hanno già Codice
    // Fiscale, Data di Nascita ecc.), questi dati non vengono persi creando il Dipendente —
    // verranno comunque sincronizzati correttamente verso le altre tabelle dopo la creazione.
    const sourceKeyByLower = {};
    Object.keys(sourceRow).forEach(k=>{ sourceKeyByLower[k.toLowerCase().trim()] = k; });
    const SHARED_FIELDS_MAP = {
      'cognome':'Cognome', 'nome':'Nome', 'azienda':'Azienda',
      'stato dipendente':'Stato Dipendente', 'mansione':'Mansione',
      'data di nascita':'Data di Nascita', 'luogo di nascita':'Luogo di Nascita',
      'codice fiscale':'Codice Fiscale', 'data assunzione':'Data assunzione',
      'telefono cellulare':'Telefono Cellulare', 'recapito telefonico':'Telefono Cellulare',
    };
    const newDip = { 'N° Socio': nSocioRaw };
    Object.entries(SHARED_FIELDS_MAP).forEach(([srcKeyLower, dipField])=>{
      const realKey = sourceKeyByLower[srcKeyLower];
      if(realKey && sourceRow[realKey] && newDip[dipField]===undefined){
        newDip[dipField] = sourceRow[realKey];
      }
    });
    this.addRow('dipendenti', newDip);
    console.log('_ensureDipendenteExists: creato nuovo dipendente per N° Socio', nSocioRaw);
  },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function esc(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function toast(msg,type='success'){
  const el=document.createElement('div');
  el.className='toast-msg '+type;
  el.innerHTML='<span>'+(type==='success'?'✓':'✕')+'</span> '+esc(msg);
  document.getElementById('toast').appendChild(el);
  setTimeout(()=>el.remove(),3200);
}

// ─── OPZIONI MENU (esatte dalle pagine HTML) ──────────────────────────────────
const OPT = {
  aziende: ['ALIANTE Soc. Coop.','FIPAM  Scarl','SERIAM Scarl','CAPITOLINA LOGISTICA Scarl','CONSORZIO CAPITOLINA Srl',"SNA Servizi & Management Srl","SOCIETA' CESTINO"],
  sesso: ['Femmina','Maschio'],
  domicilio: ['Sì','No'],
  tipoDoc: ['Carta Identità','Carta Identità Europea','Patente','Passaporto','PSP'],
  statoSocio: ['ATTIVO','NON ATTIVO'],
  statoDip: ['ATTIVO','NON IN FORZA','NON ATTIVO'],
  mansioni: ['Addetto controllo accessi','Addetto manutenzione aree verdi','Addetto pulizie','Addetto pulizie esterne','Addetto Ristorazione','Autista pat. B','Cameriera ai piani','Cameriera ai piani / Addetto ristorazione','Custode','Facchino','Facchino / Muletto',"Facchino d'albergo","Facchino d'albergo / Addetto ristorazione",'Fattorino','Governante','Impiegato amministrativo','Magazziniere','Magazziniere / Muletto','Manutentore'],
  tipoPermesso: ['Asilo','Attesa occupazione','Carta di soggiorno','Lavoro autonomo','Lavoro subordinato','Motivi Familiari','Motivi di studio','Protezione Internazionale','Protezione Speciale','Protezione Sussidiaria','Protezione Temporanea','Soggiornante Lungo Periodo'],
  tipologiaCorso: ['Corso Base','Haccp','Preposto','Carrelli Elevatori / Muletti','Lavori in quota','Piattaforme aeree','Primo Soccorso','Antincendio','RLS'],
  statoCoro: ['Completato','Da completare'],
  idoneo: ['Idoneo','Idoneo con prescrizioni','In attesa visita','In attesa idoneità'],
  analisi: ['Sì','No'],
  labAnalisi: ['CERBA HEALTH CARE - Albano','CERBA HEALTH CARE - Appia (Roma)','CERBA HEALTH CARE - Balduina (Roma)','CERBA HEALTH CARE - Bologna (Roma)','CERBA HEALTH CARE - Casetta Mattei (Roma)','CERBA HEALTH CARE - Cesano','CERBA HEALTH CARE - Cipro (Roma)','CERBA HEALTH CARE - Fiano Romano','CERBA HEALTH CARE - Formello','CERBA HEALTH CARE - Graf (Roma)','CERBA HEALTH CARE - Guidonia','CERBA HEALTH CARE - Ladispoli','CERBA HEALTH CARE - Mentana','CERBA HEALTH CARE - Monterotondo','CERBA HEALTH CARE - Spinaceto (Roma)','CERBA HEALTH CARE - Tiburtina (Roma)','Privato'],
  tipoContratto: ['Tempo determinato','Tempo indeterminato','Lavoro intermittente'],
  orario: ['Full Time','Part time'],
  oreSettimanali: ['15','18','20','21','24','25','30','34','36','38','40'],
  livello: ["1°",'3','4','5','6','6.1','B1','B2','C1','C2','D1','D2','E1'],
  causaFine: ['Dimissioni','Dimissioni concludenti','Dimissioni in prova','Licenziamento','Non superamento prova','Scadenza contratto'],
  incentivi: ['SI','NO'],
  assistenza: ['Sì','No'],
};

// ─── DEFINIZIONE CAMPI ────────────────────────────────────────────────────────
// type: 'text'|'date'|'select'|'radio'|'textarea'
const FIELDS = {
  // DIPENDENTI
  'Azienda':                        {type:'select', opts:'aziende'},
  'Sesso':                          {type:'select', opts:'sesso'},
  'Domicilio diverso Residenza':    {type:'select', opts:'domicilio'},
  'Tipo Documento':                 {type:'select', opts:'tipoDoc'},
  'Stato Socio':                    {type:'select', opts:'statoSocio'},
  'Stato Dipendente':               {type:'select', opts:'statoDip'},
  'Stato dipendente':               {type:'select', opts:'statoDip'},
  'Mansione':                       {type:'select', opts:'mansioni'},
  'Tipo permesso':                  {type:'select', opts:'tipoPermesso'},
  'Data di Nascita':                {type:'date'},
  'Data Rilascio Documento':        {type:'date'},
  'Scadenza Documento':             {type:'date'},
  'Data Delibera Ammissione':       {type:'date'},
  'Data Delibera Recesso / Esclusione': {type:'date'},
  'Data rilascio Permesso Soggiorno':   {type:'date'},
  'Data scadenza Permesso Soggiorno':   {type:'date'},
  'Data assunzione':                {type:'date'},
  // FORMAZIONE
  'Tipologia Corso':                {type:'select', opts:'tipologiaCorso'},
  'Tipo formazione':                {type:'select', opts:'tipologiaCorso'},
  'Stato Corso':                    {type:'radio',  opts:'statoCoro'},
  'Data Corso':                     {type:'date'},
  'Scadenza Corso':                 {type:'date'},
  'Data':                           {type:'date'},
  'Scadenza':                       {type:'date'},
  // SORVEGLIANZA
  'Stato idoneità':                 {type:'radio',  opts:'idoneo'},
  'Analisi':                        {type:'select', opts:'analisi'},
  'Laboratorio Analisi':            {type:'select', opts:'labAnalisi'},
  'Data visita medica':             {type:'date'},
  'Data visita':                    {type:'date'},
  'Scadenza Idoneità':              {type:'date'},
  'Data Analisi':                   {type:'date'},
  // CONTRATTI
  'Tipologia contrattuale':         {type:'select', opts:'tipoContratto'},
  'Tipologia orario contrattuale':  {type:'radio',  opts:'orario'},
  'Ore contrattuali settimanali':   {type:'select', opts:'oreSettimanali'},
  'Livello':                        {type:'select', opts:'livello'},
  'Causa fine rapporto':            {type:'select', opts:'causaFine'},
  'Requisiti Incentivi':            {type:'radio',  opts:'incentivi'},
  'Assistenza Sanitaria integrativa':{type:'radio', opts:'assistenza'},
  'Data inizio':                    {type:'date'},
  'Data fine':                      {type:'date'},
  'Data Assunzione':                {type:'date'},
  'Fine periodo 1° ingresso':       {type:'date'},
  'Fine periodo 1° ingresso ':      {type:'date'}, // variante con spazio finale presente nei dati reali
  'Fine 24 mesi':                   {type:'date'},
  'Data fine rapporto':             {type:'date'},
  'Data Proroga 1':                 {type:'date'},
  'Data Proroga 2':                 {type:'date'},
  'Data Proroga 3':                 {type:'date'},
  'Data Proroga 4':                 {type:'date'},
  'Data licenziamento':             {type:'date'},
  'Scadenza Contratto':             {type:'date'},
  // NOTE
  'Note':                           {type:'textarea'},
  'Note permesso':                  {type:'textarea'},
  'Note prescrizione':              {type:'textarea'},
  'Note Analisi':                   {type:'textarea'},
};


// ─── ALLEGATI ─────────────────────────────────────────────────────────────────
// Slot definitions per tabella: {label, slot, single}
// single=true → sovrascrive (attestato idoneità)
// single=false → multipli

const ALLEGATI_SLOTS = {
  dipendenti: [
    { label: '📎 Allegati Documenti Permesso', slot: 'permesso', single: false },
  ],
  contratti: [
    { label: '📋 UNILAV Assunzione',    slot: 'unilav_ass',   single: false },
    { label: '📋 UNILAV Proroghe',      slot: 'unilav_pro',   single: false },
    { label: '📋 UNILAV Trasformazioni',slot: 'unilav_tra',   single: false },
    { label: '📋 UNILAV Cessazioni',    slot: 'unilav_ces',   single: false },
  ],
  formazione: [
    { label: '📎 Allegati Formazione',            slot: 'formazione',    single: false },
    { label: '📎 Allegato Aggiornamento Formazione', slot: 'agg_formazione', single: false },
  ],
  sorveglianza: [
    { label: '📄 Attestato Idoneità', slot: 'idoneita_single', single: true },
  ],
};

// Sezioni form in cui inserire i bottoni allegati
const ALLEGATI_AFTER = {
  dipendenti:   '🌍 Permesso di Soggiorno',
  contratti:    '⚙ Altro',
  formazione:   '🎓 Corso',
  sorveglianza: '🏥 Visita Medica',
};

// Mappa: colonna Excel (nome esatto come da export QuintaDB) → slot allegati corrispondente.
// Usata durante l'import per scaricare automaticamente i PDF dai vecchi link QuintaDB
// e associarli come allegati al record appena importato.
const PDF_LINK_COLUMNS = {
  dipendenti: {
    'Allegati documenti permesso': 'permesso',
  },
  contratti: {
    'UNILAV ASSUNZIONE':       'unilav_ass',
    'UNILAV PROROGHE':         'unilav_pro',
    'UNILAV TRASFORMAZIONI':   'unilav_tra',
    'UNILAV CESSAZIONE':       'unilav_ces',
  },
  formazione: {
    'Allegati formazione (Attestati)':       'formazione',
    'Allegati aggiornamento formazione':     'agg_formazione',
  },
  sorveglianza: {
    'Attestato Idoneità':  'idoneita_single',
    'Attestato Idoneità ': 'idoneita_single', // variante con spazio finale vista nei file reali
  },
};

// Il file "Scheda Anagrafica Dipendenti" esportato da QuintaDB contiene anche 3 blocchi
// di colonne ANNIDATE senza intestazione propria (Riepilogo Dati contrattuali, Riepilogo
// Formazione, Riepilogo Sorveglianza Sanitaria), ognuno con un riepilogo dell'ultimo record
// collegato di quella tabella. NOTA IMPORTANTE: QuintaDB lascia spesso, in queste colonne,
// il NOME del campo come testo placeholder invece del valore reale (es. la cella contiene
// letteralmente "Tipologia contrattuale" invece di "Tempo determinato"). Quando però il dato
// è stato effettivamente compilato, il valore reale sostituisce quel placeholder. Per questo,
// durante l'estrazione, ogni valore che coincide esattamente con l'etichetta della propria
// colonna viene scartato come "non compilato", e solo i valori realmente diversi vengono usati
// per creare/aggiornare i record in Contratti, Formazione e Sorveglianza.
const NESTED_BLOCKS = {
  contratti: {
    startColumn: 'Riepilogo Dati contrattuali',
    endColumn:   'Rilasciato da Questura',
    // offset relativo (0-based) → {campo: nome colonna reale in Contratti, label: etichetta placeholder attesa}
    fields: {
      0:  { field:'Id Dipendente (N° Socio)', label:'Numero Socio' },
      5:  { field:'Data Assunzione',          label:'Data Assunzione' },
      7:  { field:'Livello',                  label:'Livello' },
      8:  { field:'Tipologia contrattuale',   label:'Tipologia contrattuale' },
      9:  { field:'Tipologia orario contrattuale', label:'Tipologia orario contrattuale' },
      10: { field:'Ore contrattuali settimanali',  label:'Ore contrattuali settimanali' },
      11: { field:'Scadenza Contratto',       label:'Scadenza Contratto' },
      13: { field:'Requisiti Incentivi',      label:'Requisiti Incentivi' },
      14: { field:'Data Proroga 1',           label:'Data Proroga 1' },
      15: { field:'Data Proroga 2',           label:'Data Proroga 2' },
      16: { field:'Data Proroga 3',           label:'Data Proroga 3' },
      17: { field:'Data Proroga 4',           label:'Data Proroga 4' },
      19: { field:'Note',                     label:'Note' },
      22: { field:'Data fine rapporto',       label:'Data fine rapporto' },
      23: { field:'Causa fine rapporto',      label:'Causa fine rapporto' },
    },
    attachmentOffsets: { 12:'unilav_ass', 20:'unilav_pro', 21:'unilav_tra', 24:'unilav_ces' },
  },
  formazione: {
    startColumn: 'Riepilogo Formazione',
    endColumn:   'Riepilogo Sorveglianza Sanitaria',
    fields: {
      0: { field:'Id Dipendente (N° Socio)', label:'Id Dipendente (N° Socio)' },
      5: { field:'Tipologia Corso',          label:'Tipologia Corso' },
      6: { field:'Data Corso',               label:'Data Corso' },
      7: { field:'Scadenza Corso',           label:'Scadenza Corso' },
      10:{ field:'Note',                     label:'Note' },
    },
    attachmentOffsets: { 8:'formazione', 9:'agg_formazione' },
  },
  sorveglianza: {
    startColumn: 'Riepilogo Sorveglianza Sanitaria',
    endColumn:   null, // ultimo blocco: si estende fino alla fine della riga
    fields: {
      0: { field:'Id Dipendente (N° Socio)', label:'Id Dipendente (N° Socio)' },
      5: { field:'Data visita medica',       label:'Data visita medica' },
      6: { field:'Scadenza Idoneità',        label:'Scadenza Idoneità' },
      7: { field:'Stato idoneità',           label:'Stato idoneità' },
    },
    attachmentOffsets: {}, // l'Attestato Idoneità viene gestito separatamente (colonna dedicata)
  },
};

const Allegati = {
  // URL base API NAS - stessa della store
  base(){ return typeof NAS_API !== 'undefined' ? NAS_API.replace('/api','') : ''; },

  // Estrae tutti gli URL PDF da un valore di cella (possono essere multipli, separati da virgola).
  // IMPORTANTE: alcuni export QuintaDB contengono spazi NON codificati nei nomi file
  // (es. "Attestato Agg. Formazione.pdf" invece di "Attestato%20Agg..."), quindi non si può
  // usare una regex che si interrompe sugli spazi: dividiamo invece sul pattern
  // ", http" (virgola seguita, dopo eventuali spazi, dall'inizio di un nuovo URL).
  _extractPdfUrls(cellValue){
    const s = String(cellValue||'').trim();
    if(!s) return [];
    return s.split(/,\s*(?=https?:\/\/)/i)
      .map(p=>p.trim())
      .filter(p=>/^https?:\/\//i.test(p) && /\.pdf/i.test(p));
  },

  // Ritorna l'insieme dei nomi originali (originalName) già presenti come allegati per
  // questo record/slot, usato per evitare di riscaricare lo stesso PDF più volte
  // (es. import eseguito più volte, o stesso dato recuperato da più fonti diverse).
  // Applica la STESSA sanitizzazione usata dal server (vedi server.js, route
  // /files/import-from-url) prima di confrontare i nomi: senza questo, il confronto tra il
  // nome "grezzo" dell'URL e il nome realmente salvato su disco (sanificato) non corrisponde
  // mai, e il controllo duplicati risulta sempre negativo.
  _sanitizeFilename(name){
    return String(name||'').replace(/[^a-zA-Z0-9._\- ]/g, '_');
  },

  async _getExistingAttachmentNames(recordId, slot){
    const names = new Set();
    try{
      const r = await fetch(`${this.base()}/files/${recordId}/${slot}`);
      if(r.ok){
        const files = await r.json();
        files.forEach(f => names.add(f.originalName));
      }
    }catch(e){ /* in caso di errore, procede comunque con il download */ }
    return names;
  },

  // Durante l'import Excel: per ogni colonna nota con link PDF (vedi PDF_LINK_COLUMNS),
  // scarica i file dal vecchio sistema (QuintaDB) e li allega al record appena creato sul NAS.
  // Ritorna {ok, fail} con i conteggi.
  async importFromRow(table, rawRow, recordId){
    const base = this.base();
    if(!base) return {ok:0, fail:0, skipped:true}; // richiede NAS configurato

    const colMap = PDF_LINK_COLUMNS[table];
    if(!colMap) return {ok:0, fail:0};

    let ok=0, fail=0, skippedDup=0;
    for(const [colName, slot] of Object.entries(colMap)){
      const cellValue = rawRow[colName];
      if(cellValue===undefined || cellValue===null || !String(cellValue).trim()) continue;
      const urls = this._extractPdfUrls(cellValue);
      if(!urls.length) continue;

      // Controlla quali allegati esistono già per questo record/slot, per evitare di
      // scaricare di nuovo lo stesso PDF se l'import viene eseguito più volte (es. import
      // di Dipendenti che recupera dati nascosti, seguito dall'import del file dedicato
      // della stessa tabella, oppure un Excel importato due volte per errore).
      let existingNames = await this._getExistingAttachmentNames(recordId, slot);

      for(const url of urls){
        const originalName = decodeURIComponent(url.split('/').pop()||'allegato.pdf');
        const sanitizedName = this._sanitizeFilename(originalName);
        if(existingNames.has(sanitizedName)){
          skippedDup++;
          continue; // già presente: non lo riscarica
        }
        try{
          const r = await fetch(`${base}/files/import-from-url/${recordId}/${slot}`, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({url, originalName})
          });
          if(r.ok){
            ok++;
            existingNames.add(sanitizedName); // evita doppio download nello stesso giro, se l'url si ripete
          } else {
            fail++;
            const errBody = await r.text().catch(()=>'');
            console.warn(`Allegati.importFromRow: FALLITO [${colName} / ${slot}] HTTP ${r.status} — ${originalName} — ${url}`, errBody);
          }
        }catch(e){
          fail++;
          console.warn(`Allegati.importFromRow: ERRORE RETE [${colName} / ${slot}] — ${url}`, e.message);
        }
      }
    }
    return {ok, fail, skippedDup};
  },

  // Apri modale allegati per un record
  async openModal(table, recordId, slotDef){
    const { label, slot, single } = slotDef;

    // Usa un overlay DEDICATO e separato da quello del form (vedi index.html,
    // #allegati-modal-overlay), così il form di Aggiungi/Modifica sottostante resta
    // semplicemente nascosto ma vivo nel DOM — nessun dato inserito dall'utente viene perso,
    // perché non tocchiamo mai #modal-body/#modal-title/#modal-footer del form.
    document.getElementById('allegati-modal-title').textContent = label;

    const base = this.base();
    let files = [];
    if(base){
      try{
        const r = await fetch(`${base}/files/${recordId}/${slot}`);
        files = await r.json();
      }catch(e){ console.warn('NAS non raggiungibile'); }
    } else {
      // Modalità locale: leggi da localStorage
      const key = `allegati_${recordId}_${slot}`;
      files = JSON.parse(localStorage.getItem(key)||'[]');
    }

    const list = this._renderList(files, recordId, slot, base, single);

    document.getElementById('allegati-modal-body').innerHTML = `
      <div style="margin-bottom:16px">
        ${single ? '<p style="font-size:13px;color:var(--text3);margin-bottom:12px">⚠ Caricando un nuovo file, quello precedente viene sostituito.</p>' : ''}
        <label class="btn btn-primary" style="cursor:pointer;display:inline-flex;align-items:center;gap:8px">
          ➕ ${single ? 'Carica PDF (sostituisce)' : 'Aggiungi PDF'}
          <input type="file" accept=".pdf" style="display:none" id="file-input-${slot}" onchange="Allegati.upload('${table}','${recordId}','${slot}',${single},this)"/>
        </label>
      </div>
      <div id="allegati-list-${slot}">${list}</div>`;

    document.getElementById('allegati-modal-footer').innerHTML =
      `<button class="btn btn-primary" onclick="Allegati.closeAndRestoreForm()">← Torna al modulo</button>`;
    document.getElementById('allegati-modal-overlay').classList.add('open');
  },

  // Chiude la vista allegati. Il form sottostante non è mai stato toccato, quindi
  // ricompare automaticamente con tutti i dati che l'utente aveva già inserito.
  closeAndRestoreForm(e){
    if(e && e.target !== document.getElementById('allegati-modal-overlay')) return;
    document.getElementById('allegati-modal-overlay').classList.remove('open');
  },

  _renderList(files, recordId, slot, base, single){
    if(!files.length) return '<p style="color:var(--text3);font-size:13px;padding:8px 0">Nessun allegato presente.</p>';
    return files.map(f => `
      <div class="allegato-item">
        <span class="allegato-icon">📄</span>
        <span class="allegato-name" title="${esc(f.originalName)}">${esc(f.originalName)}</span>
        <span class="allegato-size">${this._size(f.size)}</span>
        <div class="allegato-actions">
          <button class="btn btn-ghost" style="font-size:12px;padding:5px 10px"
            onclick="Allegati.preview('${f.filename}','${esc(f.originalName)}')" title="Visualizza">👁 Anteprima</button>
          <button class="btn btn-ghost" style="font-size:12px;padding:5px 10px"
            onclick="Allegati.download('${f.filename}','${esc(f.originalName)}')">⬇ Scarica</button>
          <button class="btn btn-danger" style="font-size:12px;padding:5px 10px"
            onclick="Allegati.delete('${f.filename}','${recordId}','${slot}',${single},this)">✕</button>
        </div>
      </div>`).join('');
  },

  _size(bytes){
    if(!bytes) return '';
    if(bytes < 1024) return bytes+'B';
    if(bytes < 1024*1024) return Math.round(bytes/1024)+'KB';
    return (bytes/1024/1024).toFixed(1)+'MB';
  },

  async upload(table, recordId, slot, single, input){
    const file = input.files[0];
    if(!file){ console.warn('Allegati.upload: nessun file selezionato'); return; }

    // Controllo PDF più permissivo: alcuni browser/dispositivi non riportano
    // correttamente il MIME type, quindi controlliamo anche l'estensione
    const isPdfMime = file.type === 'application/pdf';
    const isPdfExt  = file.name.toLowerCase().endsWith('.pdf');
    if(!isPdfMime && !isPdfExt){
      toast('Solo file PDF (file selezionato: '+(file.type||'tipo sconosciuto')+')','error');
      console.warn('Allegati.upload: file non PDF', {name:file.name, type:file.type});
      return;
    }

    const base = this.base();
    console.log('Allegati.upload: inizio upload', {table, recordId, slot, base: base||'(locale)', fileName:file.name, fileSize:file.size});

    if(base){
      // Carica sul NAS
      const fd = new FormData();
      fd.append('file', file);
      try{
        const r = await fetch(`${base}/files/${recordId}/${slot}`, { method:'POST', body:fd });
        console.log('Allegati.upload: risposta server', r.status);
        if(!r.ok){
          const errText = await r.text().catch(()=>'');
          throw new Error('HTTP '+r.status+(errText?': '+errText:''));
        }
        toast('Allegato caricato ✓');
      }catch(e){
        console.error('Allegati.upload: ERRORE', e);
        toast('Errore upload: '+e.message,'error');
        return;
      }
    } else {
      // Modalità locale: salva come base64 in localStorage
      const reader = new FileReader();
      reader.onload = e => {
        const key = `allegati_${recordId}_${slot}`;
        let files = JSON.parse(localStorage.getItem(key)||'[]');
        if(single) files = [];
        files.unshift({ filename: Date.now()+'__'+file.name, originalName: file.name, size: file.size, data: e.target.result, date: new Date() });
        localStorage.setItem(key, JSON.stringify(files));
        toast('Allegato salvato localmente ✓');
        this.openModal(table, recordId, {label:document.getElementById('modal-title').textContent, slot, single});
      };
      reader.readAsDataURL(file);
      return;
    }
    // Ricarica lista
    this.openModal(table, recordId, {label:document.getElementById('modal-title').textContent, slot, single});
  },

  // Apre il PDF in una nuova tab per la visualizzazione diretta (senza scaricarlo).
  async preview(filename, origName){
    const base = this.base();
    if(base){
      const url = `${base}/files/preview/${encodeURIComponent(filename)}`;
      window.open(url, '_blank');
    } else {
      // Modalità locale: i PDF sono salvati come base64 in localStorage. I data URL
      // con tipo application/pdf vengono mostrati inline dal browser quando aperti
      // direttamente in una nuova tab (senza attributo download).
      const allKeys = Object.keys(localStorage).filter(k=>k.startsWith('allegati_'));
      for(const k of allKeys){
        const files = JSON.parse(localStorage.getItem(k)||'[]');
        const f = files.find(x=>x.filename===filename);
        if(f&&f.data){
          window.open(f.data, '_blank');
          return;
        }
      }
      toast('File non trovato','error');
    }
  },

  async download(filename, origName){
    const base = this.base();
    if(base){
      const url = `${base}/files/download/${encodeURIComponent(filename)}`;
      const a = document.createElement('a');
      a.href = url; a.download = origName; a.target = '_blank';
      a.click();
    } else {
      // Modalità locale: cerca in localStorage
      const allKeys = Object.keys(localStorage).filter(k=>k.startsWith('allegati_'));
      for(const k of allKeys){
        const files = JSON.parse(localStorage.getItem(k)||'[]');
        const f = files.find(x=>x.filename===filename);
        if(f&&f.data){
          const a = document.createElement('a');
          a.href = f.data; a.download = origName; a.click();
          return;
        }
      }
      toast('File non trovato','error');
    }
  },

  // Rinomina allegati da tempId a realId dopo il salvataggio
  async renameTempFiles(tempId, realId){
    const base = this.base();
    if(base){
      // Chiama API per rinominare i file sul NAS
      try{
        await fetch(`${base}/files/rename`, {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ oldId: tempId, newId: realId })
        });
      }catch(e){ console.warn('Rename files failed:', e.message); }
    } else {
      // Modalità locale: rinomina le chiavi in localStorage
      const keys = Object.keys(localStorage).filter(k => k.startsWith('allegati_'+tempId+'_'));
      keys.forEach(k => {
        const newKey = k.replace('allegati_'+tempId+'_', 'allegati_'+realId+'_');
        localStorage.setItem(newKey, localStorage.getItem(k));
        localStorage.removeItem(k);
      });
    }
  },

  async delete(filename, recordId, slot, single, btn){
    if(!confirm('Eliminare questo allegato?')) return;
    const base = this.base();
    if(base){
      try{
        await fetch(`${base}/files/download/${encodeURIComponent(filename)}`, { method:'DELETE' });
        toast('Allegato eliminato','error');
      }catch(e){ toast('Errore eliminazione','error'); return; }
    } else {
      const key = `allegati_${recordId}_${slot}`;
      let files = JSON.parse(localStorage.getItem(key)||'[]');
      files = files.filter(f=>f.filename!==filename);
      localStorage.setItem(key, JSON.stringify(files));
      toast('Allegato eliminato','error');
    }
    this.openModal(btn.closest('.modal').querySelector('h3')?.textContent||'Allegati',
      recordId, {label:'', slot, single});
  },
};

// ─── SEZIONI FORM PER TABELLA ─────────────────────────────────────────────────
const SECTIONS = {
  dipendenti: [
    {t:'👤 Dati Anagrafici',       c:['Cognome','Nome','Data di Nascita','Luogo di Nascita','Sesso','Cittadinanza','Codice Fiscale']},
    {t:'🏠 Residenza',             c:['Indirizzo Residenza','Comune Residenza','CAP','Provincia Residenza']},
    {t:'📦 Domicilio',             c:['Domicilio diverso Residenza','Indirizzo Domicilio','Comune Domicilio','CAP domicilio','Provincia Domicilio']},
    {t:'📞 Contatti',              c:['Telefono Cellulare','Altro Recapito','Email']},
    {t:'🪪 Documento',             c:['Tipo Documento','N° Documento','Data Rilascio Documento','Scadenza Documento']},
    {t:'🏢 Dati Associativi',      c:['Azienda','N° Socio','Stato Socio','Data Delibera Ammissione','Data Delibera Recesso / Esclusione','Appalto / sede di lavoro']},
    {t:'🌍 Permesso di Soggiorno', c:['Tipo permesso','Rilasciato da Questura','Data rilascio Permesso Soggiorno','Data scadenza Permesso Soggiorno','Note permesso']},
    {t:'📝 Note',                  c:['Note']},
  ],
  contratti: [
    {t:'👤 Dipendente',   c:['Cognome e Nome','Azienda','Stato Dipendente','Mansione','Data assunzione']},
    {t:'📄 Contratto',    c:['Tipologia contrattuale','Tipologia orario contrattuale','Livello','Ore contrattuali settimanali','CCNL','Data inizio','Data fine','Scadenza Contratto','Causa fine rapporto','Data licenziamento']},
    {t:'📋 Proroghe',     c:['Data Proroga 1','Data Proroga 2','Data Proroga 3','Data Proroga 4']},
    {t:'⚙ Altro',         c:['Requisiti Incentivi','Assistenza Sanitaria integrativa','Appalto / sede di lavoro','Note']},
  ],
  formazione: [
    {t:'👤 Dipendente',   c:['Cognome e Nome','Azienda','Stato Dipendente','Mansione','Data assunzione','Appalto / sede di lavoro']},
    {t:'🎓 Corso',        c:['Tipologia Corso','Data Corso','Scadenza Corso','Stato Corso','Ore','Docente','Note']},
  ],
  sorveglianza: [
    {t:'👤 Dipendente',   c:['Cognome e Nome','Azienda','Stato dipendente','Mansione','Appalto / sede di lavoro','Data assunzione']},
    {t:'🏥 Visita Medica', c:['Data visita medica','Scadenza Idoneità','Stato idoneità','Note prescrizione','Medico']},
    {t:'🧪 Analisi',      c:['Analisi','Data Analisi','Laboratorio Analisi','Note Analisi']},
  ],
  aziende: [
    {t:'🏢 Anagrafica',   c:['ID Ditta','Denominazione Ditta','Indirizzo','Partita IVA','Codice Univoco','PEC','Email','Codice ATECO','PAT','Posizione INPS','Codice Ditta INAIL','Cod. Fiscale Legale Rappresentante']},
  ],
};

// colonne mostrate in tabella
const TABLE_META = {
  dipendenti:   {label:'Dipendenti',             cols:['N° Socio','Azienda','Cognome','Nome','Mansione','Stato Dipendente','Codice Fiscale'],   status:null},
  contratti:    {label:'Contratti di Lavoro',    cols:['Id Dipendente (N° Socio)','Azienda','Cognome','Nome','Tipologia contrattuale','Data Proroga 1','Data Proroga 2','Data Proroga 3','Data Proroga 4','Scadenza Contratto','Stato Dipendente'], status:null},
  formazione:   {label:'Formazione',             cols:['Id Dipendente (N° Socio)','Azienda','Cognome','Nome','Tipologia Corso','Data Corso','Scadenza Corso','Stato Corso','Stato Dipendente'], status:'Stato Corso'},
  sorveglianza: {label:'Sorveglianza Sanitaria', cols:['Id Dipendente (N° Socio)','Azienda','Cognome','Nome','Data visita medica','Scadenza Idoneità','Stato idoneità','Stato dipendente'], status:'Stato idoneità'},
  aziende:      {label:'Anagrafica Aziende',     cols:['Denominazione Ditta','Partita IVA','PEC','Email','Codice ATECO'], status:null},
};

// ─── LAYOUT PERSONALIZZATO (solo admin) ────────────────────────────────────────
// Permette di riordinare i campi e spostarli tra sezioni, per ciascuna tabella.
// La configurazione personalizzata viene salvata in localStorage (e sincronizzata
// sul NAS se configurato) e sovrascrive a runtime la struttura di default SECTIONS.
const CustomLayout = {
  _cache: {},
  base(){ return typeof NAS_API !== 'undefined' ? NAS_API.replace('/api','') : ''; },

  async load(t){
    if(this._cache[t]) return this._cache[t];
    const base = this.base();
    if(base){
      try{
        const r = await fetch(`${base}/api/layout_${t}`);
        if(r.ok){
          const data = await r.json();
          if(data && Array.isArray(data.sections) && data.sections.length){
            this._cache[t] = data.sections;
            localStorage.setItem('layout_'+t, JSON.stringify(data.sections));
            return data.sections;
          }
        }
      }catch(e){ console.warn('CustomLayout.load: NAS non raggiungibile, uso locale', e.message); }
    }
    const local = localStorage.getItem('layout_'+t);
    if(local){
      try{ this._cache[t] = JSON.parse(local); return this._cache[t]; }catch{}
    }
    return null; // nessuna personalizzazione: usa il default SECTIONS[t]
  },

  async save(t, sections){
    this._cache[t] = sections;
    localStorage.setItem('layout_'+t, JSON.stringify(sections));
    const base = this.base();
    if(base){
      try{
        await fetch(`${base}/api/layout_${t}`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({sections})
        });
      }catch(e){ console.warn('CustomLayout.save: sync NAS fallita', e.message); }
    }
  },

  async reset(t){
    this._cache[t] = null;
    localStorage.removeItem('layout_'+t);
    const base = this.base();
    if(base){
      try{
        await fetch(`${base}/api/layout_${t}`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({sections:[]})
        });
      }catch(e){ console.warn('CustomLayout.reset: sync NAS fallita', e.message); }
    }
  },

  // Ritorna la struttura sezioni da usare per la tabella t: quella personalizzata se
  // presente in cache, altrimenti il default SECTIONS[t]. Da chiamare DOPO load(t) almeno
  // una volta (es. al boot dell'app), altrimenti ritorna sempre il default alla prima vista.
  get(t){
    return this._cache[t] && this._cache[t].length ? this._cache[t] : (SECTIONS[t]||null);
  },
};

// ─── ETICHETTE PERSONALIZZATE PER LE RICERCHE RAPIDE (solo admin) ──────────────
// Permette di rinominare il titolo mostrato sulle card delle ricerche rapide,
// senza modificare l'id interno o la logica del filtro. Persistita allo stesso modo
// del layout: localStorage + sincronizzazione NAS se configurato.
const CustomLabels = {
  _cache: {},
  base(){ return typeof NAS_API !== 'undefined' ? NAS_API.replace('/api','') : ''; },

  async load(t){
    if(this._cache[t]) return this._cache[t];
    const base = this.base();
    if(base){
      try{
        const r = await fetch(`${base}/api/qslabels_${t}`);
        if(r.ok){
          const data = await r.json();
          if(data && data.labels && typeof data.labels==='object'){
            this._cache[t] = data.labels;
            localStorage.setItem('qslabels_'+t, JSON.stringify(data.labels));
            return data.labels;
          }
        }
      }catch(e){ console.warn('CustomLabels.load: NAS non raggiungibile, uso locale', e.message); }
    }
    const local = localStorage.getItem('qslabels_'+t);
    if(local){
      try{ this._cache[t] = JSON.parse(local); return this._cache[t]; }catch{}
    }
    this._cache[t] = {};
    return {};
  },

  async save(t, labels){
    this._cache[t] = labels;
    localStorage.setItem('qslabels_'+t, JSON.stringify(labels));
    const base = this.base();
    if(base){
      try{
        await fetch(`${base}/api/qslabels_${t}`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({labels})
        });
      }catch(e){ console.warn('CustomLabels.save: sync NAS fallita', e.message); }
    }
  },

  // Etichetta da mostrare per la ricerca con id `searchId` nella tabella t: quella
  // personalizzata se presente, altrimenti l'etichetta di default passata come fallback.
  get(t, searchId, defaultLabel){
    return (this._cache[t] && this._cache[t][searchId]) || defaultLabel;
  },

  async rename(t, searchId, newLabel){
    const labels = this._cache[t] || {};
    if(newLabel && newLabel.trim()) labels[searchId] = newLabel.trim();
    else delete labels[searchId]; // stringa vuota = ripristina il nome originale
    await this.save(t, labels);
  },
};

// ─── RICERCHE RAPIDE PERSONALIZZATE (solo admin) ───────────────────────────────
// Permette di aggiungere nuove ricerche rapide, ed eliminare (nascondere) quelle
// esistenti, senza dover modificare il codice. Salvate per tabella:
// { added: [ {id, icon, label, desc, criteria} , ... ], removed: [id, id, ...] }
const CustomQuickSearches = {
  _cache: {},
  base(){ return typeof NAS_API !== 'undefined' ? NAS_API.replace('/api','') : ''; },

  async load(t){
    if(this._cache[t]) return this._cache[t];
    const base = this.base();
    if(base){
      try{
        const r = await fetch(`${base}/api/qscustom_${t}`);
        if(r.ok){
          const data = await r.json();
          if(data && (Array.isArray(data.added) || Array.isArray(data.removed))){
            const val = { added: data.added||[], removed: data.removed||[] };
            this._cache[t] = val;
            localStorage.setItem('qscustom_'+t, JSON.stringify(val));
            return val;
          }
        }
      }catch(e){ console.warn('CustomQuickSearches.load: NAS non raggiungibile, uso locale', e.message); }
    }
    const local = localStorage.getItem('qscustom_'+t);
    if(local){
      try{ this._cache[t] = JSON.parse(local); return this._cache[t]; }catch{}
    }
    this._cache[t] = { added: [], removed: [] };
    return this._cache[t];
  },

  async save(t, val){
    this._cache[t] = val;
    localStorage.setItem('qscustom_'+t, JSON.stringify(val));
    const base = this.base();
    if(base){
      try{
        await fetch(`${base}/api/qscustom_${t}`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify(val)
        });
      }catch(e){ console.warn('CustomQuickSearches.save: sync NAS fallita', e.message); }
    }
  },

  get(t){
    return this._cache[t] || { added: [], removed: [] };
  },

  async addSearch(t, searchDef){
    const val = this.get(t);
    val.added.push(searchDef);
    await this.save(t, val);
  },

  async updateSearch(t, searchId, searchDef){
    const val = this.get(t);
    const idx = val.added.findIndex(s=>s.id===searchId);
    if(idx>=0) val.added[idx] = searchDef;
    await this.save(t, val);
  },

  async removeSearch(t, searchId, isCustom){
    const val = this.get(t);
    if(isCustom){
      // Ricerca personalizzata creata dall'admin: ogni variante (azienda/tutte) è generata
      // dinamicamente da un'unica definizione "base" salvata in "added" — non possiamo
      // eliminare solo una variante dall'array (non esiste come oggetto separato), quindi
      // la nascondiamo comunque tramite "removed", usando il suo id specifico di variante.
      if(!val.removed.includes(searchId)) val.removed.push(searchId);
    } else {
      // Ricerca predefinita nel codice: nasconde SOLO la variante specifica cliccata
      // (es. "form_scadenza_mese_aliante"), lasciando intatte le altre aziende e "Tutte".
      if(!val.removed.includes(searchId)) val.removed.push(searchId);
    }
    await this.save(t, val);
  },

  async restoreSearch(t, searchId){
    const val = this.get(t);
    val.removed = val.removed.filter(id=>id!==searchId);
    await this.save(t, val);
  },

  // Ritorna l'elenco completo e finale delle ricerche per la tabella t: quelle
  // predefinite nel codice (escluse quelle rimosse dall'admin) + quelle personalizzate
  // aggiunte dall'admin, ciascuna espansa con le varianti per-azienda come le altre.
  // Il filtro lavora a livello di SINGOLA VARIANTE (s.id), non di gruppo: rimuovere
  // "form_scadenza_mese_aliante" nasconde solo quella, non le altre aziende o "Tutte".
  getFullList(t, defaultSearches){
    const val = this.get(t);
    const baseFiltered = defaultSearches.filter(s => !val.removed.includes(s.id));
    const customExpanded = val.added.flatMap(b => [
      { ...b, id:b.id+'_tutte', label:b.label+' — Tutte le Aziende', desc:(b.desc||'')+' (tutte le aziende)', _isCustomBase:true, _customBaseId:b.id },
      ...perCompanyVariants(b).map(v=>({...v, _isCustomBase:true, _customBaseId:b.id})),
    ]).filter(s => !val.removed.includes(s.id));
    return [...baseFiltered, ...customExpanded];
  },
};


const SKIP = new Set(['_id','Riepilogo Dipendente','Riepilogo Dati contrattuali','Riepilogo Formazione',
  'Riepilogo Sorveglianza Sanitaria','Allegati documenti permesso','Allegati formazione (Attestati)',
  'Allegati aggiornamento formazione','Attestato Idoneità ','UNILAV ASSUNZIONE','UNILAV PROROGHE',
  'UNILAV TRASFORMAZIONI','UNILAV CESSAZIONE','Anagrafica Dipendente','Dati Associativi',
  'Sezione stranieri','Dettagli permesso di soggiorno']);

function dispCols(t){
  const m=TABLE_META[t], all=Store.getCols(t);
  const p=m.cols.filter(c=>all.includes(c));
  return p.length?p:all.filter(c=>!SKIP.has(c)).slice(0,7);
}

function pill(val){
  if(!val)return '';
  const v=val.toLowerCase().trim();
  if(v==='completato'||v==='attivo'||(v==='idoneo')) return '<span class="pill pill-green">'+esc(val)+'</span>';
  if(v==='da completare'||v==='non in forza'||v==='non attivo') return '<span class="pill pill-gray">'+esc(val)+'</span>';
  if(v.includes('non idon')||v.includes('inidon')) return '<span class="pill pill-red">'+esc(val)+'</span>';
  if(v.includes('prescrizioni')) return '<span class="pill pill-yellow">'+esc(val)+'</span>';
  if(v.includes('attesa')) return '<span class="pill pill-blue">'+esc(val)+'</span>';
  return '<span class="pill pill-gray">'+esc(val)+'</span>';
}

// ─── COSTRUZIONE CAMPO FORM ────────────────────────────────────────────────────
function fid(col){ return 'ff_'+col.replace(/[^a-zA-Z0-9]/g,'_'); }


function buildSocioDatalist(){
  const dipRows=Store.getRows('dipendenti');
  let opts='';
  for(const r of dipRows){
    const socio=r['N° Socio']||'';
    const label=socio+(r.Cognome?' — '+r.Cognome+' '+r.Nome:'');
    if(socio) opts+=`<option value="${esc(socio)}">${esc(label)}</option>`;
  }
  return `<datalist id="socio-datalist">${opts}</datalist>`;
}

function buildField(col, val){
  val = String(val??'');
  const def = FIELDS[col];

  // Special: N° Socio trigger field for autofill
  if(col==='Id Dipendente (N° Socio)'){
    const inputId=fid(col);
    return '<div style="display:flex;gap:8px;align-items:center">' +
      '<input type="text" id="'+inputId+'" value="'+esc(val)+'" placeholder="es. 2081.AL" autocomplete="off" list="socio-datalist" style="flex:1" oninput="clearTimeout(this._t);this._t=setTimeout(()=>autofillFromSocio(this.value),600)"/>'+
      '<button type="button" class="btn btn-ghost" style="padding:8px 12px;font-size:13px;white-space:nowrap" onclick="autofillFromSocio(document.getElementById('+JSON.stringify(inputId)+').value)">🔍 Carica</button>'+
      '</div>'+
      buildSocioDatalist();
  }

  if(!def || def.type==='text'){
    return '<input type="text" id="'+fid(col)+'" value="'+esc(val)+'" placeholder="'+esc(col)+'" autocomplete="off"/>';
  }
  if(def.type==='textarea'){
    return '<textarea id="'+fid(col)+'" rows="3">'+esc(val)+'</textarea>';
  }
  if(def.type==='date'){
    let dval=val;
    // normalize DD-MM-YYYY or DD/MM/YYYY → YYYY-MM-DD for input[type=date]
    if(/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(val)){
      const p=val.split(/[\/\-]/); dval=p[2]+'-'+p[1]+'-'+p[0];
    }
    return '<input type="date" id="'+fid(col)+'" value="'+esc(dval)+'"/>';
  }
  if(def.type==='select'){
    const opts=OPT[def.opts]||[];
    let html='<select id="'+fid(col)+'"><option value="">-- seleziona --</option>';
    for(const o of opts) html+='<option value="'+esc(o)+'"'+(o.trim()===val.trim()?' selected':'')+'>'+esc(o)+'</option>';
    html+='</select>';
    return html;
  }
  if(def.type==='radio'){
    const opts=OPT[def.opts]||[];
    const name=fid(col);
    let html='<div class="radio-group">';
    for(const o of opts){
      const chk=o.trim()===val.trim()||o===val;
      html+='<label><input type="radio" name="'+name+'" value="'+esc(o)+'"'+(chk?' checked':'')+'/> '+esc(o)+'</label>';
    }
    html+='</div>';
    return html;
  }
  return '<input type="text" id="'+fid(col)+'" value="'+esc(val)+'" autocomplete="off"/>';
}

function readField(col){
  const def=FIELDS[col];
  if(def?.type==='radio'){
    const el=document.querySelector('input[name="'+fid(col)+'"]:checked');
    return el?el.value:'';
  }
  if(def?.type==='date'){
    const el=document.getElementById(fid(col));
    if(!el||!el.value)return '';
    // convert back YYYY-MM-DD → DD-MM-YYYY
    const p=el.value.split('-');
    return p.length===3?p[2]+'-'+p[1]+'-'+p[0]:el.value;
  }
  const el=document.getElementById(fid(col));
  return el?el.value:'';
}


// ─── AUTOCOMPLETE N° SOCIO ────────────────────────────────────────────────────
// Mapping from N° Socio → dipendente row for quick lookup
function buildSocioMap(){
  const map={};
  for(const r of Store.getRows('dipendenti')){
    if(r['N° Socio']) map[r['N° Socio'].trim()]=r;
  }
  return map;
}

// Campi da copiare dal dipendente alle altre tabelle quando si inserisce il N° Socio
// campo nella tabella target → campo nella tabella dipendenti
const AUTOFILL_MAP = {
  'Cognome':                       'Cognome',
  'Nome':                          'Nome',
  'Azienda':                       'Azienda',
  'Stato Dipendente':              'Stato Dipendente',
  'Stato dipendente':              'Stato Dipendente',
  'Mansione':                      'Mansione',
  'Appalto / sede di lavoro':      'Appalto / sede di lavoro',
  'Data di nascita':               'Data di Nascita',
  'Data di Nascita':               'Data di Nascita',
  'Luogo di nascita':              'Luogo di Nascita',
  'Luogo di Nascita':              'Luogo di Nascita',
  'Codice Fiscale':                'Codice Fiscale',
  'Codice fiscale':                'Codice Fiscale',
  'Data assunzione':               'Data assunzione',
  'Data Assunzione':               'Data assunzione',
  'Sesso':                         'Sesso',
  'Cittadinanza':                  'Cittadinanza',
  'Telefono Cellulare':            'Telefono Cellulare',
  'Recapito telefonico':           'Telefono Cellulare',
  'Altro Recapito':                'Altro Recapito',
  'Email':                         'Email',
  'Indirizzo Residenza':           'Indirizzo Residenza',
  'Comune Residenza':              'Comune Residenza',
  'CAP':                           'CAP',
  'Provincia Residenza':           'Provincia Residenza',
  'Indirizzo Domicilio':           'Indirizzo Domicilio',
  'Comune Domicilio':              'Comune Domicilio',
  'CAP domicilio':                 'CAP domicilio',
  'Provincia Domicilio':           'Provincia Domicilio',
  'Tipo Documento':                'Tipo Documento',
  'Data Rilascio Documento':       'Data Rilascio Documento',
  'Scadenza Documento':            'Scadenza Documento',
  'Stato Socio':                   'Stato Socio',
  'Data Delibera Ammissione':      'Data Delibera Ammissione',
  'Data Delibera Recesso / Esclusione': 'Data Delibera Recesso / Esclusione',
  'Tipo permesso':                 'Tipo permesso',
  'Rilasciato da Questura':        'Rilasciato da Questura',
  'Data rilascio Permesso Soggiorno': 'Data rilascio Permesso Soggiorno',
  'Data scadenza Permesso Soggiorno': 'Data scadenza Permesso Soggiorno',
  'Note permesso':                 'Note permesso',
  'Matricola':                     'N° Socio',
  'Cognome e Nome':                '__SKIP__',
  'Data di nascita':               'Data di Nascita',
  'Luogo di nascita':              'Luogo di Nascita',
  'Codice fiscale':                'Codice Fiscale',
  'Recapito telefonico':           'Telefono Cellulare',
  'Data Assunzione':               'Data assunzione',
};

function autofillFromSocio(socioVal){
  const map=buildSocioMap();
  const dip=map[socioVal.trim()];
  if(!dip) return;
  // Also fill composite "Cognome e Nome" field if it exists
  const cnEl=document.getElementById('ff_Cognome_e_Nome');
  if(cnEl) cnEl.value=((dip['Cognome']||'')+' '+(dip['Nome']||'')).trim();
  // Fill each matching field in the current form
  for(const [targetCol, srcCol] of Object.entries(AUTOFILL_MAP)){
    const val=dip[srcCol]||'';
    if(!val) continue;
    const def=FIELDS[targetCol];
    if(def?.type==='date'){
      const el=document.getElementById(fid(targetCol));
      if(el){
        // convert DD-MM-YYYY → YYYY-MM-DD for date input
        let dval=val;
        if(/^\d{2}[\/-]\d{2}[\/-]\d{4}$/.test(val)){const p=val.split(/[\/\-]/);dval=p[2]+'-'+p[1]+'-'+p[0];}
        el.value=dval;
      }
    } else if(def?.type==='select'){
      const el=document.getElementById(fid(targetCol));
      if(el){
        // try to find matching option
        const opts=[...el.options];
        const match=opts.find(o=>o.value.trim()===val.trim()||o.text.trim()===val.trim());
        if(match) el.value=match.value;
      }
    } else {
      const el=document.getElementById(fid(targetCol));
      if(el) el.value=val;
    }
  }
  toast('Dati dipendente precompilati ✓');
}

// ─── STATO FORM CORRENTE (evita di passare JSON in onclick) ───────────────────
let _formState = {table:null, cols:[], idx:null};

// ─── APP ──────────────────────────────────────────────────────────────────────
const App = {
  view:null, table:null,
  page:1, pageSize:25, sortCol:null, sortDir:1, filter:'', filtered:[],

  login(){
    const u=document.getElementById('login-user').value.trim();
    const p=document.getElementById('login-pass').value;
    const user=Auth.login(u,p);
    const err=document.getElementById('login-error');
    if(user){
      err.style.display='none';
      document.getElementById('login-screen').style.display='none';
      this.initApp(user);
    } else {
      err.textContent='Credenziali non valide.';
      err.style.display='block';
    }
  },

  logout(){
    Auth.logout();
    document.getElementById('app').style.display='none';
    document.getElementById('login-screen').style.display='flex';
    document.getElementById('login-user').value='';
    document.getElementById('login-pass').value='';
  },

  initApp(user){
    document.getElementById('app').style.display='flex';
    document.getElementById('user-label').textContent=user.nome+' · '+user.role;
    ['dipendenti','contratti','formazione','sorveglianza','aziende'].forEach(t=>{
      const b=document.getElementById('badge-'+t); if(b) b.textContent=Store.getRows(t).length;
    });
    if(Auth.isAdmin()){
      document.getElementById('admin-section').style.display='';
      document.getElementById('nav-utenti').style.display='';
    }
    this.show('dashboard');
  },

  show(v){
    this.view=v; this.page=1; this.filter=''; this.sortCol=null;
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
    document.querySelector('[data-view="'+v+'"]')?.classList.add('active');
    document.getElementById('topbar-title').textContent=TABLE_META[v]?.label||(v==='dashboard'?'Dashboard':'Gestione Utenti');
    const sw=document.getElementById('search-wrap'), ba=document.getElementById('btn-add');
    document.getElementById('search-input').value='';
    if(v==='dashboard'){
      sw.style.display='none';
      ba.style.display='none'; // nascondo il singolo btn, uso due btn nel topbar
      this.renderDash();
    } else if(v==='utenti'){
      const db=document.getElementById('dash-btns'); if(db)db.remove();
      sw.style.display='none'; ba.style.display=Auth.isAdmin()?'':'none';
      ba.textContent='+ Aggiungi'; ba.className='btn btn-primary';
      ba.onclick=()=>this.openAddUser(); this.renderUsers();
    } else {
      const db=document.getElementById('dash-btns'); if(db)db.remove();
      this.table=v; sw.style.display=''; ba.style.display=Auth.can('add')?'':'none';
      ba.textContent='+ Aggiungi'; ba.className='btn btn-primary';
      ba.onclick=()=>this.openAdd(); this.renderTable(v);
    }
  },

  search(val){ this.filter=val.toLowerCase().trim(); this.page=1; this.renderTable(this.table); },

  // ── DASHBOARD ──────────────────────────────────────────────────────────────
  renderDash(){
    const D=Store.getRows('dipendenti'), C=Store.getRows('contratti'),
          F=Store.getRows('formazione'), S=Store.getRows('sorveglianza'), A=Store.getRows('aziende');
    const azC={};C.forEach(r=>{const a=r.Azienda||'N/D';azC[a]=(azC[a]||0)+1;});
    const topAz=Object.entries(azC).sort((a,b)=>b[1]-a[1]).slice(0,8),mAz=topAz[0]?.[1]||1;
    const ftC={};F.forEach(r=>{const t=r['Tipologia Corso']||r['Tipo formazione']||'N/D';ftC[t]=(ftC[t]||0)+1;});
    const topF=Object.entries(ftC).sort((a,b)=>b[1]-a[1]).slice(0,8),mF=topF[0]?.[1]||1;
    const gC={};S.forEach(r=>{const g=r['Stato idoneità']||'N/D';gC[g]=(gC[g]||0)+1;});
    const oggi=new Date(),lim=new Date();lim.setDate(oggi.getDate()+90);
    let sc=0;S.forEach(r=>{const s=r['Scadenza Idoneità'];if(!s)return;const p=s.split(/[\/\-]/);if(p.length===3){const d=p[0].length===4?new Date(p[0]+'-'+p[1]+'-'+p[2]):new Date(p[2]+'-'+p[1]+'-'+p[0]);if(!isNaN(d)&&d>=oggi&&d<=lim)sc++;}});
    let pp=0;D.forEach(r=>{const tp=r['Tipo permesso'];if(tp&&tp.trim()&&tp!=='nan')pp++;});
    let ps=0;D.forEach(r=>{const s=r['Data scadenza Permesso Soggiorno'];if(!s)return;const p=s.split(/[\/\-]/);if(p.length===3){const d=p[0].length===4?new Date(p[0]+'-'+p[1]+'-'+p[2]):new Date(p[2]+'-'+p[1]+'-'+p[0]);if(!isNaN(d)&&d>=oggi&&d<=lim)ps++;}});

    const sc_=(cl,id,l,v,s,onclick)=>{
      const displayLabel = CustomLabels.get('dashboard', id, l);
      const renameBtn = Auth.isAdmin()
        ? `<button class="icon-btn" title="Rinomina" style="position:absolute;top:6px;right:6px;background:#fff"
            onclick="event.stopPropagation();App.renameDashCard('${id}','${esc(l).replace(/'/g,"\\'")}')">✏</button>`
        : '';
      const styleAttr = onclick ? 'position:relative;cursor:pointer' : 'position:relative';
      return `<div class="stat-card ${cl}" style="${styleAttr}"${onclick?' onclick="'+onclick+'"':''} title="${onclick?'Clicca per dettagli':''}">${renameBtn}<div class="stat-label">${esc(displayLabel)}</div><div class="stat-value">${v}</div><div class="stat-sub">${s}</div></div>`;
    };
    const bar_=(l,n,m,c,cb)=>`<div class="bar-item"${cb?' onclick="'+cb+'" style="cursor:pointer"':''} title="${cb?'Clicca per filtrare':''}"><span class="bar-label" title="${esc(l)}">${esc(l)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/m*100)}%;background:${c}"></div></div><span class="bar-count">${n}</span></div>`;
    const pan_=(t,b)=>`<div class="panel"><div class="panel-header">${t}</div><div class="panel-body">${b}</div></div>`;

    // Aggiungi bottoni Import/Export nel topbar per la dashboard
    const topbarEl = document.getElementById('topbar');
    if(!document.getElementById('dash-btns')){
      const btnWrap = document.createElement('div');
      btnWrap.id = 'dash-btns';
      btnWrap.style.cssText = 'display:flex;gap:8px;margin-left:auto';
      btnWrap.innerHTML =
        (Auth.can('stats')?'<button class="btn btn-ghost" style="font-size:13px" onclick="App.openStats()">📊 Statistiche per Anno</button>':'')+
        '<button class="btn btn-ghost" style="font-size:13px" onclick="App.exportGestionale()">↓ Esporta Gestionale</button>' +
        '<button class="btn btn-primary" style="font-size:13px" onclick="App.importGestionale()">📂 Importa Gestionale</button>' +
        (Auth.can('manage_users')?'<button class="btn btn-ghost" style="font-size:13px" onclick="App.cleanupEmptyAttachments()" title="Rimuove allegati PDF da 0 byte e i duplicati (mantenendo solo la copia più recente)">🧹 Pulisci Allegati</button>':'');
      topbarEl.appendChild(btnWrap);
    }

    document.getElementById('content').innerHTML=
      '<div class="stats-grid">'+
      sc_('blue','dip_count','Dipendenti',D.length,'in anagrafica',"App.show('dipendenti')")+
      sc_('cyan','cont_count','Contratti',C.length,'rapporti di lavoro',"App.show('contratti')")+
      sc_('green','form_count','Formazione',F.length,'corsi registrati',"App.show('formazione')")+
      sc_('warn','scad_sorv','Scadenze Sorveglianza',sc,'entro 90 giorni',"App.dashDetail('scadenze')")+
      sc_('red','sorv_count','Sorveglianza',S.length,'visite registrate',"App.show('sorveglianza')")+
      sc_('blue','az_count','Aziende',A.length,'in anagrafica',"App.show('aziende')")+
      sc_('red','scad_perm','Scadenze Permesso',ps,'entro 90 giorni',"App.dashDetail('permessi')")+
      sc_('cyan','perm_sogg','Permessi Soggiorno',pp,'dipendenti con permesso',"App.dashDetail('tutti_permessi')")+
      '</div><div class="dash-grid">'+
      pan_('📄 Contratti per Azienda',topAz.map(([a,n])=>`<div class="bar-item" data-table="contratti" data-col="Azienda" data-val="${esc(a)}" onclick="App.dashFilterEl(this)" style="cursor:pointer" title="Filtra contratti per azienda"><span class="bar-label" title="${esc(a)}">${esc(a)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/mAz*100)}%;background:var(--accent)"></div></div><span class="bar-count">${n}</span></div>`).join(''))+
      pan_('🎓 Formazione per Tipo',topF.map(([t,n])=>`<div class="bar-item" data-table="formazione" data-col="Tipologia Corso" data-val="${esc(t)}" onclick="App.dashFilterEl(this)" style="cursor:pointer" title="Filtra formazione per tipo"><span class="bar-label" title="${esc(t)}">${esc(t)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/mF*100)}%;background:var(--accent2)"></div></div><span class="bar-count">${n}</span></div>`).join(''))+
      pan_('🏥 Giudizi Sorveglianza',Object.entries(gC).sort((a,b)=>b[1]-a[1]).map(([g,n],gi)=>`<div class="bar-item" data-table="sorveglianza" data-col="Stato idoneità" data-val="${esc(g)}" onclick="App.dashFilterEl(this)" style="cursor:pointer" title="Clicca per filtrare"><span class="bar-label">${pill(g)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/S.length*100)}%;background:var(--success)"></div></div><span class="bar-count">${n}</span></div>`).join(''))+
      pan_('📊 Riepilogo','<table style="width:100%;font-size:14px">'+
        [
          ['👤 Dipendenti',           D.length, '',                     "App.show('dipendenti')"],
          ['📄 Contratti',            C.length, '',                     "App.show('contratti')"],
          ['🎓 Formazione',           F.length, '',                     "App.show('formazione')"],
          ['🏥 Sorveglianza',         S.length, '',                     "App.show('sorveglianza')"],
          ['⚠ Scad. Sorveglianza 90gg', sc,    'color:var(--warn)',    "App.dashDetail('scadenze')"],
          ['🌍 Permessi Soggiorno',   pp,       '',                     "App.dashDetail('tutti_permessi')"],
          ['⚠ Scad. Permessi 90gg',  ps,       'color:var(--danger)',  "App.dashDetail('permessi')"],
        ].map(([l,v,s,fn],i,a)=>
          `<tr onclick="${fn}" style="cursor:pointer" title="Clicca per dettagli">
            <td style="color:var(--text2);padding:8px 4px;${i<a.length-1?'border-bottom:1px solid var(--border)':''}">${l}</td>
            <td style="text-align:right;font-weight:700;padding:8px 4px;${s};${i<a.length-1?'border-bottom:1px solid var(--border)':''}">
              ${v} <span style="font-size:10px;color:var(--text4);font-weight:400">›</span>
            </td>
          </tr>`
        ).join('')+'</table>')+
      '</div>';
  },

  // ── TABELLA ────────────────────────────────────────────────────────────────
  renderTable(t){
    const all=Store.getRows(t), cols=dispCols(t), meta=TABLE_META[t], canEdit=Auth.canEdit();
    let rows=all;
    if(this.filter){
      // Supporta più termini separati da spazio (logica AND)
      // es. "rossi mario" trova righe che contengono ENTRAMBI "rossi" E "mario"
      const terms=this.filter.split(/\s+/).filter(t=>t.length>0);
      rows=all.filter(r=>{
        const allValues=Object.values(r).map(v=>String(v||'').toLowerCase()).join(' ');
        return terms.every(t=>allValues.includes(t));
      });
    }
    if(this.sortCol){const sc=this.sortCol,sd=this.sortDir;rows=[...rows].sort((a,b)=>{const va=String(a[sc]||'').toLowerCase(),vb=String(b[sc]||'').toLowerCase();return va<vb?-sd:va>vb?sd:0;});}
    this.filtered=rows;
    const tot=rows.length, tp=Math.max(1,Math.ceil(tot/this.pageSize));
    if(this.page>tp)this.page=tp;
    const s0=(this.page-1)*this.pageSize, page=rows.slice(s0,s0+this.pageSize);

    const ths=cols.map(c=>`<th class="${this.sortCol===c?'sorted':''}" onclick="App.sortBy('${esc(c)}')">${esc(c)} <span class="sort-icon">${this.sortCol===c?(this.sortDir===1?'↑':'↓'):'↕'}</span></th>`).join('')+
    `<th style="width:100px;cursor:pointer" onclick="App.sortCol=null;App.sortDir=1;App.renderTable('${t}')" title="Torna all'ordine di inserimento">
      ${!this.sortCol?'🕒 Inserimento':'↺'}</th>`;

    const trs=page.map(row=>{
      const oi=all.indexOf(row);
      const tds=cols.map(c=>{const v=row[c]??'';return meta.status===c?'<td>'+pill(v)+'</td>':`<td title="${esc(v)}">${esc(v)}</td>`;}).join('');
      const actView=`<button class="icon-btn view" title="Visualizza" onclick="App.openView('${t}',${oi})">👁</button>`;
      const actEdit=canEdit?`<button class="icon-btn" title="Modifica" onclick="App.openEdit('${t}',${oi})">✎</button><button class="icon-btn danger" title="Elimina" onclick="App.confirmDelete('${t}',${oi})">✕</button>`:'';
      return`<tr>${tds}<td><div class="td-actions">${actView}${actEdit}</div></td></tr>`;
    }).join('')||'<tr><td colspan="99" style="text-align:center;color:var(--text3);padding:36px">Nessun risultato</td></tr>';

    let pgs='';const mB=7,sP=Math.max(1,Math.min(this.page-3,tp-mB+1)),eP=Math.min(tp,sP+mB-1);
    for(let i=sP;i<=eP;i++)pgs+=`<button class="page-btn ${i===this.page?'active':''}" onclick="App.goPage(${i})">${i}</button>`;

    document.getElementById('content').innerHTML=`
      <div class="table-wrap">
        <div class="table-toolbar">
          <span style="font-size:14px;color:var(--text2);font-weight:600">${meta.label}</span>
          <span class="record-count">${this.filter?tot+' filtrati / ':''}${all.length} totali</span>
          <button class="btn btn-ghost" style="font-size:13px;background:var(--accent);color:#fff;border-color:var(--accent)" onclick="App.openQuickSearches('${t}')">⚡ Ricerche Rapide</button>
        <button class="btn btn-ghost" style="font-size:13px;border-color:var(--accent);color:var(--accent)" onclick="App.openAdvSearch('${t}')">🔍 Ricerca Avanzata</button>
          <button class="btn btn-ghost" style="font-size:13px" onclick="App.exportXLSX('${t}')">↓ Excel</button>
          <button class="btn btn-ghost" style="font-size:13px" onclick="App.importXLSX('${t}')">↑ Importa</button>
          <button class="btn btn-ghost" style="font-size:13px" onclick="App.printTable('${t}')">🖨 Stampa</button>
          <button class="btn btn-ghost" style="font-size:13px;color:var(--danger);border-color:#fca5a5" onclick="App.clearTable('${t}')">🗑 Svuota</button>
        </div>
        <div class="table-scroll"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>
        <div class="pagination">
          <span class="page-info">${s0+1}–${Math.min(s0+this.pageSize,tot)} di ${tot}</span>
          <button class="page-btn" onclick="App.goPage(1)" ${this.page===1?'disabled':''}>«</button>
          <button class="page-btn" onclick="App.goPage(${this.page-1})" ${this.page===1?'disabled':''}>‹</button>
          ${pgs}
          <button class="page-btn" onclick="App.goPage(${this.page+1})" ${this.page===tp?'disabled':''}>›</button>
          <button class="page-btn" onclick="App.goPage(${tp})" ${this.page===tp?'disabled':''}>»</button>
        </div>
      </div>`;
  },

  sortBy(c){if(this.sortCol===c)this.sortDir*=-1;else{this.sortCol=c;this.sortDir=1;}this.renderTable(this.table);},
  goPage(p){const tp=Math.max(1,Math.min(p,Math.max(1,Math.ceil(this.filtered.length/this.pageSize))));this.page=tp;this.renderTable(this.table);},

  // ── SELEZIONE MULTIPLA ─────────────────────────────────────────────────────
  toggleSelectRow(t, id, checked){
    if(!this.selected) this.selected = new Set();
    if(checked) this.selected.add(id); else this.selected.delete(id);
    this.renderTable(t);
  },
  toggleSelectAllPage(t, checked){
    if(!this.selected) this.selected = new Set();
    const s0=(this.page-1)*this.pageSize, page=this.filtered.slice(s0,s0+this.pageSize);
    page.forEach(r=>{ if(checked) this.selected.add(r._id); else this.selected.delete(r._id); });
    this.renderTable(t);
  },
  clearSelection(t){
    this.selected = new Set();
    this.renderTable(t);
  },

  // Apre il modale per scegliere un campo e un valore da applicare a tutti i record selezionati
  openBulkEdit(t){
    if(!this.selected || !this.selected.size){ toast('Nessun record selezionato','error'); return; }
    const allCols = Store.getCols(t).filter(c=>!SKIP.has(c)&&c!=='_id');
    // Per Dipendenti, escludi i campi sincronizzati da Contratti (non editabili direttamente)
    const editableCols = (t==='dipendenti')
      ? allCols.filter(c=>!['Stato Dipendente','Mansione','Data assunzione','Data fine rapporto'].includes(c))
      : allCols;

    document.getElementById('modal-title').textContent = `✎ Modifica campo per ${this.selected.size} record selezionati`;
    document.getElementById('modal-body').innerHTML = `
      <div style="font-size:13px;color:var(--text2);margin-bottom:14px">
        Scegli il campo da modificare e il nuovo valore: verrà applicato a tutti i record selezionati,
        sovrascrivendo il valore attuale.
      </div>
      <div class="form-group">
        <label class="field-label">Campo da modificare</label>
        <select id="bulk-edit-field" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px"
          onchange="App._renderBulkEditValueInput('${t}')">
          <option value="">-- Seleziona campo --</option>
          ${editableCols.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}
        </select>
      </div>
      <div id="bulk-edit-value-wrap"></div>
    `;
    document.getElementById('modal-footer').innerHTML = `
      <button class="btn btn-ghost" onclick="App.closeModal()">Annulla</button>
      <button class="btn btn-primary" onclick="App._applyBulkEdit('${t}')">Applica a tutti</button>`;
    App.openModal();
  },

  _renderBulkEditValueInput(t){
    const field = document.getElementById('bulk-edit-field').value;
    const wrap = document.getElementById('bulk-edit-value-wrap');
    if(!field){ wrap.innerHTML=''; return; }
    wrap.innerHTML = `<div class="form-group"><label class="field-label">Nuovo valore</label>${buildField(field,'')}</div>`;
  },

  async _applyBulkEdit(t){
    const field = document.getElementById('bulk-edit-field').value;
    if(!field){ toast('Seleziona un campo','error'); return; }
    const def = FIELDS[field];
    let newValue;
    if(def?.type==='radio'){
      const el = document.querySelector(`input[name="ff_${field.replace(/[^a-zA-Z0-9]/g,'_')}"]:checked`);
      newValue = el ? el.value : '';
    } else if(def?.type==='date'){
      const el = document.getElementById('ff_'+field.replace(/[^a-zA-Z0-9]/g,'_'));
      if(el && el.value){
        const p = el.value.split('-');
        newValue = p.length===3 ? p[2]+'-'+p[1]+'-'+p[0] : el.value;
      } else { newValue = ''; }
    } else {
      const el = document.getElementById('ff_'+field.replace(/[^a-zA-Z0-9]/g,'_'));
      newValue = el ? el.value : '';
    }

    const rows = Store.getRows(t);
    let count = 0;
    rows.forEach((row, idx)=>{
      if(this.selected.has(row._id)){
        const updated = {...row, [field]: newValue};
        Store.updateRow(t, idx, updated);
        count++;
      }
    });
    toast(`Campo "${field}" aggiornato su ${count} record ✓`);
    this.selected = new Set();
    this.closeModal();
    this.renderTable(t);
  },

  bulkDelete(t){
    if(!this.selected || !this.selected.size){ toast('Nessun record selezionato','error'); return; }
    const count = this.selected.size;
    document.getElementById('confirm-title').textContent='Elimina record selezionati';
    document.getElementById('confirm-msg').textContent=`Eliminare ${count} record selezionati? Operazione non reversibile.`+
      (t==='dipendenti' ? ' Verranno eliminati anche i record collegati in Contratti, Formazione e Sorveglianza.' : '');
    document.getElementById('confirm-ok').onclick=()=>{
      const ids = new Set(this.selected);
      // Elimina dal fondo per non sballare gli indici durante lo splice
      const rows = Store.getRows(t);
      const indicesToRemove = [];
      rows.forEach((r,idx)=>{ if(ids.has(r._id)) indicesToRemove.push(idx); });
      indicesToRemove.sort((a,b)=>b-a).forEach(idx=>{
        if(t==='dipendenti'){
          // Riusa la stessa logica di cascata di confirmDelete
          const row = Store.getRows(t)[idx];
          const normalize = s => String(s||'').trim().replace(',', '.').toUpperCase();
          const nSocioNorm = normalize(row['N° Socio']);
          if(nSocioNorm){
            ['contratti','formazione','sorveglianza'].forEach(tt=>{
              const rr = Store.getRows(tt);
              const toRemove = [];
              rr.forEach((r,i)=>{ if(normalize(r['Id Dipendente (N° Socio)'])===nSocioNorm) toRemove.push(i); });
              toRemove.sort((a,b)=>b-a).forEach(i=>Store.deleteRow(tt,i));
              const b=document.getElementById('badge-'+tt); if(b) b.textContent=Store.getRows(tt).length;
            });
          }
        }
        Store.deleteRow(t, idx);
      });
      toast(`${count} record eliminati`,'error');
      this.selected = new Set();
      const b=document.getElementById('badge-'+t); if(b) b.textContent=Store.getRows(t).length;
      this.closeConfirm();
      this.renderTable(t);
    };
    document.getElementById('confirm-overlay').classList.add('open');
  },

  // ── VISUALIZZA DETTAGLIO ───────────────────────────────────────────────────
  openView(t, idx){
    let row=Store.getRows(t)[idx];
    const meta=TABLE_META[t];
    document.getElementById('modal-title').textContent='👁 Dettaglio — '+meta.label;

    // In Dipendenti, sincronizza Stato Dipendente, Mansione, Data assunzione e Data fine
    // rapporto dal contratto associato (per N° Socio). Usa una copia locale per la sola
    // visualizzazione, senza modificare il record nello Store.
    if(t==='dipendenti'){
      const normalize = s => String(s||'').trim().replace(',', '.').toUpperCase();
      const contrattoRow = Store.getRows('contratti').find(c=>
        normalize(c['Id Dipendente (N° Socio)']) === normalize(row['N° Socio'])
      );
      if(contrattoRow){
        row = {...row,
          'Stato Dipendente': contrattoRow['Stato Dipendente'] || row['Stato Dipendente'],
          'Mansione': contrattoRow['Mansione'] || row['Mansione'],
          'Data assunzione': contrattoRow['Data Assunzione'] || contrattoRow['Data assunzione'] || row['Data assunzione'],
          'Data fine rapporto': contrattoRow['Data fine rapporto'] || row['Data fine rapporto'],
        };
      }
    }

    const allCols=Store.getCols(t).filter(c=>!SKIP.has(c)&&c!=='_id');
    const allSecs=CustomLayout.get(t)||[{t:'Dati',c:allCols}];
    const secs=allSecs.filter(s=>!s.__hidden); // le sezioni nascoste non vengono mostrate

    let html='';
    for(const sec of secs){
      const visCols=sec.c.filter(c=>allCols.includes(c)&&row[c]);
      if(!visCols.length)continue;
      html+=`<div class="form-section"><div class="form-section-title">${sec.t}</div><div class="view-grid">`;
      for(const c of visCols){
        const v=row[c]||'';
        html+=`<div class="view-field"><span class="view-label">${esc(c)}</span><span class="view-val">${FIELDS[c]?.type==='radio'?pill(v):esc(v)}</span></div>`;
      }
      html+='</div></div>';
    }
    // extra cols not in sections (i campi nascosti contano come "noti", quindi non finiscono qui)
    const secCols=new Set(allSecs.flatMap(s=>s.c));
    const extra=allCols.filter(c=>!secCols.has(c)&&row[c]);
    if(extra.length){
      html+='<div class="form-section"><div class="form-section-title">📁 Altri dati</div><div class="view-grid">';
      for(const c of extra) html+=`<div class="view-field"><span class="view-label">${esc(c)}</span><span class="view-val">${esc(row[c]||'')}</span></div>`;
      html+='</div></div>';
    }

    // Allegati nella vista dettaglio
    const allegSlotsV = ALLEGATI_SLOTS[t] || [];
    if(allegSlotsV.length){
      const recordId = row._id || '';
      html += '<div class="form-section"><div class="form-section-title">📎 Allegati</div><div style="padding:14px;display:flex;flex-wrap:wrap;gap:10px">';
      for(const slotDef of allegSlotsV){
        html += `<button type="button" class="btn btn-ghost" style="font-size:13px"
          onclick="Allegati.openModal('${t}','${recordId}',{label:'${slotDef.label.replace(/'/g,"\'")}',slot:'${slotDef.slot}',single:${slotDef.single}})">
          ${slotDef.label}</button>`;
      }
      html += '</div></div>';
    }

    document.getElementById('modal-body').innerHTML=html||'<p style="color:var(--text3);padding:8px">Nessun dato disponibile.</p>';
    document.getElementById('modal-footer').innerHTML=
      (Auth.canEdit()?`<button class="btn btn-primary" onclick="App.closeModal();App.openEdit('${t}',${idx})">✎ Modifica</button>`:'') +
      `<button class="btn btn-ghost" onclick="App.closeModal()">Chiudi</button>`;
    this.openModal();
  },

  // ── ADD / EDIT ─────────────────────────────────────────────────────────────
  openAdd(){ this._openForm(this.table,null,null); },
  openEdit(t,idx){ this._openForm(t,Store.getRows(t)[idx],idx); },

  _openForm(t,row,idx){
    _formState={table:t, idx:idx, cols:[], tempId:null, recordId:null};
    document.getElementById('modal-title').textContent=(idx!==null?'✎ Modifica':'＋ Nuovo')+' — '+TABLE_META[t].label;

    // Only use cols that actually exist in the store
    const allCols=Store.getCols(t).filter(c=>!SKIP.has(c)&&c!=='_id');
    const secs=CustomLayout.get(t)||[{t:'Campi',c:allCols}];

    // Insieme dei campi marcati come "nascosti" tramite l'editor di layout: non vengono
    // mostrati nel modulo, ma restano nel dato salvato (vedi _formState.cols più sotto).
    const hiddenFields=new Set(secs.filter(s=>s.__hidden).flatMap(s=>s.c));

    // Build an ordered list: first cols that appear in sections, then the rest
    const ordered=[];
    const seen=new Set();
    for(const sec of secs){
      if(sec.__hidden) continue; // i campi nascosti non entrano nel rendering del form
      for(const c of sec.c){
        if(allCols.includes(c)&&!seen.has(c)){ ordered.push({c,sec:sec.t}); seen.add(c); }
      }
    }
    secs.filter(s=>s.__hidden).forEach(s=>s.c.forEach(c=>seen.add(c))); // segna come "visti" senza renderizzarli
    for(const c of allCols){ if(!seen.has(c)){ ordered.push({c,sec:'📁 Altri campi'}); seen.add(c); } }
    // In Dipendenti, Stato Dipendente, Mansione, Data assunzione e Data fine rapporto sono
    // mostrati in sola lettura (sincronizzati da Contratti) dentro la sezione "Dati Associativi"
    // — escludili dal fallback "Altri campi" per evitare campi editabili duplicati e disallineati.
    const orderedFiltered = (t==='dipendenti')
      ? ordered.filter(o=>!(o.sec==='📁 Altri campi' && ['Stato Dipendente','Mansione','Data assunzione','Data fine rapporto'].includes(o.c)))
      : ordered;

    // Group by section title
    const bySection={};
    for(const {c,sec} of orderedFiltered){
      if(!bySection[sec])bySection[sec]=[];
      bySection[sec].push(c);
    }

    // In Dipendenti, Stato Dipendente, Mansione, Data assunzione e Data fine rapporto sono
    // mostrati in sola lettura, sincronizzati dal contratto di lavoro associato (tabella
    // Contratti). Calcolati una volta sola, e applicati ovunque questi campi compaiano nel
    // layout (anche se l'admin li ha spostati con l'editor di layout in un'altra sezione).
    const SYNCED_READONLY_FIELDS = new Set(['Stato Dipendente','Mansione','Data assunzione','Data fine rapporto']);
    let syncedValues = {};
    if(t==='dipendenti'){
      const nSocio = String(row?.['N° Socio']||'').trim();
      const normalize = s => String(s||'').trim().replace(',', '.').toUpperCase();
      const contrattoRow = nSocio ? Store.getRows('contratti').find(c=>
        normalize(c['Id Dipendente (N° Socio)']) === normalize(nSocio)
      ) : null;
      // Normalizza DD-MM-YYYY / DD/MM/YYYY → YYYY-MM-DD per l'input type="date"
      const toDateInputVal = v => {
        v = String(v||'');
        if(/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(v)){ const p=v.split(/[\/\-]/); return p[2]+'-'+p[1]+'-'+p[0]; }
        return v;
      };
      syncedValues = {
        'Stato Dipendente': contrattoRow?.['Stato Dipendente'] || '',
        'Mansione': contrattoRow?.['Mansione'] || '',
        'Data assunzione': toDateInputVal(contrattoRow?.['Data Assunzione'] || contrattoRow?.['Data assunzione'] || ''),
        'Data fine rapporto': toDateInputVal(contrattoRow?.['Data fine rapporto'] || ''),
      };
    }

    let html='';
    for(const [secTitle,cols] of Object.entries(bySection)){
      html+=`<div class="form-section"><div class="form-section-title">${secTitle}</div><div class="form-grid">`;
      for(const c of cols){
        if(t==='dipendenti' && SYNCED_READONLY_FIELDS.has(c)){
          const inputType = (c==='Data assunzione' || c==='Data fine rapporto') ? 'date' : 'text';
          html+=`<div class="form-group"><label class="field-label">${esc(c)} <small style="color:#888">(da Contratti)</small></label>
            <input type="${inputType}" value="${esc(syncedValues[c])}" disabled style="background:#f3f4f6;color:#555;cursor:not-allowed"/></div>`;
          continue;
        }
        const def=FIELDS[c];
        const wide=def?.type==='radio'||def?.type==='textarea'||c.toLowerCase().includes('note')||c.toLowerCase().includes('indirizzo');
        html+=`<div class="form-group ${wide?'full':''}"><label class="field-label">${esc(c)}</label>${buildField(c,row?row[c]:'')}</div>`;
      }
      html+='</div></div>';
    }

    _formState.cols=allCols;

    // Aggiungi sezioni allegati - disponibili sia in modifica che in aggiunta
    const allegSlots = ALLEGATI_SLOTS[t] || [];
    if(allegSlots.length && Auth.can('allegati')){
      // Per nuovi record genera un ID temporaneo persistente nella sessione
      let recordId;
      if(idx !== null){
        const row = Store.getRows(t)[idx];
        recordId = row?._id || ('new_'+Date.now());
      } else {
        // Nuovo record: usa un ID temporaneo salvato in _formState
        if(!_formState.tempId) _formState.tempId = 'tmp_'+Date.now().toString(36)+Math.random().toString(36).slice(2);
        recordId = _formState.tempId;
      }
      _formState.recordId = recordId;
      html += '<div class="form-section"><div class="form-section-title">📎 Allegati</div><div style="padding:14px;display:flex;flex-wrap:wrap;gap:10px">';
      for(const slotDef of allegSlots){
        html += `<button type="button" class="btn btn-ghost" style="font-size:13px"
          onclick="Allegati.openModal('${t}','${recordId}',{label:'${slotDef.label.replace(/'/g,"\'")}',slot:'${slotDef.slot}',single:${slotDef.single}})">
          ${slotDef.label}</button>`;
      }
      html += '</div></div>';
    }

    document.getElementById('modal-body').innerHTML=html;
    document.getElementById('modal-footer').innerHTML=`
      <button class="btn btn-ghost" onclick="App.closeModal()">Annulla</button>
      <button class="btn btn-primary" id="btn-save-form">${idx!==null?'✓ Salva modifiche':'＋ Aggiungi'}</button>`;
    document.getElementById('btn-save-form').addEventListener('click',()=>App.saveForm());
    this.openModal();
  },

  saveForm(){
    const {table,idx,cols}=_formState;
    if(!table||!cols||cols.length===0){
      toast('Errore interno: riprova','error');
      return;
    }
    const row={};
    const hiddenLayoutFields = (() => {
      const secs = CustomLayout.get(table) || [];
      return new Set(secs.filter(s=>s.__hidden).flatMap(s=>s.c));
    })();
    for(const c of cols){
      // Campi nascosti tramite l'editor di layout: nessun input nel form, preserva il
      // valore esistente nel record invece di sovrascriverlo con una stringa vuota.
      if(hiddenLayoutFields.has(c)){
        row[c] = idx!==null ? (Store.getRows(table)[idx]?.[c] ?? '') : '';
        continue;
      }
      // In Dipendenti, Stato Dipendente e Mansione non sono più campi editabili nel form
      // (sono mostrati in sola lettura, sincronizzati da Contratti) — al salvataggio,
      // scrivi nel record il valore REALE preso dal contratto associato (per N° Socio),
      // così la colonna nella tabella resta sempre coerente, anche se prima era vuota.
      // In Dipendenti, Stato Dipendente, Mansione, Data assunzione e Data fine rapporto non
      // sono più campi editabili nel form (sono mostrati in sola lettura, sincronizzati da
      // Contratti) — al salvataggio, scrivi nel record il valore REALE preso dal contratto
      // associato (per N° Socio), così la colonna nella tabella resta sempre coerente.
      if(table==='dipendenti' && ['Stato Dipendente','Mansione','Data assunzione','Data fine rapporto'].includes(c)){
        const nSocioEl = document.getElementById('ff_N__Socio'); // il campo N° Socio nel form, se presente
        const nSocioVal = nSocioEl ? nSocioEl.value : (idx!==null ? Store.getRows(table)[idx]?.['N° Socio'] : '');
        const normalize = s => String(s||'').trim().replace(',', '.').toUpperCase();
        const contrattoRow = nSocioVal ? Store.getRows('contratti').find(cr=>
          normalize(cr['Id Dipendente (N° Socio)']) === normalize(nSocioVal)
        ) : null;
        const fallback = idx!==null ? (Store.getRows(table)[idx]?.[c] || '') : '';
        // "Data assunzione" in Contratti può essere scritta come "Data Assunzione" (maiuscola)
        const contrattoVal = c==='Data assunzione'
          ? (contrattoRow?.['Data Assunzione'] || contrattoRow?.['Data assunzione'])
          : contrattoRow?.[c];
        row[c] = contrattoVal || fallback;
        continue;
      }
      try{
        const def=FIELDS[c];
        if(def?.type==='radio'){
          const el=document.querySelector('input[name="ff_'+c.replace(/[^a-zA-Z0-9]/g,'_')+'"]:checked');
          row[c]=el?el.value:'';
        } else if(def?.type==='date'){
          const el=document.getElementById('ff_'+c.replace(/[^a-zA-Z0-9]/g,'_'));
          if(el&&el.value){
            const p=el.value.split('-');
            row[c]=p.length===3?p[2]+'-'+p[1]+'-'+p[0]:el.value;
          } else { row[c]=''; }
        } else {
          const el=document.getElementById('ff_'+c.replace(/[^a-zA-Z0-9]/g,'_'));
          row[c]=el?el.value:'';
        }
      } catch(e){ row[c]=''; }
    }
    try{
      if(idx!==null){
        Store.updateRow(table,idx,row);
        toast('Record aggiornato ✓');
        // Nota: la sincronizzazione verso Contratti/Formazione/Sorveglianza avviene già
        // automaticamente dentro Store.updateRow tramite _propagateDipendentiFields.
      } else {
        Store.addRow(table,row);
        const newRow = Store.getRows(table)[Store.getRows(table).length-1];
        if(_formState.tempId && newRow?._id){
          Allegati.renameTempFiles(_formState.tempId, newRow._id);
        }
        // Crea righe collegate nelle altre tabelle
        this.createRelatedRows(table, newRow);
        toast('Record aggiunto ✓');
      }
      this.closeModal();
      const b=document.getElementById('badge-'+table);
      if(b) b.textContent=Store.getRows(table).length;
      this.renderTable(table);
    } catch(e){
      console.error('Errore saveForm:',e);
      toast('Errore salvataggio: '+e.message,'error');
    }
  },

  confirmDelete(t,idx){
    const row=Store.getRows(t)[idx];
    const name=Object.values(row).find(v=>v&&String(v).trim()&&v!=='_id')||'questo record';

    // Per Dipendenti: conta quanti record collegati verrebbero eliminati a cascata
    // in Contratti, Formazione, Sorveglianza (stesso N° Socio), per avvisare l'utente.
    let cascadeMsg = '';
    if(t==='dipendenti'){
      const normalize = s => String(s||'').trim().replace(',', '.').toUpperCase();
      const nSocioNorm = normalize(row['N° Socio']);
      if(nSocioNorm){
        const counts = ['contratti','formazione','sorveglianza'].map(tt=>{
          const n = Store.getRows(tt).filter(r=>normalize(r['Id Dipendente (N° Socio)'])===nSocioNorm).length;
          return {tt, n};
        }).filter(c=>c.n>0);
        if(counts.length){
          const labels = {contratti:'Contratti', formazione:'Formazione', sorveglianza:'Sorveglianza Sanitaria'};
          cascadeMsg = ' Verranno eliminati anche ' + counts.map(c=>`${c.n} record in ${labels[c.tt]}`).join(', ') + '.';
        }
      }
    }

    document.getElementById('confirm-title').textContent='Elimina record';
    document.getElementById('confirm-msg').textContent=`Eliminare "${String(name).slice(0,70)}"? Operazione non reversibile.${cascadeMsg}`;
    document.getElementById('confirm-ok').onclick=()=>{
      // Cascata: se elimino un dipendente, elimino anche i record collegati nelle altre tabelle
      if(t==='dipendenti'){
        const normalize = s => String(s||'').trim().replace(',', '.').toUpperCase();
        const nSocioNorm = normalize(row['N° Socio']);
        if(nSocioNorm){
          ['contratti','formazione','sorveglianza'].forEach(tt=>{
            const rows = Store.getRows(tt);
            const toRemove = [];
            rows.forEach((r,i)=>{ if(normalize(r['Id Dipendente (N° Socio)'])===nSocioNorm) toRemove.push(i); });
            // Rimuove dal fondo per non sballare gli indici durante lo splice
            toRemove.sort((a,b)=>b-a).forEach(i=>Store.deleteRow(tt,i));
            const b=document.getElementById('badge-'+tt); if(b) b.textContent=Store.getRows(tt).length;
            if(this.table===tt) this.renderTable(tt);
          });
        }
      }
      Store.deleteRow(t,idx);
      toast('Record eliminato','error');
      const b=document.getElementById('badge-'+t);if(b)b.textContent=Store.getRows(t).length;
      this.closeConfirm();
      this.renderTable(t);
    };
    document.getElementById('confirm-overlay').classList.add('open');
  },

  // ── UTENTI ─────────────────────────────────────────────────────────────────
  renderUsers(){
    document.getElementById('content').innerHTML=
      '<div class="table-wrap"><div class="table-scroll"><table>'+
      '<thead><tr><th>Username</th><th>Nome</th><th>Ruolo</th><th>Permessi attivi</th><th>Azioni</th></tr></thead><tbody>'+
      Auth.getUsers().map((u,i)=>{
        const perms=u.permissions||ROLE_DEFAULTS[u.role]||[];
        const labels=perms.map(p=>ALL_PERMISSIONS[p]?.label||p).join(' · ');
        return '<tr>'+
          '<td>'+esc(u.username)+'</td><td>'+esc(u.nome)+'</td>'+
          '<td><span class="pill '+(u.role==='admin'?'pill-red':u.role==='editor'?'pill-blue':'pill-gray')+'">'+u.role+'</span></td>'+
          '<td style="font-size:11px;color:var(--text3);white-space:normal;line-height:1.5;max-width:250px">'+esc(labels)+'</td>'+
          '<td><div class="td-actions">'+
          '<button class="icon-btn" onclick="App.openEditUser('+i+')">✎</button>'+
          '<button class="icon-btn danger" onclick="App.confirmDeleteUser('+i+')">✕</button>'+
          '</div></td></tr>';
      }).join('')+
      '</tbody></table></div></div>';
  },
  openAddUser(){ this._openUserForm(null,null); },
  openEditUser(i){ this._openUserForm(Auth.getUsers()[i],i); },
  _openUserForm(u,idx){
    document.getElementById('modal-title').textContent=u?'Modifica Utente':'Nuovo Utente';
    const curPerms=u?.permissions||ROLE_DEFAULTS[u?.role||'viewer']||[];
    const permsHtml=Object.entries(ALL_PERMISSIONS).map(([key,def])=>
      '<label class="perm-item">'+
      '<input type="checkbox" name="perm_chk" value="'+key+'" '+(curPerms.includes(key)?'checked':'')+'/> '+
      '<span class="perm-label"><strong>'+esc(def.label)+'</strong> — <small>'+esc(def.desc)+'</small></span></label>'
    ).join('');
    document.getElementById('modal-body').innerHTML=
      '<div class="form-grid" style="padding:0;margin-bottom:16px">'+
      '<div class="form-group"><label class="field-label">Username</label><input type="text" id="u_un" value="'+esc(u?.username||'')+'"/></div>'+
      '<div class="form-group"><label class="field-label">Nome</label><input type="text" id="u_no" value="'+esc(u?.nome||'')+'"/></div>'+
      '<div class="form-group"><label class="field-label">Password</label><input type="password" id="u_pw" placeholder="'+(u?'Lascia vuoto per non cambiare':'Nuova password')+'"/></div>'+
      '<div class="form-group"><label class="field-label">Ruolo base</label>'+
      '<select id="u_ro" onchange="App.resetPermsToRole()">'+
      '<option value="viewer"'+(u?.role==='viewer'?' selected':'')+'>viewer – solo lettura</option>'+
      '<option value="editor"'+(u?.role==='editor'?' selected':'')+'>editor – modifica</option>'+
      '<option value="admin"'+(u?.role==='admin'?' selected':'')+'>admin – completo</option>'+
      '</select></div></div>'+
      '<div class="form-section">'+
      '<div class="form-section-title" style="display:flex;justify-content:space-between;align-items:center">'+
      '🔐 Permessi personalizzati'+
      '<button type="button" class="btn btn-ghost" style="font-size:11px;padding:3px 10px" onclick="App.resetPermsToRole()">↺ Ripristina dal ruolo</button></div>'+
      '<div class="perm-grid" id="perm-grid">'+permsHtml+'</div></div>';
    document.getElementById('modal-footer').innerHTML=
      '<button class="btn btn-ghost" onclick="App.closeModal()">Annulla</button>'+
      '<button class="btn btn-primary" id="btn-save-user">Salva</button>';
    document.getElementById('btn-save-user').addEventListener('click',()=>{
      const un=document.getElementById('u_un').value.trim();
      const no=document.getElementById('u_no').value.trim();
      const pw=document.getElementById('u_pw').value;
      const ro=document.getElementById('u_ro').value;
      if(!un||!no){toast('Compila tutti i campi','error');return;}
      const perms=this.getSelectedPerms();
      const users=Auth.getUsers();
      if(idx===null){if(!pw){toast('Inserisci una password','error');return;}users.push({username:un,nome:no,password:pw,role:ro,permissions:perms});}
      else{users[idx]={username:un,nome:no,role:ro,password:pw||users[idx].password,permissions:perms};}
      Auth.saveUsers(users);toast('Utente salvato');this.closeModal();this.renderUsers();
    });
    this.openModal();
  },
  resetPermsToRole(){
    const role=document.getElementById('u_ro')?.value||'viewer';
    const defs=ROLE_DEFAULTS[role]||[];
    document.querySelectorAll('#perm-grid input[type=checkbox]').forEach(cb=>{cb.checked=defs.includes(cb.value);});
  },
  getSelectedPerms(){
    return[...document.querySelectorAll('#perm-grid input[type=checkbox]:checked')].map(cb=>cb.value);
  },
    confirmDeleteUser(i){
    const u=Auth.getUsers()[i];
    document.getElementById('confirm-title').textContent='Elimina Utente';
    document.getElementById('confirm-msg').textContent=`Eliminare l'utente "${u.username}"?`;
    document.getElementById('confirm-ok').onclick=()=>{
      const us=Auth.getUsers();us.splice(i,1);Auth.saveUsers(us);
      toast('Utente eliminato','error');this.closeConfirm();this.renderUsers();
    };
    document.getElementById('confirm-overlay').classList.add('open');
  },

  // ── DASHBOARD INTERACTIVITY ───────────────────────────────────────────────────
  dashFilterEl(el){
    const t=el.dataset.table, c=el.dataset.col, v=el.dataset.val;
    this.dashFilter(t,c,v);
  },
  dashFilter(table, col, val){
    this.show(table);
    // apply filter
    setTimeout(()=>{
      this.filter=val.toLowerCase();
      document.getElementById('search-input').value=val;
      this.renderTable(table);
    },50);
  },

  dashDetail(type){
    if(type==='scadenze'){
      // Show modal with all sorveglianza expiring in 90 days
      const oggi=new Date(), lim=new Date(); lim.setDate(oggi.getDate()+90);
      const rows=Store.getRows('sorveglianza').filter(r=>{
        const s=r['Scadenza Idoneità']; if(!s)return false;
        const p=s.split(/[\/\-]/);
        if(p.length!==3)return false;
        const d=p[0].length===4?new Date(p[0]+'-'+p[1]+'-'+p[2]):new Date(p[2]+'-'+p[1]+'-'+p[0]);
        return !isNaN(d)&&d>=oggi&&d<=lim;
      });
      rows.sort((a,b)=>{
        const da=a['Scadenza Idoneità']||'',db=b['Scadenza Idoneità']||'';
        return da.localeCompare(db);
      });
      document.getElementById('modal-title').textContent='⚠ Scadenze Sorveglianza — prossimi 90 giorni';
      let html='<div class="table-scroll"><table><thead><tr><th>N° Socio</th><th>Azienda</th><th>Cognome</th><th>Nome</th><th>Scadenza Idoneità</th><th>Stato</th></tr></thead><tbody>';
      if(!rows.length){html+='<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Nessuna scadenza nei prossimi 90 giorni 🎉</td></tr>';}
      else{
        rows.forEach((r,i)=>{
          const oi=Store.getRows('sorveglianza').indexOf(r);
          html+=`<tr style="cursor:pointer" onclick="App.closeModal();App.openView('sorveglianza',${oi})">
            <td>${esc(r['Id Dipendente (N° Socio)']||'')}</td>
            <td>${esc(r['Azienda']||'')}</td>
            <td>${esc(r['Cognome']||'')}</td>
            <td>${esc(r['Nome']||'')}</td>
            <td style="font-weight:700;color:var(--warn)">${esc(r['Scadenza Idoneità']||'')}</td>
            <td>${pill(r['Stato idoneità']||'')}</td>
          </tr>`;
        });
      }
      html+='</tbody></table></div>';
      document.getElementById('modal-body').innerHTML=html;
      document.getElementById('modal-footer').innerHTML=
        `<button class="btn btn-ghost" onclick="App.printScadenze('sorveglianza')">🖨 Stampa lista</button>`+
        `<button class="btn btn-ghost" onclick="App.show('sorveglianza')">Vai alla tabella</button>`+
        `<button class="btn btn-primary" onclick="App.closeModal()">Chiudi</button>`;
      this.openModal();
    } else if(type==='permessi'){
      const oggi=new Date(), lim=new Date(); lim.setDate(oggi.getDate()+90);
      const rows=Store.getRows('dipendenti').filter(r=>{
        const s=r['Data scadenza Permesso Soggiorno']; if(!s)return false;
        const p=s.split(/[\/\-]/);
        if(p.length!==3)return false;
        const d=p[0].length===4?new Date(p[0]+'-'+p[1]+'-'+p[2]):new Date(p[2]+'-'+p[1]+'-'+p[0]);
        return !isNaN(d)&&d>=oggi&&d<=lim;
      });
      rows.sort((a,b)=>(a['Data scadenza Permesso Soggiorno']||'').localeCompare(b['Data scadenza Permesso Soggiorno']||''));
      document.getElementById('modal-title').textContent='🌍 Scadenze Permesso di Soggiorno — prossimi 90 giorni';
      let html='<div class="table-scroll"><table><thead><tr><th>N° Socio</th><th>Azienda</th><th>Cognome</th><th>Nome</th><th>Tipo Permesso</th><th>Scadenza</th></tr></thead><tbody>';
      if(!rows.length){
        html+='<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3)">Nessun permesso in scadenza nei prossimi 90 giorni 🎉</td></tr>';
      } else {
        rows.forEach(r=>{
          const oi=Store.getRows('dipendenti').indexOf(r);
          const scad=r['Data scadenza Permesso Soggiorno']||'';
          const lim30=new Date(); lim30.setDate(new Date().getDate()+30);
          const pts=scad.split(/[\/\-]/);
          const d=pts.length===3?(pts[0].length===4?new Date(pts[0]+'-'+pts[1]+'-'+pts[2]):new Date(pts[2]+'-'+pts[1]+'-'+pts[0])):null;
          const urgente=d&&d<=lim30;
          html+=`<tr style="cursor:pointer" onclick="App.closeModal();App.openView('dipendenti',${oi})">
            <td>${esc(r['N° Socio']||'')}</td>
            <td>${esc(r['Azienda']||'')}</td>
            <td>${esc(r['Cognome']||'')}</td>
            <td>${esc(r['Nome']||'')}</td>
            <td>${esc(r['Tipo permesso']||'')}</td>
            <td style="font-weight:700;color:${urgente?'var(--danger)':'var(--warn)'}">${esc(scad)}</td>
          </tr>`;
        });
      }
      html+='</tbody></table></div>';
      document.getElementById('modal-body').innerHTML=html;
      document.getElementById('modal-footer').innerHTML=
        `<button class="btn btn-ghost" onclick="App.printScadenze('permessi')">🖨 Stampa lista</button>`+
        `<button class="btn btn-ghost" onclick="App.show('dipendenti')">Vai ai Dipendenti</button>`+
        `<button class="btn btn-primary" onclick="App.closeModal()">Chiudi</button>`;
      this.openModal();
    } else if(type==='tutti_permessi'){
      // Tutti i dipendenti con permesso di soggiorno
      const tutti=Store.getRows('dipendenti').filter(r=>{
        const tp=r['Tipo permesso']; return tp&&tp.trim()&&tp!=='nan';
      });
      const oggi2=new Date(), lim90=new Date(); lim90.setDate(oggi2.getDate()+90);
      function parseDate(s){
        if(!s)return null;
        const p=s.split(/[\/\-]/);
        if(p.length!==3)return null;
        return p[0].length===4?new Date(p[0]+'-'+p[1]+'-'+p[2]):new Date(p[2]+'-'+p[1]+'-'+p[0]);
      }
      tutti.sort((a,b)=>{
        const da=parseDate(a['Data scadenza Permesso Soggiorno']),db=parseDate(b['Data scadenza Permesso Soggiorno']);
        if(da&&db)return da-db;
        if(da)return -1; if(db)return 1;
        return 0;
      });
      document.getElementById('modal-title').textContent='🌍 Tutti i Permessi di Soggiorno ('+tutti.length+')';
      let html='<div class="table-scroll"><table><thead><tr><th>N° Socio</th><th>Azienda</th><th>Cognome</th><th>Nome</th><th>Tipo Permesso</th><th>Scadenza</th><th>Stato</th></tr></thead><tbody>';
      tutti.forEach(r=>{
        const oi=Store.getRows('dipendenti').indexOf(r);
        const scad=r['Data scadenza Permesso Soggiorno']||'';
        const d=parseDate(scad);
        const scaduto=d&&d<oggi2;
        const urgente=d&&d>=oggi2&&d<=lim90;
        const stato=scaduto?'<span class="pill pill-red">SCADUTO</span>':urgente?'<span class="pill pill-yellow">IN SCADENZA</span>':'<span class="pill pill-green">VALIDO</span>';
        html+=`<tr style="cursor:pointer" onclick="App.closeModal();App.openView('dipendenti',${oi})">
          <td>${esc(r['N° Socio']||'')}</td>
          <td>${esc(r['Azienda']||'')}</td>
          <td>${esc(r['Cognome']||'')}</td>
          <td>${esc(r['Nome']||'')}</td>
          <td>${esc(r['Tipo permesso']||'')}</td>
          <td style="font-weight:700;color:${scaduto?'var(--danger)':urgente?'var(--warn)':'var(--success)'}">${esc(scad)}</td>
          <td>${stato}</td>
        </tr>`;
      });
      html+='</tbody></table></div>';
      document.getElementById('modal-body').innerHTML=html;
      document.getElementById('modal-footer').innerHTML=
        `<button class="btn btn-ghost" onclick="App.printScadenze('permessi_tutti')">🖨 Stampa lista</button>`+
        `<button class="btn btn-ghost" onclick="App.show('dipendenti')">Vai ai Dipendenti</button>`+
        `<button class="btn btn-primary" onclick="App.closeModal()">Chiudi</button>`;
      this.openModal();
    }
  },

  // ── STAMPA SCADENZE ─────────────────────────────────────────────────────────
  printScadenze(tipo){
    const oggi=new Date(), lim90=new Date(); lim90.setDate(oggi.getDate()+90);
    const oggiStr=oggi.toLocaleDateString('it-IT');
    function parseDate(s){
      if(!s)return null;
      const p=s.split(/[\/\-]/);
      if(p.length!==3)return null;
      return p[0].length===4?new Date(p[0]+'-'+p[1]+'-'+p[2]):new Date(p[2]+'-'+p[1]+'-'+p[0]);
    }

    let title, rows, cols, colDefs;

    if(tipo==='sorveglianza'){
      title='Scadenze Sorveglianza Sanitaria — prossimi 90 giorni';
      rows=Store.getRows('sorveglianza').filter(r=>{
        const d=parseDate(r['Scadenza Idoneità']); return d&&d>=oggi&&d<=lim90;
      }).sort((a,b)=>(parseDate(a['Scadenza Idoneità'])||0)-(parseDate(b['Scadenza Idoneità'])||0));
      cols=['Id Dipendente (N° Socio)','Azienda','Cognome','Nome','Mansione','Data visita medica','Scadenza Idoneità','Stato idoneità','Medico'];
    } else if(tipo==='permessi'){
      title='Scadenze Permesso di Soggiorno — prossimi 90 giorni';
      rows=Store.getRows('dipendenti').filter(r=>{
        const d=parseDate(r['Data scadenza Permesso Soggiorno']); return d&&d>=oggi&&d<=lim90;
      }).sort((a,b)=>(parseDate(a['Data scadenza Permesso Soggiorno'])||0)-(parseDate(b['Data scadenza Permesso Soggiorno'])||0));
      cols=['N° Socio','Azienda','Cognome','Nome','Tipo permesso','Data rilascio Permesso Soggiorno','Data scadenza Permesso Soggiorno'];
    } else if(tipo==='permessi_tutti'){
      title='Tutti i Permessi di Soggiorno';
      rows=Store.getRows('dipendenti').filter(r=>{
        const tp=r['Tipo permesso']; return tp&&tp.trim()&&tp!=='nan';
      }).sort((a,b)=>(parseDate(a['Data scadenza Permesso Soggiorno'])||0)-(parseDate(b['Data scadenza Permesso Soggiorno'])||0));
      cols=['N° Socio','Azienda','Cognome','Nome','Tipo permesso','Data rilascio Permesso Soggiorno','Data scadenza Permesso Soggiorno'];
    }

    const allCols=Store.getCols(tipo==='sorveglianza'?'sorveglianza':'dipendenti');
    const printCols=cols.filter(c=>allCols.includes(c));
    const thead=printCols.map(c=>`<th>${esc(c)}</th>`).join('');
    const tbody=rows.map(r=>{
      return '<tr>'+printCols.map(c=>{
        const v=String(r[c]||'');
        // Highlight expiring dates
        const isDateCol=c.toLowerCase().includes('scadenza');
        const d=isDateCol?parseDate(v):null;
        const scaduto=d&&d<oggi;
        const urgente=d&&d>=oggi&&d<=lim90;
        const style=scaduto?'color:#dc2626;font-weight:700':urgente?'color:#d97706;font-weight:700':'';
        return `<td${style?` style="${style}"`:''}>` + esc(v) + '</td>';
      }).join('')+'</tr>';
    }).join('');

    const html=`<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8"/>
<title>${title}</title>
<style>
  @page{size:A4 landscape;margin:8mm 8mm 10mm 8mm;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Arial,sans-serif;font-size:8px;color:#111;}
  .header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px;border-bottom:2px solid #1F4E79;padding-bottom:5px;}
  .header h1{font-size:13px;font-weight:800;color:#1F4E79;}
  .header p{font-size:8px;color:#555;}
  table{width:100%;border-collapse:collapse;table-layout:fixed;}
  th{background:#1F4E79;color:#fff;padding:4px 5px;text-align:left;font-size:7px;font-weight:700;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  td{padding:4px 5px;border-bottom:1px solid #e5e7eb;vertical-align:top;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  tr:nth-child(even) td{background:#EBF3FB;}
  .footer{margin-top:6px;font-size:7px;color:#999;display:flex;justify-content:space-between;}
  .legend{margin-top:5px;font-size:7.5px;display:flex;gap:16px;}
  .leg{display:flex;align-items:center;gap:4px;}
  .dot{width:8px;height:8px;border-radius:50%;display:inline-block;}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}thead{display:table-header-group;}tr{page-break-inside:avoid;}}
</style>
</head>
<body>
  <div class="header">
    <div><h1>${title}</h1><p>${rows.length} record</p></div>
    <p>Stampato il ${oggiStr}</p>
  </div>
  <table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
  <div class="legend">
    <div class="leg"><div class="dot" style="background:#dc2626"></div> Scaduto</div>
    <div class="leg"><div class="dot" style="background:#d97706"></div> In scadenza entro 90gg</div>
    <div class="leg"><div class="dot" style="background:#16a34a"></div> Valido</div>
  </div>
  <div class="footer"><span>Gestionale Dipendenti</span><span>${rows.length} record — ${oggiStr}</span></div>
  <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};<\/script>
</body></html>`;

    const w=window.open('','_blank');
    if(!w){toast('Abilita i popup per stampare','error');return;}
    w.document.write(html);
    w.document.close();
  },

  // ── STAMPA ───────────────────────────────────────────────────────────────────
  printTable(t){
    const rows = this.filtered.length ? this.filtered : Store.getRows(t);
    const meta = TABLE_META[t];
    const oggi = new Date().toLocaleDateString('it-IT');

    // Colonne da stampare per tabella (le più significative, max ~10 per stare in A4)
    const PRINT_COLS = {
      dipendenti:   ['N° Socio','Azienda','Cognome','Nome','Codice Fiscale','Mansione','Stato Dipendente','Telefono Cellulare','Email'],
      contratti:    ['Id Dipendente (N° Socio)','Azienda','Cognome','Nome','Tipologia contrattuale','Tipologia orario contrattuale','Livello','Data inizio','Data fine','Scadenza Contratto'],
      formazione:   ['Id Dipendente (N° Socio)','Azienda','Cognome','Nome','Tipologia Corso','Data Corso','Scadenza Corso','Stato Corso','Ore'],
      sorveglianza: ['Id Dipendente (N° Socio)','Azienda','Cognome','Nome','Data visita medica','Scadenza Idoneità','Stato idoneità','Medico','Analisi'],
      aziende:      ['Denominazione Ditta','Partita IVA','PEC','Email','Codice ATECO','PAT','Posizione INPS'],
    };

    // Usa solo colonne che esistono nello store
    const allCols = Store.getCols(t);
    const wantedCols = (PRINT_COLS[t] || meta.cols);
    const cols = wantedCols.filter(c => allCols.includes(c));

    // Calcola larghezza colonne in % in base alla lunghezza max dei valori
    const widths = cols.map(c => {
      const maxLen = Math.max(c.length, ...rows.slice(0,50).map(r => String(r[c]||'').length));
      return Math.min(maxLen, 20);
    });
    const totalW = widths.reduce((a,b)=>a+b,0);
    const pcts = widths.map(w => Math.max(5, Math.round(w/totalW*100)));

    const colgroup = cols.map((c,i) => `<col style="width:${pcts[i]}%"/>`).join('');
    const thead = cols.map(c => `<th>${esc(c)}</th>`).join('');
    const tbody = rows.map(r =>
      '<tr>' + cols.map(c => {
        const v = String(r[c]||'');
        return `<td>${esc(v)}</td>`;
      }).join('') + '</tr>'
    ).join('');

    const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8"/>
  <title>${meta.label}</title>
  <style>
    @page { size: A4 landscape; margin: 8mm 8mm 10mm 8mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 7.5px; color: #111; }
    .header { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:6px; border-bottom:2px solid #1F4E79; padding-bottom:5px; }
    .header h1 { font-size:13px; font-weight:800; color:#1F4E79; }
    .header p  { font-size:8px; color:#555; }
    table { width:100%; border-collapse:collapse; table-layout:fixed; }
    th { background:#1F4E79; color:#fff; padding:4px 4px; text-align:left; font-size:7px; font-weight:700; text-transform:uppercase; letter-spacing:.03em; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
    td { padding:3px 4px; border-bottom:1px solid #e5e7eb; vertical-align:top; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    tr:nth-child(even) td { background:#EBF3FB; }
    .footer { margin-top:5px; font-size:7px; color:#999; display:flex; justify-content:space-between; }
    @media print {
      body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      thead { display:table-header-group; }
      tr { page-break-inside:avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${meta.label}</h1>
      <p>${rows.length} record${this.filter ? ' · filtrati per: "'+this.filter+'"' : ''}</p>
    </div>
    <p>Stampato il ${oggi}</p>
  </div>
  <table>
    <colgroup>${colgroup}</colgroup>
    <thead><tr>${thead}</tr></thead>
    <tbody>${tbody}</tbody>
  </table>
  <div class="footer">
    <span>Gestionale Dipendenti</span>
    <span>${rows.length} record — ${oggi}</span>
  </div>
  <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};<\/script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if(!w){ toast('Abilita i popup per stampare','error'); return; }
    w.document.write(html);
    w.document.close();
  },

    // ── SINCRONIZZAZIONE TABELLE COLLEGATE ───────────────────────────────────────

  // Campi da copiare da dipendenti alle tabelle collegate. Scritti in lowercase: la
  // funzione che li usa (createRelatedRows) li applicherà cercando la chiave reale
  // (case-insensitive) in ciascuna tabella di destinazione.
  _dipFields(dip){
    return {
      'id dipendente (n° socio)': dip['N° Socio']||'',
      'cognome':                  dip['Cognome']||'',
      'nome':                     dip['Nome']||'',
      'azienda':                  dip['Azienda']||'',
      'mansione':                 dip['Mansione']||'',
      'stato dipendente':         dip['Stato Dipendente']||'',
      'appalto / sede di lavoro': dip['Appalto / sede di lavoro']||'',
      'data assunzione':          dip['Data assunzione']||'',
      'codice fiscale':           dip['Codice Fiscale']||'',
      'data di nascita':          dip['Data di Nascita']||'',
      'luogo di nascita':         dip['Luogo di Nascita']||'',
    };
  },

  // Quando si aggiunge un dipendente → crea riga vuota in contratti, formazione, sorveglianza
  createRelatedRows(table, newRow){
    if(table !== 'dipendenti') return;
    const shared = this._dipFields(newRow);
    const sid = newRow['N° Socio']||'';
    if(!sid) return;

    const targets = ['contratti','formazione','sorveglianza'];
    for(const t of targets){
      const cols = Store.getCols(t);
      const row = {};
      cols.forEach(c => {
        const val = shared[c.toLowerCase().trim()];
        row[c] = val !== undefined ? val : '';
      });
      Store.addRow(t, row);
      const b = document.getElementById('badge-'+t);
      if(b) b.textContent = Store.getRows(t).length;
    }
    toast('Riga creata automaticamente in Contratti, Formazione e Sorveglianza ✓');
  },

  // Quando si modifica un dipendente → aggiorna i campi condivisi nelle righe collegate
  syncRelatedTables(table, updatedRow, idx){
    if(table !== 'dipendenti') return;
    const sid = updatedRow['N° Socio']||'';
    if(!sid) return;
    const shared = this._dipFields(updatedRow);
    const targets = ['contratti','formazione','sorveglianza'];
    let updated = 0;
    for(const t of targets){
      const rows = Store.getRows(t);
      rows.forEach((r, i) => {
        if((r['Id Dipendente (N° Socio)']||'').trim() === sid.trim()){
          const newR = {...r};
          Object.entries(shared).forEach(([k,v]) => {
            if(k in newR) newR[k] = v;
          });
          Store.updateRow(t, i, newR);
          updated++;
        }
      });
      const b = document.getElementById('badge-'+t);
      if(b) b.textContent = Store.getRows(t).length;
    }
    if(updated > 0) toast(`Aggiornate ${updated} righe collegate ✓`);
  },

    // ── EXPORT XLSX ─────────────────────────────────────────────────────────────
  exportXLSX(t){
    const rows=this.filtered.length?this.filtered:Store.getRows(t);
    const cols=Store.getCols(t).filter(c=>c&&c!=='_id');
    const meta=TABLE_META[t];
    // Build array of arrays: header + data rows
    const data=[cols];
    rows.forEach(r=>data.push(cols.map(c=>r[c]||'')));
    const ws=XLSX.utils.aoa_to_sheet(data);
    // Column widths
    ws['!cols']=cols.map(c=>({wch:Math.max(c.length,12)}));
    // Freeze top row
    ws['!freeze']={xSplit:0,ySplit:1};
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,meta.label.slice(0,31));
    XLSX.writeFile(wb,meta.label.replace(/[^a-zA-Z0-9]/g,'_')+'_'+new Date().toISOString().slice(0,10)+'.xlsx');
    toast('Export Excel completato ✓');
  },

  // ── ESPORTA GESTIONALE COMPLETO ─────────────────────────────────────────────
  async exportGestionale(){
    const base = typeof NAS_API !== 'undefined' ? NAS_API.replace('/api','') : '';

    if(base){
      // NAS: scarica ZIP con dati + PDF allegati
      try{
        toast('Preparazione backup in corso...');
        const url = base + '/backup/export';
        const a = document.createElement('a');
        a.href = url;
        a.download = 'gestionale_backup_'+new Date().toISOString().slice(0,10)+'.zip';
        a.click();
        toast('Backup ZIP scaricato (dati + allegati PDF) ✓');
      }catch(e){
        toast('Errore backup NAS: '+e.message,'error');
      }
      return;
    }

    // Modalità locale: esporta solo Excel (no PDF in localStorage)
    const tables = [
      { key:'dipendenti',   label:'Anagrafica Dipendente' },
      { key:'contratti',    label:'Contratti di Lavoro' },
      { key:'formazione',   label:'Formazione' },
      { key:'sorveglianza', label:'Sorveglianza Sanitaria' },
      { key:'aziende',      label:'Anagrafica Azienda' },
    ];
    const wb = XLSX.utils.book_new();
    for(const t of tables){
      const rows = Store.getRows(t.key);
      const cols = Store.getCols(t.key).filter(c => c && c !== '_id');
      const data = [cols];
      rows.forEach(r => data.push(cols.map(c => r[c]||'')));
      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = cols.map(c => ({ wch: Math.max(c.length, 12) }));
      ws['!freeze'] = { xSplit:0, ySplit:1 };
      XLSX.utils.book_append_sheet(wb, ws, t.label.slice(0,31));
    }
    const today = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, `Gestionale_Dipendenti_backup_${today}.xlsx`);
    toast('Backup Excel scaricato ✓');
  },

  // ── IMPORTA GESTIONALE (ZIP con PDF o XLSX) ─────────────────────────────────
  async cleanupEmptyAttachments(){
    const base = typeof NAS_API !== 'undefined' ? NAS_API.replace('/api','') : '';
    if(!base){ toast('Funzione disponibile solo con NAS configurato','error'); return; }
    if(!confirm('Rimuovere tutti gli allegati PDF da 0 byte (rotti) e i PDF duplicati (mantenendo solo la copia più recente di ognuno)? Questa operazione non è reversibile.')) return;
    try{
      const r = await fetch(`${base}/files/cleanup-empty`, { method:'DELETE' });
      const data = await r.json();
      if(r.ok){
        const parts = [];
        if(data.removedEmpty) parts.push(`${data.removedEmpty} file vuoti`);
        if(data.removedDup) parts.push(`${data.removedDup} duplicati`);
        toast(parts.length ? `Pulizia completata: rimossi ${parts.join(' e ')}` : 'Pulizia completata: nessun file da rimuovere');
      } else {
        toast('Errore pulizia: '+(data.error||'sconosciuto'),'error');
      }
    }catch(e){
      toast('Errore pulizia: '+e.message,'error');
    }
  },

  // ── Editor Layout Personalizzato (solo admin) ─────────────────────────────────
  _layoutEditState: null, // {table, sections: [{t, c:[...]}]}

  openLayoutEditor(t){
    if(!Auth.isAdmin()){ toast('Funzione riservata agli amministratori','error'); return; }
    const allCols = Store.getCols(t).filter(c=>!SKIP.has(c)&&c!=='_id');
    const currentSecs = CustomLayout.get(t) || [{t:'Dati', c:allCols}];
    // Copia profonda di lavoro, includendo anche eventuali campi non ancora assegnati a nessuna sezione
    const usedCols = new Set(currentSecs.flatMap(s=>s.c));
    const unassigned = allCols.filter(c=>!usedCols.has(c));
    const workingSecs = currentSecs.map(s=>({t:s.t, c:[...s.c]}));
    if(unassigned.length) workingSecs.push({t:'📁 Non assegnati', c:unassigned});

    this._layoutEditState = { table:t, sections:workingSecs };
    this._renderLayoutEditor();
    App.openModal();
  },

  _renderLayoutEditor(){
    const { table, sections } = this._layoutEditState;
    document.getElementById('modal-title').textContent = `🧩 Personalizza Layout — ${TABLE_META[table].label}`;

    let html = `<div style="font-size:13px;color:var(--text2);margin-bottom:14px">
      Riordina i campi con le frecce, spostali tra sezioni con il menu, o crea nuove sezioni.
      Usa 🚫 per nascondere un campo dal modulo (il dato resta salvato, semplicemente non si vede).
      Le modifiche si applicano al modulo di inserimento/modifica e alla vista dettaglio.
    </div>`;

    // Separa la sezione speciale "Campi Nascosti" (se esiste) dalle altre, per mostrarla
    // sempre in fondo con uno stile visivo distinto.
    const hiddenIdx = sections.findIndex(s=>s.__hidden);
    const normalIndices = sections.map((s,i)=>i).filter(i=>i!==hiddenIdx);

    const renderSection = (si) => {
      const sec = sections[si];
      const isHiddenSec = !!sec.__hidden;
      html += `<div class="form-section" style="margin-bottom:14px;${isHiddenSec?'opacity:.75;background:repeating-linear-gradient(45deg,#fafafa,#fafafa 10px,#f3f4f6 10px,#f3f4f6 20px)':''}">
        <div class="form-section-title" style="display:flex;align-items:center;gap:8px;justify-content:space-between">
          ${isHiddenSec
            ? `<span style="font-weight:700;font-size:13px;flex:1">🚫 Campi Nascosti <small style="color:#888;font-weight:400">(non compaiono nel modulo)</small></span>`
            : `<input type="text" value="${esc(sec.t)}" data-sec-title="${si}"
                onchange="App._layoutRenameSection(${si}, this.value)"
                style="font-weight:700;border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:13px;flex:1"/>`}
          <div style="display:flex;gap:4px">
            ${!isHiddenSec && normalIndices.indexOf(si)>0?`<button class="icon-btn" title="Sposta sezione su" onclick="App._layoutMoveSection(${si},-1)">⬆</button>`:''}
            ${!isHiddenSec && normalIndices.indexOf(si)<normalIndices.length-1?`<button class="icon-btn" title="Sposta sezione giù" onclick="App._layoutMoveSection(${si},1)">⬇</button>`:''}
            ${!isHiddenSec && sections.length>1?`<button class="icon-btn danger" title="Elimina sezione (i campi tornano in Non assegnati)" onclick="App._layoutDeleteSection(${si})">✕</button>`:''}
          </div>
        </div>
        <div style="padding:10px">`;

      if(!sec.c.length){
        html += `<div style="color:var(--text3);font-size:12px;padding:6px 0">Nessun campo in questa sezione.</div>`;
      }
      sec.c.forEach((col, ci) => {
        const otherSections = sections.map((s2,si2)=>({si2, t:s2.t})).filter(s2=>s2.si2!==si && !s2.t.startsWith('🚫'));
        html += `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border-light)">
          <span style="flex:1;font-size:13px${isHiddenSec?';color:#999;text-decoration:line-through':''}">${esc(col)}</span>
          ${isHiddenSec
            ? `<button class="icon-btn" title="Mostra di nuovo questo campo" onclick="App._layoutUnhideField(${si},${ci})">👁 Mostra</button>`
            : `<button class="icon-btn" title="Sposta su" ${ci===0?'disabled style="opacity:.3"':''} onclick="App._layoutMoveField(${si},${ci},-1)">⬆</button>
               <button class="icon-btn" title="Sposta giù" ${ci===sec.c.length-1?'disabled style="opacity:.3"':''} onclick="App._layoutMoveField(${si},${ci},1)">⬇</button>
               <select style="font-size:12px;padding:3px 6px;border:1px solid var(--border);border-radius:5px"
                 onchange="App._layoutMoveFieldToSection(${si},${ci},this.value)">
                 <option value="">↔ Sposta in...</option>
                 ${otherSections.map(s2=>`<option value="${s2.si2}">${esc(s2.t)}</option>`).join('')}
               </select>
               <button class="icon-btn danger" title="Nascondi questo campo" onclick="App._layoutHideField(${si},${ci})">🚫</button>`}
        </div>`;
      });
      html += `</div></div>`;
    };

    normalIndices.forEach(renderSection);
    if(hiddenIdx>=0) renderSection(hiddenIdx);

    html += `<button class="btn btn-ghost" style="font-size:13px;width:100%" onclick="App._layoutAddSection()">+ Nuova sezione</button>`;

    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-footer').innerHTML = `
      <button class="btn btn-ghost" style="color:var(--danger)" onclick="App._layoutResetDefault()">↺ Ripristina default</button>
      <span style="flex:1"></span>
      <button class="btn btn-ghost" onclick="App.closeModal()">Annulla</button>
      <button class="btn btn-primary" onclick="App._layoutSave()">💾 Salva Layout</button>`;
  },

  _layoutMoveField(si, ci, dir){
    const sec = this._layoutEditState.sections[si];
    const newCi = ci+dir;
    if(newCi<0 || newCi>=sec.c.length) return;
    [sec.c[ci], sec.c[newCi]] = [sec.c[newCi], sec.c[ci]];
    this._renderLayoutEditor();
  },

  _layoutMoveFieldToSection(si, ci, targetSiStr){
    if(targetSiStr===''){ this._renderLayoutEditor(); return; }
    const targetSi = parseInt(targetSiStr,10);
    const sections = this._layoutEditState.sections;
    const [col] = sections[si].c.splice(ci,1);
    sections[targetSi].c.push(col);
    this._renderLayoutEditor();
  },

  _layoutHideField(si, ci){
    const sections = this._layoutEditState.sections;
    const [col] = sections[si].c.splice(ci,1);
    let hiddenSec = sections.find(s=>s.__hidden);
    if(!hiddenSec){ hiddenSec = {t:'🚫 Campi Nascosti', c:[], __hidden:true}; sections.push(hiddenSec); }
    hiddenSec.c.push(col);
    this._renderLayoutEditor();
  },

  _layoutUnhideField(si, ci){
    const sections = this._layoutEditState.sections;
    const [col] = sections[si].c.splice(ci,1);
    // Rimette il campo nella prima sezione "normale" disponibile (non nascosta)
    let target = sections.find(s=>!s.__hidden);
    if(!target){ target = {t:'Dati', c:[]}; sections.unshift(target); }
    target.c.push(col);
    this._renderLayoutEditor();
  },

  _layoutMoveSection(si, dir){
    const sections = this._layoutEditState.sections;
    const newSi = si+dir;
    if(newSi<0 || newSi>=sections.length) return;
    [sections[si], sections[newSi]] = [sections[newSi], sections[si]];
    this._renderLayoutEditor();
  },

  _layoutRenameSection(si, newTitle){
    this._layoutEditState.sections[si].t = newTitle;
  },

  _layoutDeleteSection(si){
    const sections = this._layoutEditState.sections;
    const removed = sections.splice(si,1)[0];
    // I campi della sezione eliminata tornano in "Non assegnati" (creandola se non esiste)
    let unassignedSec = sections.find(s=>s.t==='📁 Non assegnati');
    if(!unassignedSec){ unassignedSec = {t:'📁 Non assegnati', c:[]}; sections.push(unassignedSec); }
    unassignedSec.c.push(...removed.c);
    this._renderLayoutEditor();
  },

  _layoutAddSection(){
    this._layoutEditState.sections.push({t:'Nuova Sezione', c:[]});
    this._renderLayoutEditor();
  },

  async _layoutSave(){
    const { table, sections } = this._layoutEditState;
    // Rimuove le sezioni rimaste vuote (es. "Non assegnati" se tutto è stato spostato altrove)
    const finalSections = sections.filter(s=>s.c.length>0);
    await CustomLayout.save(table, finalSections);
    toast('Layout salvato ✓');
    this.closeModal();
    if(this.table===table) this.renderTable(table);
  },

  async _layoutResetDefault(){
    if(!confirm('Ripristinare il layout originale per questa tabella? La personalizzazione attuale verrà eliminata.')) return;
    const { table } = this._layoutEditState;
    await CustomLayout.reset(table);
    toast('Layout ripristinato al default');
    this.closeModal();
    if(this.table===table) this.renderTable(table);
  },

  importGestionale(){
    const base = typeof NAS_API !== 'undefined' ? NAS_API.replace('/api','') : '';

    if(base){
      // NAS: accetta ZIP (dati + PDF) o XLSX (solo dati)
      const input = document.createElement('input');
      input.type  = 'file';
      input.accept = '.zip,.xlsx,.xls';
      input.onchange = async(e) => {
        const file = e.target.files[0]; if(!file) return;
        const isZip = file.name.toLowerCase().endsWith('.zip');

        if(isZip){
          // Carica ZIP sul NAS → ripristina tutto
          toast('Caricamento backup ZIP in corso...');
          try{
            const fd = new FormData();
            fd.append('backup', file);
            const r = await fetch(base+'/backup/import', { method:'POST', body:fd });
            if(!r.ok) throw new Error('HTTP '+r.status);
            const result = await r.json();
            toast(result.message || 'Backup ripristinato ✓');
            // Ricarica tutti i dati dal NAS
            await Store.load();
            ['dipendenti','contratti','formazione','sorveglianza','aziende'].forEach(t=>{
              const b=document.getElementById('badge-'+t); if(b) b.textContent=Store.getRows(t).length;
            });
            this.renderDash();
          }catch(err){
            toast('Errore ripristino: '+err.message,'error');
          }
        } else {
          // XLSX: importa solo i dati (come prima)
          this.importXLSX('dipendenti');
        }
      };
      input.click();
    } else {
      // Modalità locale: solo XLSX
      this.importXLSX('dipendenti');
    }
  },

    // ── IMPORT XLSX ──────────────────────────────────────────────────────────────
  // Mapping: foglio xlsx → chiave tabella interna
  _sheetMap(){
    return {
      // Nomi esatti del file esportato
      'Anagrafica Dipendente':  'dipendenti',
      'Contratti di Lavoro':    'contratti',
      'Formazione':             'formazione',
      'Sorveglianza Sanitaria': 'sorveglianza',
      'Anagrafica Azienda':     'aziende',
      // Varianti nomi
      'Anagrafica Aziende':     'aziende',
      'Scheda Anagrafica Dipendente': 'dipendenti',
      'Gestione Contratti di Lavoro': 'contratti',
      'Dipendenti':             'dipendenti',
      'Contratti':              'contratti',
      'Aziende':                'aziende',
    };
  },

  importXLSX(targetTable){
    const input=document.createElement('input');
    input.type='file'; input.accept='.xlsx,.xls,.XLS,.XLSX';
    input.onchange=async(e)=>{
      const file=e.target.files[0]; if(!file)return;
      try{
        if(typeof XLSX === 'undefined'){
          toast('Libreria Excel non caricata — verifica la connessione internet','error');
          return;
        }
        const buf=await file.arrayBuffer();
        // Supporta sia .xlsx che .xls
        const wb=XLSX.read(new Uint8Array(buf),{type:'array',raw:false,cellDates:false,cellText:true,WTF:false});
        const sheetMap=this._sheetMap();

        // Detect if this is the full multi-sheet gestionale or a single sheet
        const matchedSheets=wb.SheetNames.filter(n=>sheetMap[n]);
        const isFullFile=matchedSheets.length>1;

        if(isFullFile){
          // Multi-sheet: import all sheets at once
          const preview=matchedSheets.map(n=>{
            const ws=wb.Sheets[n];
            const rows=XLSX.utils.sheet_to_json(ws,{raw:false,defval:''});
            return `• ${n}: ${rows.length} righe`;
          }).join('\n');
          document.getElementById('confirm-title').textContent='📂 Importa Gestionale Completo';
          document.getElementById('confirm-msg').textContent=
            `Trovati ${matchedSheets.length} fogli nel file "${file.name}":\n${preview}\n\nSostituisce TUTTI i dati esistenti.`;
          this._setupConfirmBtns('Importa tutto',async()=>{
            let total=0;
            for(const sheetName of matchedSheets){
              const t=sheetMap[sheetName];
              const ws=wb.Sheets[sheetName];
              const rows=XLSX.utils.sheet_to_json(ws,{raw:false,defval:''});
              await this._doReplace(t,rows);
              total+=rows.length;
            }
            toast(`Importati ${total} record su ${matchedSheets.length} tabelle ✓`);
            // Aggiorna tutti i badge
            ['dipendenti','contratti','formazione','sorveglianza','aziende'].forEach(t=>{
              const b=document.getElementById('badge-'+t);
              if(b) b.textContent=Store.getRows(t).length;
            });
            if(this.view==='dashboard') this.renderDash();
          });
        } else {
          // Single sheet: import into target table
          const sheetName=wb.SheetNames[0];
          const ws=wb.Sheets[sheetName];
          const rows=XLSX.utils.sheet_to_json(ws,{raw:false,defval:''});
          if(!rows.length){toast('File vuoto','error');return;}
          const tableName=sheetMap[sheetName]||targetTable;
          document.getElementById('confirm-title').textContent='Importa dati';
          document.getElementById('confirm-msg').textContent=
            `Trovate ${rows.length} righe in "${sheetName}".\nAggiungere ai dati esistenti o sostituire tutto?`;
          const existingBtns=document.querySelector('.confirm-box .btns');
          // Add "Aggiungi" button
          let addBtn=document.getElementById('_addBtn');
          if(!addBtn){addBtn=document.createElement('button');addBtn.id='_addBtn';existingBtns.insertBefore(addBtn,document.getElementById('confirm-ok'));}
          addBtn.className='btn btn-primary';addBtn.textContent='Aggiungi';addBtn.style.display='';
          addBtn.onclick=async()=>{await this._doAppend(tableName,rows);this._resetConfirm();this.closeConfirm();};
          document.getElementById('confirm-ok').textContent='Sostituisci';
          document.getElementById('confirm-ok').className='btn btn-danger';
          document.getElementById('confirm-ok').onclick=async()=>{await this._doReplace(tableName,rows);this._resetConfirm();this.closeConfirm();};
          document.getElementById('confirm-overlay').classList.add('open');
          return;
        }
      }catch(err){
        console.error(err);
        toast('Errore lettura file: '+err.message,'error');
      }
    };
    input.click();
  },

  _setupConfirmBtns(label, fn){
    // Hide extra add button if visible
    const ab=document.getElementById('_addBtn'); if(ab)ab.style.display='none';
    document.getElementById('confirm-ok').textContent=label;
    document.getElementById('confirm-ok').className='btn btn-primary';
    document.getElementById('confirm-ok').onclick=()=>{fn();this._resetConfirm();this.closeConfirm();};
    document.getElementById('confirm-overlay').classList.add('open');
  },

  _resetConfirm(){
    const ab=document.getElementById('_addBtn'); if(ab)ab.style.display='none';
    document.getElementById('confirm-ok').textContent='Elimina';
    document.getElementById('confirm-ok').className='btn btn-danger';
  },

  // Mappa riga xlsx → riga interna, gestendo nomi colonna esatti e varianti
  _mapRow(t, rawRow){
    const storeCols=Store.getCols(t);
    const row={};

    // Normalizza le chiavi della riga raw per confronto case-insensitive
    const rawKeys=Object.keys(rawRow);
    const rawLower={};
    rawKeys.forEach(k=>{ rawLower[k.toLowerCase().trim()]=k; });

    for(const col of storeCols){
      // 1. Corrispondenza esatta
      if(rawRow[col]!==undefined && rawRow[col]!==null){ row[col]=String(rawRow[col]||'').trim(); continue; }
      // 2. Corrispondenza case-insensitive
      const lc=col.toLowerCase().trim();
      if(rawLower[lc]){ const v=rawRow[rawLower[lc]]; row[col]=String(v||'').trim(); continue; }
      // 3. Varianti note
      const aliases={
        'n° socio':               ['n socio','n.socio','nsocio','numero socio'],
        'id dipendente (n° socio)':['id dipendente','id_dipendente','numero socio','n° socio','n socio'],
        'codice fiscale':         ['codice fiscale','codicefiscale','cf','cod. fiscale','cod fiscale'],
        'stato dipendente':       ['stato dipendente','stato_dipendente','stato','status dipendente','stato dip'],
        'stato dipendente':       ['stato dipendente','stato_dipendente'],
        'data assunzione':        ['data assunzione','data_assunzione','data di assunzione','assunzione'],
        'tipologia corso':        ['tipo formazione','tipologia corso','tipo corso','tipo_corso'],
        'scadenza idoneità':      ['scadenza idoneita','scadenza idoneit','scad. idoneità','scad idoneita'],
        'stato idoneità':         ['stato idoneita','stato idoneit','stato_idoneità','giudizio'],
        'tipologia contrattuale': ['tipo contratto','tipologia contratto','tipo_contratto'],
        'data di nascita':        ['data nascita','data_nascita','nascita','datanascita'],
        'luogo di nascita':       ['luogo nascita','luogo_nascita','città nascita'],
        'appalto / sede di lavoro':['appalto','sede lavoro','sede di lavoro','appalto sede'],
        'azienda':                ['ragione sociale','azienda','società','societa'],
        'mansione':               ['mansione','qualifica','ruolo','job'],
        'telefono cellulare':     ['telefono','cellulare','cell','tel','recapito telefonico'],
        'data scadenza permesso soggiorno':['scadenza permesso','scad. permesso','scadenza ps'],
      };
      const found=Object.entries(aliases).find(([k])=>k===lc);
      if(found){
        for(const alias of found[1]){
          if(rawLower[alias]){row[col]=String(rawRow[rawLower[alias]]||'');break;}
        }
        if(row[col]===undefined)row[col]='';
        continue;
      }
      row[col]='';
    }
    return row;
  },

  // Validazione "intelligente" di una riga raw, prima del mapping. Oltre a scartare le righe
  // completamente vuote, per Dipendenti richiede che Cognome o Nome siano compilati nei campi
  // anagrafici principali — questo esclude le righe spurie/vuote che capitano negli export
  // QuintaDB (es. righe placeholder per blocchi di sotto-tabelle annidate senza un dipendente reale).
  _isValidImportRow(t, rawRow){
    const hasAnyValue = Object.values(rawRow).some(v=>v!==null&&v!==undefined&&String(v).trim()!=='');
    if(!hasAnyValue) return false;

    if(t==='dipendenti'){
      const cognome = String(rawRow['Cognome']||'').trim();
      const nome = String(rawRow['Nome']||'').trim();
      if(!cognome && !nome) return false;
    }

    return true;
  },

  async _doReplace(t,rawRows){
    // Salta righe completamente vuote o "fantasma" (intestazioni ripetute per errore)
    const validRows=rawRows.filter(r=>this._isValidImportRow(t,r));
    // Garantisce che le colonne non siano mai vuote (es. se il NAS non le aveva ancora inizializzate)
    if(!Store.data[t].columns || !Store.data[t].columns.length){
      Store.data[t].columns = JSON.parse(JSON.stringify(EMBEDDED_DATA[t].columns));
    }
    const pairs = validRows.map(r=>{
      const row=this._mapRow(t,r);
      row._id=Date.now().toString(36)+Math.random().toString(36).slice(2);
      return {row, rawRow:r};
    });
    Store.data[t].rows = pairs.map(p=>p.row);
    Store.save(t);
    // Sincronizzazione universale: se è un import su una delle 4 tabelle collegate, propaga
    // i campi condivisi (Stato Dipendente, Mansione, ecc.) verso tutte le altre (vedi
    // addRow/updateRow, qui bypassati per efficienza in import massivi).
    if(['dipendenti','contratti','formazione','sorveglianza'].includes(t)){
      Store.getRows(t).forEach(row => Store._syncAllTablesForSocio(row));
    }
    // Direzione inversa: se è un import di Contratti/Formazione/Sorveglianza, crea
    // automaticamente in Dipendenti i record mancanti per N° Socio non ancora presenti.
    if(['contratti','formazione','sorveglianza'].includes(t)){
      Store.getRows(t).forEach(row => Store._ensureDipendenteExists(row));
    }
    const b=document.getElementById('badge-'+t); if(b)b.textContent=Store.getRows(t).length;
    if(this.table===t) this.renderTable(t);
    // Se siamo nella dashboard, aggiorna la dashboard
    if(this.view==='dashboard') this.renderDash();

    // Scarica e allega i PDF collegati nel vecchio sistema (se il NAS è configurato e ci sono link)
    await this._importAttachmentsForRows(t, pairs);

    // Estrae dai blocchi annidati (Riepilogo Contratti/Formazione/Sorveglianza) i dati reali
    // e crea/aggiorna i record corrispondenti in quelle tabelle, scaricando anche gli allegati.
    if(t==='dipendenti') await this._syncNestedTablesFromDipendenti(rawRows, pairs);
  },

  async _doAppend(t,rawRows){
    const validRows=rawRows.filter(r=>this._isValidImportRow(t,r));
    // Garantisce che le colonne non siano mai vuote (es. se il NAS non le aveva ancora inizializzate)
    if(!Store.data[t].columns || !Store.data[t].columns.length){
      Store.data[t].columns = JSON.parse(JSON.stringify(EMBEDDED_DATA[t].columns));
    }
    const pairs = [];
    validRows.forEach(r=>{
      const row=this._mapRow(t,r);
      Store.addRow(t,row);
      pairs.push({row, rawRow:r});
    });
    const b=document.getElementById('badge-'+t); if(b)b.textContent=Store.getRows(t).length;
    if(this.table===t) this.renderTable(t);

    await this._importAttachmentsForRows(t, pairs);

    if(t==='dipendenti') await this._syncNestedTablesFromDipendenti(rawRows, pairs);
  },

  // Per ogni riga importata, scarica eventuali PDF collegati (vecchi link QuintaDB) e li allega.
  // Mostra un toast di riepilogo al termine. Richiede NAS configurato; altrimenti viene saltato.
  async _importAttachmentsForRows(t, pairs){
    if(!PDF_LINK_COLUMNS[t]){ console.log('_importAttachmentsForRows: nessuna colonna PDF nota per', t); return; }
    if(!Allegati.base()){ console.log('_importAttachmentsForRows: NAS non configurato, salto'); return; }

    const hasAnyLink = pairs.some(p=>
      Object.keys(PDF_LINK_COLUMNS[t]).some(col=>{
        const v = p.rawRow[col];
        return v && Allegati._extractPdfUrls(v).length>0;
      })
    );
    console.log('_importAttachmentsForRows: tabella', t, '- righe totali', pairs.length, '- hasAnyLink:', hasAnyLink);
    if(!hasAnyLink){
      // Diagnostica: mostra cosa c'era davvero nelle colonne attese, per capire perché non trova link
      const sample = pairs[0]?.rawRow;
      if(sample){
        Object.keys(PDF_LINK_COLUMNS[t]).forEach(col=>{
          console.log('  colonna "'+col+'" nella prima riga:', JSON.stringify(sample[col]));
        });
      }
      return;
    }

    toast(`Download allegati PDF in corso (potrebbe richiedere qualche minuto)...`);
    let totalOk=0, totalFail=0, totalSkippedDup=0, rowsWithLinks=0;
    const failedRecords = [];
    for(const {row, rawRow} of pairs){
      const hasLink = Object.keys(PDF_LINK_COLUMNS[t]).some(col=>{
        const v=rawRow[col]; return v && Allegati._extractPdfUrls(v).length>0;
      });
      if(!hasLink) continue;
      rowsWithLinks++;
      const result = await Allegati.importFromRow(t, rawRow, row._id);
      totalOk += result.ok||0;
      totalFail += result.fail||0;
      totalSkippedDup += result.skippedDup||0;
      if(result.fail>0){
        const nome = `${rawRow['Cognome']||''} ${rawRow['Nome']||''}`.trim() || row._id;
        failedRecords.push(`${nome} (${result.fail} falliti)`);
      }
    }
    if(rowsWithLinks>0){
      toast(`Allegati importati: ${totalOk} ok${totalFail?`, ${totalFail} falliti`:''}${totalSkippedDup?`, ${totalSkippedDup} già presenti (saltati)`:''} (${rowsWithLinks} record con link)`, totalFail?'error':'success');
      if(failedRecords.length){
        console.warn('Record con almeno un allegato fallito:', failedRecords);
        toast(`Allegati falliti per: ${failedRecords.slice(0,5).join(', ')}${failedRecords.length>5?` e altri ${failedRecords.length-5}`:''} — vedi console per dettagli`, 'error');
      }
    }
  },

  // Estrae dai blocchi annidati del file "Scheda Anagrafica Dipendenti" (Riepilogo Dati
  // contrattuali, Riepilogo Formazione, Riepilogo Sorveglianza Sanitaria) i dati REALI
  // (quando compilati — QuintaDB a volte lascia solo l'etichetta del campo come placeholder)
  // e li usa per CREARE un nuovo record o AGGIORNARE quello esistente nella tabella
  // corrispondente (Contratti, Formazione, Sorveglianza), incrociando per N° Socio.
  // Scarica anche gli eventuali PDF collegati come allegati. Va eseguita dopo aver importato
  // i Dipendenti (così il blocco annidato di ogni riga è disponibile per l'estrazione).
  // IMPORTANTE: nel file "Scheda Anagrafica Dipendenti", il blocco annidato con i dati REALI
  // di Contratti/Formazione/Sorveglianza non si trova nella stessa riga del dipendente, ma
  // nella riga IMMEDIATAMENTE SUCCESSIVA (una riga "fantasma" senza Cognome/Nome, che porta
  // solo questi dati aggiuntivi). Questa funzione scorre l'array originale (non filtrato) per
  // ricostruire questa associazione, poi crea/aggiorna i record nelle tabelle corrispondenti.
  async _syncNestedTablesFromDipendenti(rawRows, dipendentiPairs){
    const normalize = s => String(s||'').trim().replace(',', '.').toUpperCase();
    const hasNas = !!Allegati.base();

    // Mappa N° Socio (normalizzato) → _id del dipendente appena importato (per riferimento)
    const idByNSocio = {};
    dipendentiPairs.forEach(({row})=>{
      const ns = normalize(row['N° Socio']);
      if(ns) idByNSocio[ns] = row._id;
    });

    // Costruisce le coppie (rigaDipendente, rigaDatiAnnidati) scorrendo l'array originale:
    // ogni riga con Cognome/Nome è un dipendente; se la riga successiva non ha Cognome/Nome,
    // si presume porti i dati annidati reali per quel dipendente.
    const employeeDataPairs = [];
    for(let i=0; i<rawRows.length; i++){
      const r = rawRows[i];
      const hasIdentity = String(r['Cognome']||'').trim() || String(r['Nome']||'').trim();
      if(!hasIdentity) continue;
      const next = rawRows[i+1];
      const nextIsDataRow = next && !String(next['Cognome']||'').trim() && !String(next['Nome']||'').trim();
      employeeDataPairs.push({ employeeRow: r, dataRow: nextIsDataRow ? next : r });
    }

    let summary = { contratti:{created:0,updated:0}, formazione:{created:0,updated:0}, sorveglianza:{created:0,updated:0} };
    let attachOk=0, attachFail=0;

    for(const targetTable of ['contratti','formazione','sorveglianza']){
      const blockCfg = NESTED_BLOCKS[targetTable];
      let tableChanged = false;

      for(const {employeeRow, dataRow} of employeeDataPairs){
        const keys = Object.keys(dataRow);
        const startIdx = keys.indexOf(blockCfg.startColumn);
        if(startIdx===-1) continue;
        const endIdx = blockCfg.endColumn ? keys.indexOf(blockCfg.endColumn) : keys.length;
        if(blockCfg.endColumn && (endIdx===-1 || endIdx<=startIdx)) continue;

        // N° Socio è sempre il primo campo del blocco (offset 0). Se manca o è solo il
        // placeholder, usa il N° Socio del dipendente (riga principale) come fallback.
        let nSocioRaw = String(dataRow[keys[startIdx]]||'').trim();
        if(!nSocioRaw || nSocioRaw === blockCfg.fields[0]?.label){
          nSocioRaw = String(employeeRow['N° Socio']||'').trim();
        }
        if(!nSocioRaw) continue;
        const nSocioNorm = normalize(nSocioRaw);

        // Estrae i campi testuali reali (scarta i placeholder identici all'etichetta)
        const extracted = {};
        let hasAnyRealField = false;
        for(const [offsetStr, cfg] of Object.entries(blockCfg.fields)){
          const offset = parseInt(offsetStr,10);
          const colIdx = startIdx + offset;
          if(colIdx>=endIdx) continue;
          const raw = String(dataRow[keys[colIdx]]||'').trim();
          if(!raw || raw === cfg.label) continue; // non compilato: resta il placeholder o è vuoto
          extracted[cfg.field] = raw;
          if(cfg.field !== 'Id Dipendente (N° Socio)') hasAnyRealField = true;
        }
        if(!hasAnyRealField) continue; // nessun dato reale per questo dipendente in questa tabella

        // Trova il record esistente per N° Socio, o prepara la creazione di uno nuovo
        const existingIdx = Store.getRows(targetTable).findIndex(r=>
          normalize(r['Id Dipendente (N° Socio)']) === nSocioNorm
        );

        if(existingIdx >= 0){
          const existing = Store.getRows(targetTable)[existingIdx];
          const merged = {...existing, ...extracted};
          merged['Cognome'] = employeeRow['Cognome'] || merged['Cognome'];
          merged['Nome'] = employeeRow['Nome'] || merged['Nome'];
          merged['Azienda'] = employeeRow['Azienda'] || merged['Azienda'];
          Store.data[targetTable].rows[existingIdx] = merged;
          summary[targetTable].updated++;
        } else {
          const newRow = {
            'Id Dipendente (N° Socio)': nSocioRaw,
            'Cognome': employeeRow['Cognome']||'',
            'Nome': employeeRow['Nome']||'',
            'Azienda': employeeRow['Azienda']||'',
            ...extracted,
          };
          newRow._id = Date.now().toString(36)+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2,5);
          Store.data[targetTable].rows.push(newRow);
          summary[targetTable].created++;
        }
        tableChanged = true;

        // Scarica eventuali PDF collegati per questo blocco, se il NAS è configurato
        if(hasNas && Object.keys(blockCfg.attachmentOffsets).length){
          const recordIdx = existingIdx >= 0 ? existingIdx : Store.data[targetTable].rows.length - 1;
          const recordId = Store.data[targetTable].rows[recordIdx]._id;
          for(const [offsetStr, slot] of Object.entries(blockCfg.attachmentOffsets)){
            const colIdx = startIdx + parseInt(offsetStr,10);
            if(colIdx>=endIdx) continue;
            const cellValue = dataRow[keys[colIdx]];
            if(!cellValue || !String(cellValue).trim()) continue;
            const urls = Allegati._extractPdfUrls(cellValue);
            if(!urls.length) continue;
            const existingNames = await Allegati._getExistingAttachmentNames(recordId, slot);
            for(const url of urls){
              const originalName = decodeURIComponent(url.split('/').pop()||'allegato.pdf');
              const sanitizedName = Allegati._sanitizeFilename(originalName);
              if(existingNames.has(sanitizedName)){ continue; } // già presente: non lo riscarica
              try{
                const r = await fetch(`${Allegati.base()}/files/import-from-url/${recordId}/${slot}`, {
                  method:'POST',
                  headers:{'Content-Type':'application/json'},
                  body: JSON.stringify({url, originalName})
                });
                if(r.ok){ attachOk++; existingNames.add(sanitizedName); } else attachFail++;
              }catch(e){
                console.warn('_syncNestedTablesFromDipendenti: errore download allegato', url, e.message);
                attachFail++;
              }
            }
          }
        }
      }

      if(tableChanged) Store.save(targetTable);
    }

    // Aggiorna i badge e la tabella visibile, se serve
    ['contratti','formazione','sorveglianza'].forEach(t=>{
      const b=document.getElementById('badge-'+t); if(b) b.textContent=Store.getRows(t).length;
      if(App.table===t) App.renderTable(t);
    });

    const totalCreated = summary.contratti.created+summary.formazione.created+summary.sorveglianza.created;
    const totalUpdated = summary.contratti.updated+summary.formazione.updated+summary.sorveglianza.updated;
    if(totalCreated || totalUpdated){
      toast(`Sincronizzazione da Dipendenti: Contratti +${summary.contratti.created}/~${summary.contratti.updated}, `+
            `Formazione +${summary.formazione.created}/~${summary.formazione.updated}, `+
            `Sorveglianza +${summary.sorveglianza.created}/~${summary.sorveglianza.updated}`+
            `${attachOk||attachFail?` — Allegati: ${attachOk} ok${attachFail?`, ${attachFail} falliti`:''}`:''}`,
            'success');
    }
  },

  // Kept for backward compat
  data_replace(t,rows){ this._doReplace(t,rows); },
  data_append(t,rows){ this._doAppend(t,rows); },

  // ── SVUOTA TABELLA ────────────────────────────────────────────────────────────
  clearTable(t){
    const cascadeWarning = t==='dipendenti'
      ? ' Verranno svuotate anche le tabelle Contratti, Formazione e Sorveglianza Sanitaria.'
      : '';
    document.getElementById('confirm-title').textContent='⚠ Svuota tabella';
    document.getElementById('confirm-msg').textContent=
      `Sei sicuro di voler eliminare TUTTI i ${Store.getRows(t).length} record di "${TABLE_META[t].label}"? Operazione irreversibile.${cascadeWarning}`;
    document.getElementById('confirm-ok').textContent='Svuota tutto';
    document.getElementById('confirm-ok').className='btn btn-danger';
    document.getElementById('confirm-ok').onclick=()=>{
      Store.data[t].rows=[];
      Store.save(t);
      // Cascata: svuotando Dipendenti, svuota anche le tabelle collegate (sarebbero
      // record orfani senza nessun dipendente a cui appartenere)
      if(t==='dipendenti'){
        ['contratti','formazione','sorveglianza'].forEach(tt=>{
          Store.data[tt].rows=[];
          Store.save(tt);
          const b=document.getElementById('badge-'+tt); if(b) b.textContent=0;
          if(this.table===tt) this.renderTable(tt);
        });
      }
      const b=document.getElementById('badge-'+t); if(b)b.textContent=0;
      this.closeConfirm();
      document.getElementById('confirm-ok').textContent='Elimina';
      this.renderTable(t);
      toast('Tabella svuotata','error');
    };
    document.getElementById('confirm-overlay').classList.add('open');
  },

  // ── MODAL ──────────────────────────────────────────────────────────────────
  openModal(){ document.getElementById('modal-overlay').classList.add('open'); },
  closeModal(e){ if(e&&e.target!==document.getElementById('modal-overlay'))return; document.getElementById('modal-overlay').classList.remove('open'); },
  closeConfirm(e){ if(e&&e.target!==document.getElementById('confirm-overlay'))return; document.getElementById('confirm-overlay').classList.remove('open'); },
  handleKey(e){
    if(e.key==='Escape'){this.closeModal();this.closeConfirm();}
    if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){
      const b=document.getElementById('btn-save-form')||document.getElementById('btn-save-user');
      if(b)b.click();
    }
  }
};

// ─── BOOT ─────────────────────────────────────────────────────────────────────
window.addEventListener('keydown',e=>App.handleKey(e));
['login-user','login-pass'].forEach(id=>document.getElementById(id)?.addEventListener('keydown',e=>{if(e.key==='Enter')App.login();}));
(async()=>{
  try{ await Store.load(); }catch(e){ console.error('Store error:',e); }
  try{ await Promise.all(['dipendenti','contratti','formazione','sorveglianza','aziende'].map(t=>CustomLayout.load(t))); }catch(e){ console.warn('CustomLayout boot load error:',e); }
  try{ await Promise.all(['dipendenti','contratti','formazione','sorveglianza','dashboard'].map(t=>CustomLabels.load(t))); }catch(e){ console.warn('CustomLabels boot load error:',e); }
  try{ await Promise.all(['dipendenti','contratti','formazione','sorveglianza'].map(t=>CustomQuickSearches.load(t))); }catch(e){ console.warn('CustomQuickSearches boot load error:',e); }
  document.getElementById('loading').classList.add('hidden');
  const _sess=Auth.current();
  if(_sess){ document.getElementById('login-screen').style.display='none'; App.initApp(_sess); }
  else      { document.getElementById('login-screen').style.display='flex'; }
})();
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});

// ─── RICERCA AVANZATA ─────────────────────────────────────────────────────────

// Campi disponibili per tabella con tipo e opzioni
const ADV_FIELDS = {
  dipendenti: [
    { label:'N° Socio',            field:'N° Socio',                          type:'text' },
    { label:'Cognome',             field:'Cognome',                           type:'text' },
    { label:'Nome',                field:'Nome',                              type:'text' },
    { label:'Azienda',             field:'Azienda',                           type:'select', opts:'aziende' },
    { label:'Stato Dipendente',    field:'Stato Dipendente',                  type:'select', opts:'statoDip' },
    { label:'Mansione',            field:'Mansione',                          type:'select', opts:'mansioni' },
    { label:'Sesso',               field:'Sesso',                             type:'select', opts:'sesso' },
    { label:'Codice Fiscale',      field:'Codice Fiscale',                    type:'text' },
    { label:'Cittadinanza',        field:'Cittadinanza',                      type:'text' },
    { label:'Luogo di Nascita',    field:'Luogo di Nascita',                  type:'text' },
    { label:'Data di Nascita',     field:'Data di Nascita',                   type:'date' },
    { label:'Appalto / Sede',      field:'Appalto / sede di lavoro',          type:'text' },
    { label:'Data assunzione',     field:'Data assunzione',                   type:'date' },
    { label:'Tipo Permesso',       field:'Tipo permesso',                     type:'select', opts:'tipoPermesso' },
    { label:'Scad. Permesso',      field:'Data scadenza Permesso Soggiorno',  type:'date' },
    { label:'Data rilascio Permesso', field:'Data rilascio Permesso Soggiorno', type:'date' },
    { label:'Stato Socio',         field:'Stato Socio',                       type:'select', opts:'statoSocio' },
    { label:'Comune Residenza',    field:'Comune Residenza',                  type:'text' },
    { label:'Provincia Residenza', field:'Provincia Residenza',               type:'text' },
    { label:'Telefono',            field:'Telefono Cellulare',                type:'text' },
    { label:'Email',               field:'Email',                             type:'text' },
    { label:'Tipo Documento',      field:'Tipo Documento',                    type:'select', opts:'tipoDoc' },
    { label:'Scadenza Documento',  field:'Scadenza Documento',                type:'date' },
  ],
  contratti: [
    { label:'ID Socio',            field:'Id Dipendente (N° Socio)',           type:'text' },
    { label:'Cognome',             field:'Cognome',                            type:'text' },
    { label:'Nome',                field:'Nome',                               type:'text' },
    { label:'Azienda',             field:'Azienda',                            type:'select', opts:'aziende' },
    { label:'Stato Dipendente',    field:'Stato Dipendente',                   type:'select', opts:'statoDip' },
    { label:'Mansione',            field:'Mansione',                           type:'select', opts:'mansioni' },
    { label:'Tipologia contrattuale', field:'Tipologia contrattuale',          type:'select', opts:'tipoContratto' },
    { label:'Tipo orario',         field:'Tipologia orario contrattuale',      type:'select', opts:'orario' },
    { label:'Livello',             field:'Livello',                            type:'select', opts:'livello' },
    { label:'Ore settimanali',     field:'Ore contrattuali settimanali',       type:'select', opts:'oreSettimanali' },
    { label:'CCNL',                field:'CCNL',                               type:'text' },
    { label:'Data inizio',         field:'Data inizio',                        type:'date' },
    { label:'Data fine',           field:'Data fine',                          type:'date' },
    { label:'Scadenza Contratto',  field:'Scadenza Contratto',                 type:'date' },
    { label:'Data assunzione',     field:'Data Assunzione',                    type:'date' },
    { label:'Causa fine rapporto', field:'Causa fine rapporto',                type:'select', opts:'causaFine' },
    { label:'Data fine rapporto',  field:'Data fine rapporto',                 type:'date' },
    { label:'Requisiti Incentivi', field:'Requisiti Incentivi',                type:'select', opts:'incentivi' },
    { label:'Assistenza Sanitaria',field:'Assistenza Sanitaria integrativa',   type:'select', opts:'assistenza' },
    { label:'Data Proroga 1',      field:'Data Proroga 1',                     type:'date' },
    { label:'Data Proroga 2',      field:'Data Proroga 2',                     type:'date' },
    { label:'Data Proroga 3',      field:'Data Proroga 3',                     type:'date' },
    { label:'Data Proroga 4',      field:'Data Proroga 4',                     type:'date' },
    { label:'Appalto / Sede',      field:'Appalto / sede di lavoro',           type:'text' },
  ],
  formazione: [
    { label:'ID Socio',            field:'Id Dipendente (N° Socio)',           type:'text' },
    { label:'Cognome',             field:'Cognome',                            type:'text' },
    { label:'Nome',                field:'Nome',                               type:'text' },
    { label:'Data di Nascita',     field:'Data di nascita',                    type:'date' },
    { label:'Azienda',             field:'Azienda',                            type:'select', opts:'aziende' },
    { label:'Stato Dipendente',    field:'Stato Dipendente',                   type:'select', opts:'statoDip' },
    { label:'Mansione',            field:'Mansione',                           type:'select', opts:'mansioni' },
    { label:'Tipologia Corso',     field:'Tipologia Corso',                    type:'select', opts:'tipologiaCorso' },
    { label:'Stato Corso',         field:'Stato Corso',                        type:'select', opts:'statoCoro' },
    { label:'Docente',             field:'Docente',                            type:'text' },
    { label:'Ore',                 field:'Ore',                                type:'text' },
    { label:'Data Corso',          field:'Data Corso',                         type:'date' },
    { label:'Scadenza Corso',      field:'Scadenza Corso',                     type:'date' },
    { label:'Appalto / Sede',      field:'Appalto / sede di lavoro',           type:'text' },
  ],
  sorveglianza: [
    { label:'ID Socio',            field:'Id Dipendente (N° Socio)',           type:'text' },
    { label:'Cognome',             field:'Cognome',                            type:'text' },
    { label:'Nome',                field:'Nome',                               type:'text' },
    { label:'Data di Nascita',     field:'Data di nascita',                    type:'date' },
    { label:'Azienda',             field:'Azienda',                            type:'select', opts:'aziende' },
    { label:'Stato Dipendente',    field:'Stato dipendente',                   type:'select', opts:'statoDip' },
    { label:'Mansione',            field:'Mansione',                           type:'select', opts:'mansioni' },
    { label:'Stato Idoneità',      field:'Stato idoneità',                     type:'select', opts:'idoneo' },
    { label:'Analisi',             field:'Analisi',                            type:'select', opts:'analisi' },
    { label:'Laboratorio',         field:'Laboratorio Analisi',                type:'select', opts:'labAnalisi' },
    { label:'Medico',              field:'Medico',                             type:'text' },
    { label:'Data visita medica',  field:'Data visita medica',                 type:'date' },
    { label:'Scadenza Idoneità',   field:'Scadenza Idoneità',                  type:'date' },
    { label:'Data Analisi',        field:'Data Analisi',                       type:'date' },
    { label:'Appalto / Sede',      field:'Appalto / sede di lavoro',           type:'text' },
  ],
  aziende: [
    { label:'Denominazione',       field:'Denominazione Ditta',                type:'text' },
    { label:'Partita IVA',         field:'Partita IVA',                        type:'text' },
    { label:'Codice ATECO',        field:'Codice ATECO',                       type:'text' },
    { label:'PEC',                 field:'PEC',                                type:'text' },
    { label:'Email',               field:'Email',                              type:'text' },
  ],
};

// Operatori per tipo di campo
const ADV_OPS_TEXT = [
  { value:'contains',      label:'contiene' },
  { value:'not_contains',  label:'non contiene' },
  { value:'is',            label:'uguale a' },
  { value:'is_not',        label:'diverso da' },
  { value:'starts_with',   label:'inizia con' },
  { value:'ends_with',     label:'termina con' },
  { value:'is_empty',      label:'è vuoto' },
  { value:'is_not_empty',  label:'non è vuoto' },
];
const ADV_OPS_SELECT = [
  { value:'is',            label:'è uguale a' },
  { value:'is_not',        label:'non è uguale a' },
  { value:'is_empty',      label:'è vuoto' },
  { value:'is_not_empty',  label:'non è vuoto' },
];
const ADV_OPS_DATE = [
  { value:'is',            label:'è uguale a' },
  { value:'before',        label:'prima del' },
  { value:'after',         label:'dopo il' },
  { value:'between',       label:"nell'intervallo" },
  { value:'today',         label:'oggi' },
  { value:'yesterday',     label:'ieri' },
  { value:'last_7_days',   label:'ultimi 7 giorni' },
  { value:'last_30_days',  label:'ultimi 30 giorni' },
  { value:'last_60_days',  label:'ultimi 60 giorni' },
  { value:'last_90_days',  label:'ultimi 90 giorni' },
  { value:'last_120_days', label:'ultimi 120 giorni' },
  { value:'next_7_days',   label:'prossimi 7 giorni' },
  { value:'next_30_days',  label:'prossimi 30 giorni' },
  { value:'next_60_days',  label:'prossimi 60 giorni' },
  { value:'next_90_days',  label:'prossimi 90 giorni' },
  { value:'next_120_days', label:'prossimi 120 giorni' },
  { value:'this_month',    label:'questo mese' },
  { value:'last_month',    label:'mese scorso' },
  { value:'this_year',     label:"quest'anno" },
  { value:'is_empty',      label:'è vuoto' },
  { value:'is_not_empty',  label:'non è vuoto' },
];

let _advRowCount = 0;
let _advTable = '';
let _advCriteria = [];

App.advCriteria = [];
App.advCustomFilterKey = null;
App.advCompanyFilter = null;

App.openAdvSearch = function(t){
  _advTable = t;
  _advRowCount = 0;
  App.advCriteria = [];
  App.advCustomFilterKey = null;
App.advCompanyFilter = null;

  document.getElementById('modal-title').textContent = '🔍 Ricerca Avanzata — '+TABLE_META[t].label;
  document.getElementById('modal-body').innerHTML = `
    <div class="adv-info">
      Aggiungi uno o più criteri. Tra un criterio e l'altro appare il connettore
      <strong style="color:var(--accent)">AND</strong> (devono essere entrambi veri) oppure
      <strong style="color:var(--warn)">OR</strong> (basta uno dei due) — cliccaci sopra per cambiarlo.
    </div>
    <div id="adv-rows"></div>
    <button type="button" class="btn btn-ghost" style="margin-top:12px;font-size:13px;color:var(--accent);border-color:var(--accent)" onclick="App.addAdvRow()">
      ＋ Aggiungi criterio di ricerca
    </button>`;

  document.getElementById('modal-footer').innerHTML = `
    <button class="btn btn-ghost" onclick="App.resetAdvFilters()">↺ Reset</button>
    <button class="btn btn-ghost" onclick="App.closeModal()">Annulla</button>
    <button class="btn btn-primary" onclick="App.applyAdvSearch()">🔍 Cerca</button>`;

  // Add first row automatically
  App.addAdvRow();
  App.openModal();
};

App.addAdvRow = function(){
  const t = _advTable;
  const fields = ADV_FIELDS[t] || [];
  const rowId = _advRowCount++;
  const isFirst = rowId === 0;

  const fieldOpts = fields.map(f =>
    `<option value="${esc(f.field)}">${esc(f.label)}</option>`
  ).join('');

  const row = document.createElement('div');
  row.className = 'adv-row';
  row.id = 'adv-row-'+rowId;
  row.innerHTML = `
    ${!isFirst ? `<div class="adv-connector">
      <button type="button" class="adv-conn-btn active" id="adv-conn-${rowId}" data-val="AND" onclick="App.toggleConnector(${rowId})">AND</button>
      <span class="adv-conn-hint">clicca per cambiare in OR</span>
    </div>` : ''}
    <div class="adv-row-inner">
      <select class="adv-select adv-field-sel" onchange="App.onAdvFieldChange(${rowId})">
        <option value="">— seleziona campo —</option>
        ${fieldOpts}
      </select>
      <select class="adv-select adv-op-sel" id="adv-op-${rowId}">
        <option value="contains">contiene</option>
      </select>
      <div class="adv-val-wrap" id="adv-val-wrap-${rowId}">
        <input type="text" class="adv-input" id="adv-val-${rowId}" placeholder="valore..."/>
      </div>
      <button type="button" class="adv-del-btn" onclick="document.getElementById('adv-row-${rowId}').remove()" title="Rimuovi">✕</button>
    </div>`;
  document.getElementById('adv-rows').appendChild(row);
};

App.toggleConnector = function(rowId){
  const btn = document.getElementById('adv-conn-'+rowId);
  if(!btn) return;
  if(btn.dataset.val === 'AND'){
    btn.dataset.val = 'OR';
    btn.textContent = 'OR';
    btn.classList.remove('active');
    btn.classList.add('or');
    btn.title = 'Clicca per cambiare in AND';
    btn.nextElementSibling.textContent = 'clicca per cambiare in AND';
  } else {
    btn.dataset.val = 'AND';
    btn.textContent = 'AND';
    btn.classList.remove('or');
    btn.classList.add('active');
    btn.title = 'Clicca per cambiare in OR';
    btn.nextElementSibling.textContent = 'clicca per cambiare in OR';
  }
};

App.onAdvFieldChange = function(rowId){
  const t = _advTable;
  const fields = ADV_FIELDS[t] || [];
  const row = document.getElementById('adv-row-'+rowId);
  const fieldSel = row.querySelector('.adv-field-sel');
  const fieldName = fieldSel.value;
  const fieldDef = fields.find(f => f.field === fieldName);
  if(!fieldDef) return;

  // Update operators
  const opSel = document.getElementById('adv-op-'+rowId);
  let ops;
  if(fieldDef.type === 'date')   ops = ADV_OPS_DATE;
  else if(fieldDef.type === 'select') ops = ADV_OPS_SELECT;
  else ops = ADV_OPS_TEXT;
  opSel.innerHTML = ops.map(o=>`<option value="${o.value}">${o.label}</option>`).join('');
  opSel.onchange = () => App.onAdvOpChange(rowId, fieldDef);

  // Show initial value input
  App.onAdvOpChange(rowId, fieldDef);
};

App.onAdvOpChange = function(rowId, fieldDef){
  const opSel = document.getElementById('adv-op-'+rowId);
  const op = opSel.value;
  const wrap = document.getElementById('adv-val-wrap-'+rowId);

  // No-value operators
  if(op === 'is_empty' || op === 'is_not_empty' || op === 'today' || op === 'yesterday' ||
     op === 'last_7_days' || op === 'last_30_days' || op === 'last_60_days' || op === 'last_90_days' ||
     op === 'last_120_days' || op === 'next_7_days' || op === 'next_30_days' || op === 'next_60_days' ||
     op === 'next_90_days' || op === 'next_120_days' || op === 'this_month' || op === 'last_month' || op === 'this_year'){
    wrap.innerHTML = '<span style="color:var(--text3);font-size:12px;line-height:36px">nessun valore richiesto</span>';
    return;
  }

  // Date range
  if(op === 'between' && fieldDef.type === 'date'){
    wrap.innerHTML = `
      <input type="date" class="adv-input" id="adv-val-${rowId}" placeholder="da"/>
      <span style="color:var(--text3);font-size:13px;padding:0 4px">—</span>
      <input type="date" class="adv-input" id="adv-val2-${rowId}" placeholder="a"/>`;
    return;
  }

  // Select field
  if(fieldDef.type === 'select' && (op === 'is' || op === 'is_not')){
    const opts = OPT[fieldDef.opts] || [];
    wrap.innerHTML = `<select class="adv-input" id="adv-val-${rowId}">
      <option value="">— seleziona —</option>
      ${opts.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')}
    </select>`;
    return;
  }

  // Date single
  if(fieldDef.type === 'date'){
    wrap.innerHTML = `<input type="date" class="adv-input" id="adv-val-${rowId}"/>`;
    return;
  }

  // Text default
  wrap.innerHTML = `<input type="text" class="adv-input" id="adv-val-${rowId}" placeholder="valore..."/>`;
};

App.applyAdvSearch = function(){
  const t = _advTable;
  const fields = ADV_FIELDS[t] || [];
  const criteria = [];

  document.querySelectorAll('.adv-row').forEach(row => {
    const fieldSel = row.querySelector('.adv-field-sel');
    const opSel = row.querySelector('.adv-op-sel');
    if(!fieldSel || !fieldSel.value) return;
    const fieldName = fieldSel.value;
    const op = opSel ? opSel.value : 'contains';
    const fieldDef = fields.find(f => f.field === fieldName);
    if(!fieldDef) return;

    const rowId = row.id.replace('adv-row-','');
    const val1El = document.getElementById('adv-val-'+rowId);
    const val2El = document.getElementById('adv-val2-'+rowId);
    const val1 = val1El ? val1El.value.trim() : '';
    const val2 = val2El ? val2El.value.trim() : '';

    // Read connector (AND/OR) - first row has no connector, defaults to AND
    const connBtn = document.getElementById('adv-conn-'+rowId);
    const connector = connBtn ? connBtn.dataset.val : 'AND';

    criteria.push({ field: fieldName, fieldDef, op, val1, val2, connector });
  });

  App.advCriteria = criteria;
  App.filter = '';
  document.getElementById('search-input').value = '';
  App.page = 1;
  App.closeModal();
  App.renderTable(t);
  if(criteria.length) toast(`${criteria.length} filtro/i attivo/i — ${App.filtered.length} risultati`);
};

App.resetAdvFilters = function(){
  App.advCriteria = [];
  App.advCustomFilterKey = null;
App.advCompanyFilter = null;
  App.filter = '';
  document.getElementById('search-input').value = '';
  document.getElementById('adv-rows').innerHTML = '';
  _advRowCount = 0;
  App.addAdvRow();
};

// ── Date helpers ──────────────────────────────────────────────────────────────
function advParseDate(s){
  if(!s) return null;
  const p = s.split(/[\/\-]/);
  if(p.length !== 3) return null;
  const d = p[0].length===4
    ? new Date(p[0]+'-'+p[1]+'-'+p[2])
    : new Date(p[2]+'-'+p[1]+'-'+p[0]);
  return isNaN(d) ? null : d;
}
function advDateISO(s){
  const d = advParseDate(s);
  if(!d) return '';
  return d.toISOString().slice(0,10);
}
function todayISO(){ return new Date().toISOString().slice(0,10); }
function daysAgoISO(n){ const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }
function daysAheadISO(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }

function advMatchesCriteria(row, criteria){
  if(!criteria.length) return true;
  // Evaluate using AND/OR connectors
  // Group criteria into AND/OR chains
  // Logic: evaluate left to right, connector applies between previous result and current
  let result = evalCriterion(row, criteria[0]);
  for(let i = 1; i < criteria.length; i++){
    const c = criteria[i];
    const cur = evalCriterion(row, c);
    if(c.connector === 'OR'){
      result = result || cur;
    } else {
      result = result && cur;
    }
  }
  return result;
}

function evalCriterion(row, c){
    const rawVal = String(row[c.field]||'').trim();
    const { op, val1, val2 } = c;

    // No-value ops
    if(op==='is_empty')     return !rawVal;
    if(op==='is_not_empty') return !!rawVal;

    // Date-relative ops
    const today = todayISO();
    const yesterday = daysAgoISO(1);
    const rowISO = advDateISO(rawVal);
    if(op==='today')         return rowISO === today;
    if(op==='yesterday')     return rowISO === yesterday;
    if(op==='last_7_days')   return rowISO >= daysAgoISO(7)   && rowISO <= today;
    if(op==='last_30_days')  return rowISO >= daysAgoISO(30)  && rowISO <= today;
    if(op==='last_60_days')  return rowISO >= daysAgoISO(60)  && rowISO <= today;
    if(op==='last_90_days')  return rowISO >= daysAgoISO(90)  && rowISO <= today;
    if(op==='last_120_days') return rowISO >= daysAgoISO(120) && rowISO <= today;
    if(op==='next_7_days')   return rowISO >= today && rowISO <= daysAheadISO(7);
    if(op==='next_30_days')  return rowISO >= today && rowISO <= daysAheadISO(30);
    if(op==='next_60_days')  return rowISO >= today && rowISO <= daysAheadISO(60);
    if(op==='next_90_days')  return rowISO >= today && rowISO <= daysAheadISO(90);
    if(op==='next_120_days') return rowISO >= today && rowISO <= daysAheadISO(120);
    if(op==='this_month'){
      const m=today.slice(0,7); return rowISO.startsWith(m);
    }
    if(op==='last_month'){
      const d=new Date(); d.setMonth(d.getMonth()-1);
      const m=d.toISOString().slice(0,7); return rowISO.startsWith(m);
    }
    if(op==='this_year'){
      return rowISO.startsWith(today.slice(0,4));
    }

    // Date with value
    if(op==='before')   return rowISO && rowISO < val1;
    if(op==='after')    return rowISO && rowISO > val1;
    if(op==='between')  return rowISO && rowISO >= val1 && rowISO <= val2;

    // Text/select ops
    const rv = rawVal.toLowerCase();
    const v1 = val1.toLowerCase();
    // Equivalenza: "non in forza" e "non attivo" sono lo stesso stato in tabelle diverse
    const NON_ATTIVO_EQUIV = ['non in forza','non attivo'];
    const rvNorm = NON_ATTIVO_EQUIV.includes(rv) ? 'non_attivo_equiv' : rv;
    const v1Norm = NON_ATTIVO_EQUIV.includes(v1) ? 'non_attivo_equiv' : v1;
    if(op==='is')           return rvNorm === v1Norm;
    if(op==='is_not')       return rvNorm !== v1Norm;
    if(op==='contains')     return rv.includes(v1);
    if(op==='not_contains') return !rv.includes(v1);
    if(op==='starts_with')  return rv.startsWith(v1);
    if(op==='ends_with')    return rv.endsWith(v1);
  return true;
}

// Override renderTable to support advCriteria
App.renderTable = function(t){
  const all=Store.getRows(t), cols=dispCols(t), meta=TABLE_META[t], canEdit=Auth.canEdit();

  let rows=all;
  if(this.filter){
    const terms=this.filter.split(/\s+/).filter(x=>x.length>0);
    rows=all.filter(r=>{
      const allValues=Object.values(r).map(v=>String(v||'').toLowerCase()).join(' ');
      return terms.every(x=>allValues.includes(x));
    });
  }
  if(this.advCriteria && this.advCriteria.length){
    rows=rows.filter(r=>advMatchesCriteria(r, this.advCriteria));
  }
  if(this.advCustomFilterKey){
    rows=applyCustomFilter(this.advCustomFilterKey, rows, this.advCompanyFilter);
  }
  if(this.sortCol){
    const sc=this.sortCol, sd=this.sortDir;
    rows=[...rows].sort((a,b)=>{
      const va=String(a[sc]||'').toLowerCase(), vb=String(b[sc]||'').toLowerCase();
      return va<vb?-sd:va>vb?sd:0;
    });
  } else {
    // Default: ordine di inserimento (più recente prima) tramite _id
    rows=[...rows].sort((a,b)=>{
      const ia=String(a._id||''), ib=String(b._id||'');
      if(!ia && !ib) return 0;
      if(!ia) return 1;
      if(!ib) return -1;
      // _id starts with timestamp in base36 — compare as strings (lexicographic = chronological)
      const ta=ia.slice(0,8), tb=ib.slice(0,8);
      return tb.localeCompare(ta); // newest first
    });
  }
  this.filtered=rows;
  const tot=rows.length, tp=Math.max(1,Math.ceil(tot/this.pageSize));
  if(this.page>tp)this.page=tp;
  const s0=(this.page-1)*this.pageSize, page=rows.slice(s0,s0+this.pageSize);

  const advCount=(this.advCriteria?this.advCriteria.length:0) + (this.advCustomFilterKey?1:0);
  const advBadge=advCount?`<span style="background:var(--accent);color:#fff;border-radius:12px;padding:1px 8px;font-size:11px;margin-left:4px">${advCount} filtri</span>`:'';
  const resetBtn=advCount?`<button class="btn btn-ghost" style="font-size:12px;color:var(--danger)" onclick="App.advCriteria=[];App.advCustomFilterKey=null;App.advCompanyFilter=null;App.renderTable('${t}')">✕ Rimuovi filtri</button>`:'';

  // Selezione multipla: mantiene gli _id selezionati attraverso paginazione/filtri (this.selected)
  if(!this.selected) this.selected = new Set();
  if(this._selectedTable !== t){ this.selected = new Set(); this._selectedTable = t; } // cambio tabella: azzera selezione
  const pageIds = page.map(r=>r._id);
  const allPageSelected = pageIds.length>0 && pageIds.every(id=>this.selected.has(id));

  const ths=`<th style="width:34px"><input type="checkbox" ${allPageSelected?'checked':''} onchange="App.toggleSelectAllPage('${t}',this.checked)" title="Seleziona tutti in questa pagina"/></th>`+
    `<th style="width:100px">Azioni</th>`+
    cols.map(c=>{
      const label = c==='__proroga_max' ? 'Proroga' : c;
      return `<th class="${this.sortCol===c?'sorted':''}" onclick="App.sortBy('${esc(c)}')">${esc(label)} <span class="sort-icon">${this.sortCol===c?(this.sortDir===1?'↑':'↓'):'↕'}</span></th>`;
    }).join('');
  // Per Dipendenti, Stato Dipendente e Mansione vengono sincronizzati dal contratto
  // associato (per N° Socio) anche nella vista a elenco, non solo nel form di modifica.
  const normalizeNSocioList = s => String(s||'').trim().replace(',', '.').toUpperCase();
  let contrattiByNSocio = null;
  if(t==='dipendenti'){
    contrattiByNSocio = {};
    Store.getRows('contratti').forEach(c=>{
      const key = normalizeNSocioList(c['Id Dipendente (N° Socio)']);
      if(key) contrattiByNSocio[key] = c;
    });
  }
  const trs=page.map(row=>{
    const oi=all.indexOf(row);
    const isSel = this.selected.has(row._id);
    const tds=cols.map(c=>{
      // Colonna virtuale: proroga più futura tra Data Proroga 1-4
      if(c==='__proroga_max'){
        const proroghe = ['Data Proroga 1','Data Proroga 2','Data Proroga 3','Data Proroga 4']
          .map(k=>row[k]||'').filter(d=>d.trim());
        if(!proroghe.length) return `<td style="color:var(--text3)">—</td>`;
        // Ordina le date e prende la più futura (parseDate gestisce DD-MM-YYYY e YYYY-MM-DD)
        const sorted = proroghe.sort((a,b)=>{
          const pa=a.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/), pb=b.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
          const da=pa?`${pa[3]}-${pa[2]}-${pa[1]}`:a, db=pb?`${pb[3]}-${pb[2]}-${pb[1]}`:b;
          return da>db?1:-1;
        });
        const latest = sorted[sorted.length-1];
        return `<td title="${esc(latest)}">${esc(latest)}</td>`;
      }
      let v=row[c]??'';
      if(t==='dipendenti' && ['Stato Dipendente','Mansione','Data assunzione','Data fine rapporto'].includes(c)){
        const contratto = contrattiByNSocio[normalizeNSocioList(row['N° Socio'])];
        if(contratto){
          const contrattoVal = c==='Data assunzione'
            ? (contratto['Data Assunzione'] || contratto['Data assunzione'])
            : contratto[c];
          v = contrattoVal ?? v;
        }
      }
      return meta.status===c?'<td>'+pill(v)+'</td>':`<td title="${esc(v)}">${esc(v)}</td>`;
    }).join('');
    const actView=`<button class="icon-btn view" title="Visualizza" onclick="App.openView('${t}',${oi})">👁</button>`;
    const actMod=Auth.can('edit')?`<button class="icon-btn" title="Modifica" onclick="App.openEdit('${t}',${oi})">✎</button>`:'';
    const actDel=Auth.can('delete')?`<button class="icon-btn danger" title="Elimina" onclick="App.confirmDelete('${t}',${oi})">✕</button>`:'';
    const actionsTd=`<td><div class="td-actions">${actView}${actMod}${actDel}</div></td>`;
    const checkboxTd=`<td><input type="checkbox" ${isSel?'checked':''} onchange="App.toggleSelectRow('${t}','${row._id}',this.checked)"/></td>`;
    return`<tr class="${isSel?'row-selected':''}">${checkboxTd}${actionsTd}${tds}</tr>`;
  }).join('')||'<tr><td colspan="99" style="text-align:center;color:var(--text3);padding:36px">Nessun risultato</td></tr>';

  const selCount = this.selected.size;
  const bulkBar = selCount>0 ? `
    <div class="bulk-edit-bar" style="display:flex;align-items:center;gap:10px;background:#eff6ff;border:1px solid var(--accent);border-radius:8px;padding:8px 14px;margin-bottom:10px">
      <span style="font-weight:600;font-size:13px;color:var(--accent)">${selCount} selezionat${selCount===1?'o':'i'}</span>
      ${Auth.can('edit')?`<button class="btn btn-primary" style="font-size:13px" onclick="App.openBulkEdit('${t}')">✎ Modifica campo per tutti</button>`:''}
      ${Auth.can('delete')?`<button class="btn btn-ghost" style="font-size:13px;color:var(--danger);border-color:#fca5a5" onclick="App.bulkDelete('${t}')">✕ Elimina selezionati</button>`:''}
      <button class="btn btn-ghost" style="font-size:13px;margin-left:auto" onclick="App.clearSelection('${t}')">Deseleziona tutto</button>
    </div>` : '';

  let pgs='';const mB=7,sP=Math.max(1,Math.min(this.page-3,tp-mB+1)),eP=Math.min(tp,sP+mB-1);
  for(let i=sP;i<=eP;i++)pgs+=`<button class="page-btn ${i===this.page?'active':''}" onclick="App.goPage(${i})">${i}</button>`;

  document.getElementById('content').innerHTML=`
    <div class="table-wrap">
      <div class="table-toolbar">
        <span style="font-size:14px;color:var(--text2);font-weight:600">${meta.label}${advBadge}</span>
        ${resetBtn}
        ${this.sortCol?`<button class="btn btn-ghost" style="font-size:12px" onclick="App.sortCol=null;App.sortDir=1;App.renderTable('${t}')" title="Torna all'ordine di inserimento">↺ Ordine inserimento</button>`:''}
        <span class="record-count">${this.filter||advCount?tot+' filtrati / ':''}${all.length} totali</span>
        ${Auth.can('quick_search')?`<button class="btn btn-ghost" style="font-size:13px;background:var(--accent);color:#fff;border-color:var(--accent)" onclick="App.openQuickSearches('${t}')">⚡ Ricerche Rapide</button>`:''}
        ${Auth.can('adv_search')?`<button class="btn btn-ghost" style="font-size:13px;border-color:var(--accent);color:var(--accent)" onclick="App.openAdvSearch('${t}')">🔍 Ricerca Avanzata</button>`:''}
        ${Auth.can('export')?`<button class="btn btn-ghost" style="font-size:13px" onclick="App.exportXLSX('${t}')">↓ Excel</button>`:''}
        ${Auth.can('import')?`<button class="btn btn-ghost" style="font-size:13px" onclick="App.importXLSX('${t}')">↑ Importa</button>`:''}
        ${Auth.can('print')?`<button class="btn btn-ghost" style="font-size:13px" onclick="App.printTable('${t}')">🖨 Stampa</button>`:''}
        ${Auth.can('clear_table')?`<button class="btn btn-ghost" style="font-size:13px;color:var(--danger);border-color:#fca5a5" onclick="App.clearTable('${t}')">🗑 Svuota</button>`:''}
        ${Auth.isAdmin()?`<button class="btn btn-ghost" style="font-size:13px" onclick="App.openLayoutEditor('${t}')" title="Personalizza l'ordine e la posizione dei campi (solo admin)">🧩 Personalizza Layout</button>`:''}
      </div>
      ${bulkBar}
      <div class="table-scroll"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>
      <div class="pagination">
        <span class="page-info">${s0+1}–${Math.min(s0+this.pageSize,tot)} di ${tot}</span>
        <button class="page-btn" onclick="App.goPage(1)" ${this.page===1?'disabled':''}>«</button>
        <button class="page-btn" onclick="App.goPage(${this.page-1})" ${this.page===1?'disabled':''}>‹</button>
        ${pgs}
        <button class="page-btn" onclick="App.goPage(${this.page+1})" ${this.page===tp?'disabled':''}>›</button>
        <button class="page-btn" onclick="App.goPage(${tp})" ${this.page===tp?'disabled':''}>»</button>
      </div>
    </div>`;
};

// ─── RICERCHE RAPIDE ──────────────────────────────────────────────────────────

// Elenco aziende con etichetta breve, usato per generare automaticamente una ricerca
// rapida per ogni singola azienda (oltre alla versione "Tutte le aziende" già esistente).
const COMPANIES = [
  { value:'ALIANTE Soc. Coop.',          short:'ALIANTE' },
  { value:'CAPITOLINA LOGISTICA Scarl',  short:'CAPITOLINA LOGISTICA' },
  { value:'FIPAM  Scarl',                short:'FIPAM' },
  { value:'SERIAM Scarl',                short:'SERIAM' },
  { value:'CONSORZIO CAPITOLINA Srl',    short:'CONSORZIO CAPITOLINA' },
  { value:'SNA Servizi & Management Srl',short:'SNA' },
  { value:"SOCIETA' CESTINO",            short:'CESTINO' },
];

// Genera le varianti per-azienda di una ricerca rapida "base": stessa configurazione,
// ma con un criterio aggiuntivo che filtra per una singola azienda. L'id, la label e la
// descrizione vengono prefissati col nome breve dell'azienda per distinguerle a colpo d'occhio.
// IMPORTANTE: il filtro usa "contains" con la parola chiave breve (es. "ALIANTE") invece di un
// confronto esatto con il nome completo, perché nei dati reali il nome azienda può comparire
// con piccole variazioni (es. "ALIANTE Soc. Coop." vs "ALIANTE Soc. Coop" senza punto finale,
// o "FIPAM  Scarl" vs "FIPAM Soc. Coop.") — un match esatto escluderebbe alcuni dipendenti
// che invece compaiono correttamente nella ricerca generale "Tutte le Aziende".
function perCompanyVariants(base){
  return COMPANIES.map(({short}) => ({
    ...base,
    id: `${base.id}_${short.toLowerCase().replace(/[^a-z0-9]/g,'_')}`,
    label: `${short} — ${base.label}`,
    desc: `${base.desc} (${short})`,
    criteria: base.criteria ? [
      ...base.criteria,
      { field:'Azienda', fieldDef:{type:'select'}, op:'contains', val1:short, val2:'', connector:'AND' },
    ] : base.criteria,
    // Se la ricerca usa un customFilter, lo manteniamo identico ma aggiungiamo il filtro azienda
    // come ulteriore step applicato dopo (vedi applyCustomFilter, che lo gestisce per nome chiave).
    _companyFilter: base.customFilter ? short : undefined,
    _baseId: base.id, // preserva sempre l'id originale, per identificare correttamente la ricerca "madre"
  }));
}

const QUICK_SEARCHES = {
  dipendenti: [
    {
      id:'aliante_soci', icon:'👥',
      label:'ALIANTE — Elenco Soci per Assemblee',
      desc:'Soci ATTIVI di ALIANTE Soc. Coop.',
      table:'dipendenti',
      cols:['N° Socio','Cognome','Nome','Data Delibera Ammissione','Note'],
      criteria:[
        {field:'Azienda',        fieldDef:{type:'select'}, op:'contains', val1:'ALIANTE', val2:'', connector:'AND'},
        {field:'Stato Socio',    fieldDef:{type:'select'}, op:'is', val1:'ATTIVO',              val2:'', connector:'AND'},
      ]
    },
    {
      id:'capitolina_soci', icon:'👥',
      label:'CAPITOLINA LOGISTICA — Elenco Soci per Assemblee',
      desc:'Soci ATTIVI di CAPITOLINA LOGISTICA Scarl',
      table:'dipendenti',
      cols:['N° Socio','Cognome','Nome','Data Delibera Ammissione','Note'],
      criteria:[
        {field:'Azienda',     fieldDef:{type:'select'}, op:'contains', val1:'CAPITOLINA LOGISTICA', val2:'', connector:'AND'},
        {field:'Stato Socio', fieldDef:{type:'select'}, op:'is', val1:'ATTIVO',                     val2:'', connector:'AND'},
      ]
    },
    {
      id:'fipam_soci', icon:'👥',
      label:'FIPAM — Elenco Soci per Assemblee',
      desc:'Soci ATTIVI di FIPAM Scarl',
      table:'dipendenti',
      cols:['N° Socio','Cognome','Nome','Data Delibera Ammissione','Note'],
      criteria:[
        {field:'Azienda',     fieldDef:{type:'select'}, op:'contains', val1:'FIPAM', val2:'', connector:'AND'},
        {field:'Stato Socio', fieldDef:{type:'select'}, op:'is', val1:'ATTIVO',       val2:'', connector:'AND'},
      ]
    },
    {
      id:'seriam_soci', icon:'👥',
      label:'SERIAM — Elenco Soci per Assemblee',
      desc:'Soci ATTIVI di SERIAM Scarl',
      table:'dipendenti',
      cols:['N° Socio','Cognome','Nome','Data Delibera Ammissione','Note'],
      criteria:[
        {field:'Azienda',     fieldDef:{type:'select'}, op:'contains', val1:'SERIAM', val2:'', connector:'AND'},
        {field:'Stato Socio', fieldDef:{type:'select'}, op:'is', val1:'ATTIVO',       val2:'', connector:'AND'},
      ]
    },
    {
      id:'aliante_permessi', icon:'🌍',
      label:'ALIANTE — Scadenzario Permessi di Soggiorno',
      desc:'Dipendenti ALIANTE con permesso di soggiorno',
      table:'dipendenti',
      cols:['Azienda','Cognome','Nome','Tipo permesso','Data rilascio Permesso Soggiorno','Appalto / sede di lavoro','Data scadenza Permesso Soggiorno','Note permesso'],
      criteria:[
        {field:'Azienda',        fieldDef:{type:'select'}, op:'contains',     val1:'ALIANTE', val2:'', connector:'AND'},
        {field:'Tipo permesso',  fieldDef:{type:'select'}, op:'is_not_empty', val1:'',                   val2:'', connector:'AND'},
      ]
    },
    {
      id:'capitolina_permessi', icon:'🌍',
      label:'CAPITOLINA LOGISTICA — Scadenzario Permessi di Soggiorno',
      desc:'Dipendenti CAPITOLINA LOGISTICA con permesso di soggiorno',
      table:'dipendenti',
      cols:['Azienda','Cognome','Nome','Tipo permesso','Data rilascio Permesso Soggiorno','Appalto / sede di lavoro','Data scadenza Permesso Soggiorno','Note permesso'],
      criteria:[
        {field:'Azienda',        fieldDef:{type:'select'}, op:'contains',     val1:'CAPITOLINA LOGISTICA', val2:'', connector:'AND'},
        {field:'Tipo permesso',  fieldDef:{type:'select'}, op:'is_not_empty', val1:'',                           val2:'', connector:'AND'},
      ]
    },
    {
      id:'fipam_permessi', icon:'🌍',
      label:'FIPAM — Scadenzario Permessi di Soggiorno',
      desc:'Dipendenti FIPAM con permesso di soggiorno',
      table:'dipendenti',
      cols:['Azienda','Cognome','Nome','Tipo permesso','Data rilascio Permesso Soggiorno','Appalto / sede di lavoro','Data scadenza Permesso Soggiorno','Note permesso'],
      criteria:[
        {field:'Azienda',        fieldDef:{type:'select'}, op:'contains',     val1:'FIPAM', val2:'', connector:'AND'},
        {field:'Tipo permesso',  fieldDef:{type:'select'}, op:'is_not_empty', val1:'',             val2:'', connector:'AND'},
      ]
    },
    {
      id:'seriam_permessi', icon:'🌍',
      label:'SERIAM — Scadenzario Permessi di Soggiorno',
      desc:'Dipendenti SERIAM con permesso di soggiorno',
      table:'dipendenti',
      cols:['Azienda','Cognome','Nome','Tipo permesso','Data rilascio Permesso Soggiorno','Appalto / sede di lavoro','Data scadenza Permesso Soggiorno','Note permesso'],
      criteria:[
        {field:'Azienda',        fieldDef:{type:'select'}, op:'contains',     val1:'SERIAM', val2:'', connector:'AND'},
        {field:'Tipo permesso',  fieldDef:{type:'select'}, op:'is_not_empty', val1:'',             val2:'', connector:'AND'},
      ]
    },
    {
      id:'consorzio_permessi', icon:'🌍',
      label:'CONSORZIO CAPITOLINA — Scadenzario Permessi di Soggiorno',
      desc:'Dipendenti CONSORZIO CAPITOLINA con permesso di soggiorno',
      table:'dipendenti',
      cols:['Azienda','Cognome','Nome','Tipo permesso','Data rilascio Permesso Soggiorno','Appalto / sede di lavoro','Data scadenza Permesso Soggiorno','Note permesso'],
      criteria:[
        {field:'Azienda',        fieldDef:{type:'select'}, op:'contains',     val1:'CONSORZIO CAPITOLINA', val2:'', connector:'AND'},
        {field:'Tipo permesso',  fieldDef:{type:'select'}, op:'is_not_empty', val1:'',                         val2:'', connector:'AND'},
      ]
    },
    {
      id:'sna_permessi', icon:'🌍',
      label:'SNA — Scadenzario Permessi di Soggiorno',
      desc:'Dipendenti SNA Servizi & Management con permesso di soggiorno',
      table:'dipendenti',
      cols:['Azienda','Cognome','Nome','Tipo permesso','Data rilascio Permesso Soggiorno','Appalto / sede di lavoro','Data scadenza Permesso Soggiorno','Note permesso'],
      criteria:[
        {field:'Azienda',        fieldDef:{type:'select'}, op:'contains',     val1:'SNA', val2:'', connector:'AND'},
        {field:'Tipo permesso',  fieldDef:{type:'select'}, op:'is_not_empty', val1:'',                             val2:'', connector:'AND'},
      ]
    },
    {
      id:'cestino_permessi', icon:'🌍',
      label:'CESTINO — Scadenzario Permessi di Soggiorno',
      desc:"Dipendenti SOCIETA' CESTINO con permesso di soggiorno",
      table:'dipendenti',
      cols:['Azienda','Cognome','Nome','Tipo permesso','Data rilascio Permesso Soggiorno','Appalto / sede di lavoro','Data scadenza Permesso Soggiorno','Note permesso'],
      criteria:[
        {field:'Azienda',        fieldDef:{type:'select'}, op:'contains',     val1:'CESTINO', val2:'', connector:'AND'},
        {field:'Tipo permesso',  fieldDef:{type:'select'}, op:'is_not_empty', val1:'',                 val2:'', connector:'AND'},
      ]
    },
    {
      id:'tutti_permessi', icon:'🌍',
      label:'Scadenzario Permessi — Tutti',
      desc:'Tutti i dipendenti con permesso in scadenza (anno corrente e precedente)',
      table:'dipendenti',
      cols:['Azienda','Cognome','Nome','Tipo permesso','Data rilascio Permesso Soggiorno','Appalto / sede di lavoro','Data scadenza Permesso Soggiorno','Note permesso'],
      criteria:[
        {field:'Tipo permesso', fieldDef:{type:'select'}, op:'is_not_empty', val1:'', val2:'', connector:'AND'},
      ]
    },
    {
      id:'entrate_uscite', icon:'📊',
      label:'Situazione Entrate / Uscite Dipendenti — Settimana Precedente',
      desc:'Dipendenti assunti o cessati nella settimana precedente (tutte le aziende)',
      table:'contratti',
      cols:['Azienda','Cognome','Nome','Mansione','Stato Dipendente','Data Assunzione','Data fine rapporto','Tipologia contrattuale'],
      criteria:[], // dynamic - computed at runtime
      dynamic: 'entrate_uscite',
    },
    {
      id:'dipendenti_attivi', icon:'✅',
      label:'Tutti i Dipendenti Attivi',
      desc:'Dipendenti con stato ATTIVO in tutte le aziende',
      table:'dipendenti',
      cols:['N° Socio','Azienda','Cognome','Nome','Mansione','Stato Dipendente','Data assunzione','Appalto / sede di lavoro'],
      criteria:[
        {field:'Stato Dipendente', fieldDef:{type:'select'}, op:'is', val1:'ATTIVO', val2:'', connector:'AND'},
      ]
    },
    {
      id:'dipendenti_non_forza', icon:'❌',
      label:'Dipendenti Non in Forza',
      desc:'Dipendenti con stato NON IN FORZA',
      table:'dipendenti',
      cols:['N° Socio','Azienda','Cognome','Nome','Mansione','Stato Dipendente','Data assunzione'],
      criteria:[
        {field:'Stato Dipendente', fieldDef:{type:'select'}, op:'is', val1:'NON IN FORZA', val2:'', connector:'AND'},
      ]
    },
  ],
  formazione: (() => {
    const bases = [
      {
        id:'form_scadenza_mese', icon:'📅',
        label:'Scadenzario Formazione — Mese Corrente e Prossimo',
        desc:'Corsi con scadenza nei prossimi 60 giorni',
        table:'formazione',
        cols:['Id Dipendente (N° Socio)','Azienda','Cognome','Nome','Stato Dipendente','Mansione','Appalto / sede di lavoro','Tipologia Corso','Scadenza Corso','Stato Corso'],
        criteria:[
          {field:'Scadenza Corso', fieldDef:{type:'date'}, op:'next_60_days', val1:'', val2:'', connector:'AND'},
        ]
      },
      {
        id:'form_corso_base', icon:'📅',
        label:'Scadenzario Formazione CORSO BASE — Mese Corrente e Prossimo',
        desc:'Corso Base in scadenza nei prossimi 60 giorni',
        table:'formazione',
        cols:['Cognome','Nome','Mansione','Stato Dipendente','Appalto / sede di lavoro','Data di nascita','Luogo di nascita','Codice Fiscale','Data assunzione','Azienda'],
        criteria:[
          {field:'Tipologia Corso', fieldDef:{type:'select'}, op:'is', val1:'Corso Base', val2:'', connector:'AND'},
          {field:'Scadenza Corso',  fieldDef:{type:'date'}, op:'next_60_days', val1:'', val2:'', connector:'AND'},
        ]
      },
    ];
    return bases.flatMap(b => [
      { ...b, id:b.id+'_tutte', label:b.label+' — Tutte le Aziende', desc:b.desc+' (tutte le aziende)', _baseId:b.id },
      ...perCompanyVariants(b),
    ]);
  })(),
  sorveglianza: (() => {
    const bases = [
      {
        id:'sorv_scadenza_mese', icon:'📅',
        label:'Scadenze Idoneità — Mese Corrente e Prossimo',
        desc:'Visite con scadenza nei prossimi 60 giorni',
        table:'sorveglianza',
        cols:['Azienda','Cognome','Nome','Mansione','Appalto / sede di lavoro','Data assunzione','Scadenza Idoneità','Stato idoneità','Data Analisi','Recapito telefonico','Note'],
        criteria:[
          {field:'Scadenza Idoneità', fieldDef:{type:'date'}, op:'next_60_days', val1:'', val2:'', connector:'AND'},
        ]
      },
      {
        id:'sorv_report_medico', icon:'🩺',
        label:'Report per Medico del Lavoro',
        desc:'Anagrafica completa dipendenti per il medico competente',
        table:'sorveglianza',
        cols:['Cognome','Nome','Azienda','Mansione','Data di nascita','Luogo di nascita','Codice fiscale','Data assunzione','Recapito telefonico'],
        criteria:[]
      },
    ];
    return bases.flatMap(b => [
      { ...b, id:b.id+'_tutte', label:b.label+' — Tutte le Aziende', desc:b.desc+' (tutte le aziende)', _baseId:b.id },
      ...perCompanyVariants(b),
    ]);
  })(),
  contratti: (() => {
    const bases = [
      {
        id:'cont_scadenza_30', icon:'📅',
        label:'Contratti in Scadenza — Prossimi 30 Giorni',
        desc:'Contratti a tempo determinato in scadenza (considerando l\'ultima proroga) — solo dipendenti ATTIVI',
        table:'contratti',
        cols:['Id Dipendente (N° Socio)','Azienda','Cognome','Nome','Tipologia contrattuale','Data inizio','Scadenza Contratto','Data Proroga 1','Data Proroga 2','Data Proroga 3','Data Proroga 4','Mansione'],
        criteria:[], // gestito da customFilter
        customFilter: 'cont_scadenza_30_proroga',
      },
      {
        id:'cont_indeterminato', icon:'✅',
        label:'Contratti Tempo Indeterminato Attivi',
        desc:'Tutti i contratti a tempo indeterminato',
        table:'contratti',
        cols:['Id Dipendente (N° Socio)','Azienda','Cognome','Nome','Tipologia contrattuale','Livello','Data inizio','Mansione'],
        criteria:[
          {field:'Tipologia contrattuale', fieldDef:{type:'select'}, op:'is', val1:'Tempo indeterminato', val2:'', connector:'AND'},
          {field:'Stato Dipendente',       fieldDef:{type:'select'}, op:'is', val1:'ATTIVO',              val2:'', connector:'AND'},
        ]
      },
      {
        id:'cont_intermittente', icon:'🔄',
        label:'Contratti Intermittenti',
        desc:'Tutti i contratti di lavoro intermittente',
        table:'contratti',
        cols:['Id Dipendente (N° Socio)','Azienda','Cognome','Nome','Tipologia contrattuale','Livello','Data inizio'],
        criteria:[
          {field:'Tipologia contrattuale', fieldDef:{type:'select'}, op:'is', val1:'Lavoro intermittente', val2:'', connector:'AND'},
        ]
      },
    ];
    return bases.flatMap(b => [
      { ...b, id:b.id+'_tutte', label:b.label+' — Tutte le Aziende', desc:b.desc+' (tutte le aziende)', _baseId:b.id },
      ...perCompanyVariants(b),
    ]);
  })(),
  aziende:[],
};

// ── Dynamic criteria helpers ──────────────────────────────────────────────────
function buildDynamicCriteria(dynamicKey){
  if(dynamicKey === 'entrate_uscite'){
    // Settimana precedente: da lunedì scorso a domenica scorsa.
    // Esempio: oggi 07/07/2026 (martedì) → lastMon = 29/06/2026, lastSun = 05/07/2026
    const now = new Date(); now.setHours(0,0,0,0);
    const dayOfWeek = now.getDay(); // 0=dom, 1=lun, 2=mar...
    const daysToLastMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // giorni dall'ultimo lunedì
    const lastMon = new Date(now);
    lastMon.setDate(now.getDate() - daysToLastMon - 7); // lunedì della settimana scorsa
    const lastSun = new Date(lastMon);
    lastSun.setDate(lastMon.getDate() + 6); // domenica della settimana scorsa
    const fromISO = lastMon.toISOString().slice(0,10);
    const toISO   = lastSun.toISOString().slice(0,10);
    return [
      // ENTRATE: Data Assunzione (con A maiuscola, nome reale del campo in Contratti)
      {field:'Data Assunzione',    fieldDef:{type:'date'}, op:'between', val1:fromISO, val2:toISO, connector:'AND'},
      // USCITE: Data fine rapporto (in OR: trova sia chi è entrato che chi è uscito)
      {field:'Data fine rapporto', fieldDef:{type:'date'}, op:'between', val1:fromISO, val2:toISO, connector:'OR'},
    ];
  }
  return [];
}

// Calcola la data di scadenza EFFETTIVA di un contratto: se ci sono proroghe (Data Proroga 1-4),
// usa la più recente tra quelle compilate; altrimenti usa "Scadenza Contratto".
function getEffectiveContractExpiry(row){
  const candidates = ['Data Proroga 4','Data Proroga 3','Data Proroga 2','Data Proroga 1','Scadenza Contratto']
    .map(col => advParseDate(row[col]))
    .filter(d => d);
  if(!candidates.length) return null;
  return candidates.reduce((max,d) => d > max ? d : max);
}

// Filtri custom: usati quando la logica non è esprimibile con i criteri standard campo/operatore
// (es. richiede un calcolo su più colonne, come la data di scadenza effettiva con proroghe)
function applyCustomFilter(key, rows, companyFilter){
  let result = rows;
  if(key === 'cont_scadenza_30_proroga'){
    const now = new Date(); now.setHours(0,0,0,0);
    const lim30 = new Date(now); lim30.setDate(now.getDate()+30);
    result = rows.filter(r=>{
      if(String(r['Stato Dipendente']||'').trim().toUpperCase() !== 'ATTIVO') return false;
      const expiry = getEffectiveContractExpiry(r);
      if(!expiry) return false;
      return expiry >= now && expiry <= lim30;
    });
  }
  // Filtro azienda aggiuntivo per le varianti per-singola-azienda di ricerche con customFilter
  if(companyFilter){
    const cf = companyFilter.toLowerCase();
    result = result.filter(r => String(r['Azienda']||'').toLowerCase().includes(cf));
  }
  return result;
}

// ── Quick search modal ────────────────────────────────────────────────────────
App.openQuickSearches = function(t){
  const searches = CustomQuickSearches.getFullList(t, QUICK_SEARCHES[t] || []);
  const meta = TABLE_META[t];
  if(!searches.length && !Auth.isAdmin()){ toast('Nessuna ricerca rapida per questa tabella','error'); return; }

  document.getElementById('modal-title').textContent = '⚡ Ricerche Rapide — '+meta.label;

  let html = searches.length ? '<div class="quick-search-grid">' : '<p style="color:var(--text3);font-size:13px;padding:20px 0;text-align:center">Nessuna ricerca rapida configurata per questa tabella.</p>';
  searches.forEach(s => {
    const crit = s.dynamic ? buildDynamicCriteria(s.dynamic) : s.criteria;
    const srcRows = Store.getRows(s.table || t);
    let matched = srcRows.filter(r => advMatchesCriteria(r, crit));
    if(s.customFilter) matched = applyCustomFilter(s.customFilter, matched, s._companyFilter);
    const count = matched.length;
    const displayLabel = CustomLabels.get(t, s.id, s.label);
    const isCustom = !!s._isCustomBase;
    html += `
      <div class="quick-card" style="position:relative" onclick="App.runQuickSearch('${t}','${s.id}')">
        ${Auth.isAdmin()?`<div style="position:absolute;top:6px;right:6px;display:flex;gap:3px">
          <button class="icon-btn" title="Rinomina" style="background:#fff"
            onclick="event.stopPropagation();App.renameQuickSearch('${t}','${s.id}')">✏</button>
          <button class="icon-btn danger" title="Rimuovi" style="background:#fff"
            onclick="event.stopPropagation();App.removeQuickSearch('${t}','${s.id}',${isCustom})">🚫</button>
        </div>`:''}
        <div class="quick-card-icon">${s.icon}</div>
        <div class="quick-card-label">${esc(displayLabel)}</div>
        <div class="quick-card-desc">${esc(s.desc)}</div>
        <div class="quick-card-count">${count} record</div>
      </div>`;
  });
  if(searches.length) html += '</div>';

  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-footer').innerHTML =
    (Auth.isAdmin()?`<button class="btn btn-primary" onclick="App.openQuickSearchEditor('${t}')">➕ Nuova Ricerca</button>
     ${App._hiddenQuickSearchesCount(t) ? `<button class="btn btn-ghost" onclick="App.showHiddenQuickSearches('${t}')">↺ Ricerche rimosse (${App._hiddenQuickSearchesCount(t)})</button>` : ''}`:'') +
    `<button class="btn btn-ghost" onclick="App.closeModal()">Chiudi</button>`;
  App.openModal();
};

// Rinomina (solo admin) una ricerca rapida: chiede il nuovo nome e salva la personalizzazione.
// Lasciare vuoto ripristina il nome originale.
App.renameQuickSearch = async function(t, searchId){
  if(!Auth.isAdmin()){ toast('Funzione riservata agli amministratori','error'); return; }
  const searches = CustomQuickSearches.getFullList(t, QUICK_SEARCHES[t] || []);
  const s = searches.find(x => x.id === searchId);
  if(!s) return;
  if(!s._originalLabel) s._originalLabel = s.label; s.label = CustomLabels.get(t, s.id, s._originalLabel); // applica l'etichetta personalizzata, preservando sempre il nome originale
  const current = CustomLabels.get(t, searchId, s.label);
  const newLabel = prompt('Nuovo nome per questa ricerca rapida (lascia vuoto per ripristinare il nome originale):', current);
  if(newLabel === null) return; // annullato
  await CustomLabels.rename(t, searchId, newLabel);
  toast(newLabel.trim() ? 'Nome aggiornato ✓' : 'Nome ripristinato al default');
  App.openQuickSearches(t);
};

// Rimuove (nasconde) una ricerca rapida. Per quelle predefinite nel codice, le marca come
// "removed" (recuperabili); per quelle create dall'admin, le elimina davvero.
App.removeQuickSearch = async function(t, searchId, isCustom){
  if(!Auth.isAdmin()){ toast('Funzione riservata agli amministratori','error'); return; }
  if(!confirm('Rimuovere questa ricerca rapida?')) return;
  await CustomQuickSearches.removeSearch(t, searchId, isCustom);
  toast('Ricerca rapida rimossa');
  App.openQuickSearches(t);
};

App._hiddenQuickSearchesCount = function(t){
  return CustomQuickSearches.get(t).removed.length;
};

App.showHiddenQuickSearches = function(t){
  const removed = CustomQuickSearches.get(t).removed;
  if(!removed.length){ toast('Nessuna ricerca rimossa','error'); return; }
  const baseSearches = QUICK_SEARCHES[t] || []; // già espanso con tutte le varianti per azienda
  const items = removed.map(id => {
    const match = baseSearches.find(s => s.id === id);
    return { id, label: match ? CustomLabels.get(t, match.id, match.label) : id };
  });
  document.getElementById('modal-title').textContent = '↺ Ricerche Rapide Rimosse';
  document.getElementById('modal-body').innerHTML = items.map(it=>`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-light)">
      <span style="font-size:13px">${esc(it.label)}</span>
      <button class="btn btn-ghost" style="font-size:12px" onclick="App.restoreQuickSearch('${t}','${it.id}')">↺ Ripristina</button>
    </div>`).join('');
  document.getElementById('modal-footer').innerHTML = `<button class="btn btn-ghost" onclick="App.openQuickSearches('${t}')">← Torna alle ricerche</button>`;
  App.openModal();
};

App.restoreQuickSearch = async function(t, searchId){
  await CustomQuickSearches.restoreSearch(t, searchId);
  toast('Ricerca rapida ripristinata ✓');
  App.showHiddenQuickSearches(t);
};

// ── Editor di creazione/modifica per le ricerche rapide personalizzate (solo admin) ──
App._qsEditState = null; // {table, id, icon, label, desc, criteria:[{field,op,val1,val2}]}

App.openQuickSearchEditor = function(t, existingId){
  if(!Auth.isAdmin()){ toast('Funzione riservata agli amministratori','error'); return; }
  let editing = null;
  if(existingId){
    const val = CustomQuickSearches.get(t);
    editing = val.added.find(s=>s.id===existingId);
  }
  App._qsEditState = editing
    ? { table:t, id:editing.id, icon:editing.icon||'⭐', label:editing.label, desc:editing.desc||'', criteria:JSON.parse(JSON.stringify(editing.criteria||[])) }
    : { table:t, id:null, icon:'⭐', label:'', desc:'', criteria:[] };
  App._renderQuickSearchEditor();
};

App._renderQuickSearchEditor = function(){
  const st = App._qsEditState;
  const fields = ADV_FIELDS[st.table] || [];
  document.getElementById('modal-title').textContent = st.id ? '✎ Modifica Ricerca Rapida' : '➕ Nuova Ricerca Rapida';

  const critRows = st.criteria.map((c, ci) => {
    const fieldDef = fields.find(f=>f.field===c.field) || fields[0] || {type:'text'};
    const opsList = fieldDef.type==='date' ? ADV_OPS_DATE : fieldDef.type==='select' ? ADV_OPS_SELECT : ADV_OPS_TEXT;
    const needsVal = !['is_empty','is_not_empty'].includes(c.op);
    const connector = c.connector || 'AND';

    // Riga di separazione col connettore AND/OR, visibile solo dal secondo criterio in poi
    const connectorRow = ci > 0 ? `
      <div style="display:flex;align-items:center;gap:8px;margin:4px 0 4px 0">
        <div style="flex:1;height:1px;background:var(--border)"></div>
        <button type="button"
          onclick="App._qsCritConnectorChange(${ci})"
          style="padding:3px 14px;border-radius:20px;border:2px solid ${connector==='AND'?'var(--accent)':'var(--danger)'};
            background:${connector==='AND'?'#eff6ff':'#fef2f2'};
            color:${connector==='AND'?'var(--accent)':'var(--danger)'};
            font-weight:800;font-size:12px;cursor:pointer;min-width:54px"
          title="Clicca per alternare tra AND e OR">
          ${connector}
        </button>
        <div style="flex:1;height:1px;background:var(--border)"></div>
      </div>` : '';

    return `${connectorRow}
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;flex-wrap:wrap">
        <select style="flex:1;min-width:140px;padding:6px;border:1px solid var(--border);border-radius:6px;font-size:13px" onchange="App._qsCritFieldChange(${ci},this.value)">
          ${fields.map(f=>`<option value="${esc(f.field)}" ${f.field===c.field?'selected':''}>${esc(f.label)}</option>`).join('')}
        </select>
        <select style="flex:1;min-width:120px;padding:6px;border:1px solid var(--border);border-radius:6px;font-size:13px" onchange="App._qsCritOpChange(${ci},this.value)">
          ${opsList.map(o=>`<option value="${o.value}" ${o.value===c.op?'selected':''}>${esc(o.label)}</option>`).join('')}
        </select>
        ${needsVal ? (() => {
          if(fieldDef.type === 'date'){
            return `<input type="date" value="${esc(c.val1||'')}" placeholder="Valore"
              style="flex:1;min-width:120px;padding:6px;border:1px solid var(--border);border-radius:6px;font-size:13px"
              onchange="App._qsCritValChange(${ci},this.value)"/>`;
          } else if(fieldDef.type === 'select' && fieldDef.opts && OPT[fieldDef.opts]){
            const optValues = OPT[fieldDef.opts];
            return `<select style="flex:1;min-width:120px;padding:6px;border:1px solid var(--border);border-radius:6px;font-size:13px"
              onchange="App._qsCritValChange(${ci},this.value)">
              <option value="">— seleziona —</option>
              ${optValues.map(o=>`<option value="${esc(o)}" ${o===c.val1?'selected':''}>${esc(o)}</option>`).join('')}
            </select>`;
          } else {
            return `<input type="text" value="${esc(c.val1||'')}" placeholder="Valore"
              style="flex:1;min-width:120px;padding:6px;border:1px solid var(--border);border-radius:6px;font-size:13px"
              onchange="App._qsCritValChange(${ci},this.value)"/>`;
          }
        })() : ''}
        <button class="icon-btn danger" title="Rimuovi criterio" onclick="App._qsRemoveCrit(${ci})">✕</button>
      </div>`;
  }).join('');

  document.getElementById('modal-body').innerHTML = `
    <div class="form-group"><label class="field-label">Icona (emoji)</label>
      <input type="text" id="qs-icon" value="${esc(st.icon)}" maxlength="4" style="width:70px;text-align:center;font-size:18px;padding:6px;border:1px solid var(--border);border-radius:6px"/></div>
    <div class="form-group"><label class="field-label">Nome ricerca</label>
      <input type="text" id="qs-label" value="${esc(st.label)}" placeholder="Es. Scadenze formazione prossimi 30 giorni"
        style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px"/></div>
    <div class="form-group"><label class="field-label">Descrizione (opzionale)</label>
      <input type="text" id="qs-desc" value="${esc(st.desc)}" placeholder="Breve descrizione mostrata sotto il titolo"
        style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px"/></div>
    <div class="form-group">
      <label class="field-label">Criteri di filtro (tutti applicati insieme, in AND)</label>
      <div id="qs-criteria">${critRows || '<p style="color:var(--text3);font-size:12px">Nessun criterio: la ricerca mostrerà tutti i record.</p>'}</div>
      <button class="btn btn-ghost" style="font-size:12px;margin-top:6px" onclick="App._qsAddCrit()">+ Aggiungi criterio</button>
    </div>`;

  document.getElementById('modal-footer').innerHTML = `
    <button class="btn btn-ghost" onclick="App.openQuickSearches('${st.table}')">Annulla</button>
    <button class="btn btn-primary" onclick="App._qsSave()">💾 Salva Ricerca</button>`;
  App.openModal();
};

App._qsAddCrit = function(){
  const fields = ADV_FIELDS[App._qsEditState.table] || [];
  const f = fields[0];
  if(!f) return;
  const ops = f.type==='date' ? ADV_OPS_DATE : f.type==='select' ? ADV_OPS_SELECT : ADV_OPS_TEXT;
  App._qsEditState.criteria.push({ field:f.field, fieldDef:{type:f.type, opts:f.opts}, op:ops[0].value, val1:'', val2:'', connector:'AND' });
  App._renderQuickSearchEditor();
};
App._qsRemoveCrit = function(ci){
  App._qsEditState.criteria.splice(ci,1);
  App._renderQuickSearchEditor();
};
App._qsCritFieldChange = function(ci, fieldName){
  const fields = ADV_FIELDS[App._qsEditState.table] || [];
  const f = fields.find(x=>x.field===fieldName);
  if(!f) return;
  const ops = f.type==='date' ? ADV_OPS_DATE : f.type==='select' ? ADV_OPS_SELECT : ADV_OPS_TEXT;
  App._qsEditState.criteria[ci] = { field:f.field, fieldDef:{type:f.type, opts:f.opts}, op:ops[0].value, val1:'', val2:'', connector:'AND' };
  App._renderQuickSearchEditor();
};
App._qsCritOpChange = function(ci, op){
  App._qsEditState.criteria[ci].op = op;
  App._renderQuickSearchEditor();
};
App._qsCritValChange = function(ci, val){
  App._qsEditState.criteria[ci].val1 = val;
};
App._qsCritConnectorChange = function(ci){
  const current = App._qsEditState.criteria[ci].connector || 'AND';
  App._qsEditState.criteria[ci].connector = current === 'AND' ? 'OR' : 'AND';
  App._renderQuickSearchEditor();
};

App._qsSave = async function(){
  const st = App._qsEditState;
  const icon = document.getElementById('qs-icon').value.trim() || '⭐';
  const label = document.getElementById('qs-label').value.trim();
  const desc = document.getElementById('qs-desc').value.trim();
  if(!label){ toast('Inserisci un nome per la ricerca','error'); return; }

  const id = st.id || ('custom_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6));
  const searchDef = {
    id, icon, label, desc,
    table: st.table,
    cols: (ADV_FIELDS[st.table]||[]).map(f=>f.field), // mostra tutte le colonne note per questa tabella
    criteria: st.criteria,
  };

  if(st.id){
    await CustomQuickSearches.updateSearch(st.table, st.id, searchDef);
    toast('Ricerca rapida aggiornata ✓');
  } else {
    await CustomQuickSearches.addSearch(st.table, searchDef);
    toast('Ricerca rapida creata ✓');
  }
  App._qsEditState = null;
  App.openQuickSearches(st.table);
};

// Rinomina (solo admin) una card della Dashboard. Lasciare vuoto ripristina il nome originale.
App.renameDashCard = async function(cardId, defaultLabel){
  if(!Auth.isAdmin()){ toast('Funzione riservata agli amministratori','error'); return; }
  const current = CustomLabels.get('dashboard', cardId, defaultLabel);
  const newLabel = prompt('Nuovo nome per questa voce della Dashboard (lascia vuoto per ripristinare il nome originale):', current);
  if(newLabel === null) return; // annullato
  await CustomLabels.rename('dashboard', cardId, newLabel);
  toast(newLabel.trim() ? 'Nome aggiornato ✓' : 'Nome ripristinato al default');
  App.renderDash();
};

// ── Run quick search → show results in styled table inside modal ──────────────
App.runQuickSearch = function(t, id){
  const searches = CustomQuickSearches.getFullList(t, QUICK_SEARCHES[t] || []);
  const s = searches.find(x => x.id === id);
  if(!s) return;
  if(!s._originalLabel) s._originalLabel = s.label; s.label = CustomLabels.get(t, s.id, s._originalLabel); // applica l'etichetta personalizzata, preservando sempre il nome originale

  const srcTable = s.table || t;
  const crit = s.dynamic ? buildDynamicCriteria(s.dynamic) : s.criteria;
  const allRows = Store.getRows(srcTable);
  const storeCols = Store.getCols(srcTable);
  let rows = allRows.filter(r => advMatchesCriteria(r, crit));
  if(s.customFilter) rows = applyCustomFilter(s.customFilter, rows, s._companyFilter);

  // Use only cols that exist in store — normalizza storeCols che può essere array
  // di stringhe o oggetti {name,...} a seconda di come il NAS ha salvato la struttura
  const storeColNames = storeCols.map(c => typeof c === 'string' ? c : (c.name||c.field||''));
  const cols = (s.cols && s.cols.length)
    ? s.cols.filter(c => c !== '__proroga_max')
    : storeColNames.filter(c => c && c !== '_id');

  // Sort by Cognome if available
  if(cols.includes('Cognome')) rows.sort((a,b) => (a.Cognome||'').localeCompare(b.Cognome||''));

  document.getElementById('modal-title').textContent = s.icon+' '+s.label+' ('+rows.length+' record)';

  // Build HTML table like the original reports
  const thead = cols.map(c => `<th>${esc(c)}</th>`).join('');

  // Status color for certain columns
  const tbody = rows.map((row, ri) => {
    const tds = cols.map(c => {
      const v = row[c] || '';
      if(c === 'Stato idoneità' || c === 'Stato Corso' || c === 'Stato Dipendente') return '<td>'+pill(v)+'</td>';
      // Highlight expiring dates in orange/red
      if(c.toLowerCase().includes('scadenza') || c.toLowerCase().includes('scad')){
        const d = advParseDate(v);
        const now = new Date();
        const lim30 = new Date(); lim30.setDate(now.getDate()+30);
        if(d && d < now)  return `<td style="color:var(--danger);font-weight:700">${esc(v)}</td>`;
        if(d && d < lim30) return `<td style="color:var(--warn);font-weight:700">${esc(v)}</td>`;
      }
      return `<td>${esc(v)}</td>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('') || '<tr><td colspan="99" style="text-align:center;padding:24px;color:var(--text3)">Nessun risultato</td></tr>';

  const html = `
    <div style="margin-bottom:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-size:13px;color:var(--text3)">${esc(s.desc)}</span>
      <span style="font-family:var(--font-mono);font-size:12px;background:#dbeafe;color:var(--accent);padding:2px 10px;border-radius:12px;font-weight:700">${rows.length} record</span>
    </div>
    <div class="table-scroll" style="max-height:55vh">
      <table class="quick-result-table">
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>`;

  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn btn-ghost" onclick="App.openQuickSearches('${t}')">← Torna alle ricerche</button>
    <button class="btn btn-ghost" style="font-size:13px" onclick="App.printQuickResult('${s.id}','${t}')">🖨 Stampa</button>
    <button class="btn btn-ghost" style="font-size:13px" onclick="App.exportQuickResult('${s.id}','${t}')">↓ Excel</button>
    <button class="btn btn-primary" onclick="App.applyQuickFilter('${t}','${s.id}')">Mostra in tabella</button>`;
};

// ── Apply quick filter to main table ─────────────────────────────────────────
App.applyQuickFilter = function(t, id){
  const searches = CustomQuickSearches.getFullList(t, QUICK_SEARCHES[t] || []);
  const s = searches.find(x => x.id === id);
  if(!s) return;
  if(!s._originalLabel) s._originalLabel = s.label; s.label = CustomLabels.get(t, s.id, s._originalLabel); // applica l'etichetta personalizzata, preservando sempre il nome originale
  App.advCriteria = s.dynamic ? buildDynamicCriteria(s.dynamic) : s.criteria;
  App.advCustomFilterKey = s.customFilter || null;
  App.advCompanyFilter = s._companyFilter || null;
  App.filter = '';
  document.getElementById('search-input').value = '';
  App.page = 1;
  App.closeModal();
  App.renderTable(t);
  toast(s.icon+' '+s.label+' — '+App.filtered.length+' risultati');
};

// ── Print quick result ────────────────────────────────────────────────────────
App.printQuickResult = function(id, t){
  const searches = CustomQuickSearches.getFullList(t, QUICK_SEARCHES[t] || []);
  const s = searches.find(x => x.id === id);
  if(!s) return;
  if(!s._originalLabel) s._originalLabel = s.label; s.label = CustomLabels.get(t, s.id, s._originalLabel); // applica l'etichetta personalizzata, preservando sempre il nome originale
  const srcTable = s.table || t;
  const crit = s.dynamic ? buildDynamicCriteria(s.dynamic) : s.criteria;
  const allRows = Store.getRows(srcTable);
  const storeCols = Store.getCols(srcTable);
  let rows = allRows.filter(r => advMatchesCriteria(r, crit));
  if(s.customFilter) rows = applyCustomFilter(s.customFilter, rows, s._companyFilter);
  if(rows.includes && rows.sort) rows.sort((a,b) => (a.Cognome||'').localeCompare(b.Cognome||''));
  const storeColNames = storeCols.map(c => typeof c === 'string' ? c : (c.name||c.field||''));
  const cols = (s.cols && s.cols.length)
    ? s.cols.filter(c => c !== '__proroga_max')
    : storeColNames.filter(c => c && c !== '_id');
  const oggi = new Date().toLocaleDateString('it-IT');
  const thead = cols.map(c=>`<th>${esc(c)}</th>`).join('');
  const tbody = rows.map(r=>'<tr>'+cols.map(c=>{
    const v=r[c]||'';
    const d=advParseDate(v);
    const now=new Date(), lim30=new Date(); lim30.setDate(now.getDate()+30);
    const style=(c.toLowerCase().includes('scad')&&d)?(d<now?'color:#dc2626;font-weight:700':d<lim30?'color:#d97706;font-weight:700':''):'';
    return `<td${style?` style="${style}"`:''}>${esc(v)}</td>`;
  }).join('')+'</tr>').join('');

  const html=`<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"/>
  <title>${s.label}</title>
  <style>
    @page{size:A4 landscape;margin:8mm 8mm 10mm 8mm;}
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:Arial,sans-serif;font-size:8px;color:#111;}
    .header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px;border-bottom:2px solid #1F4E79;padding-bottom:5px;}
    .header h1{font-size:13px;font-weight:800;color:#1F4E79;}
    .header p{font-size:8px;color:#555;}
    table{width:100%;border-collapse:collapse;table-layout:fixed;}
    th{background:#1F4E79;color:#fff;padding:4px 5px;font-size:7px;font-weight:700;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left;}
    td{padding:4px 5px;border-bottom:1px solid #e5e7eb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    tr:nth-child(even) td{background:#EBF3FB;}
    .footer{margin-top:6px;font-size:7px;color:#999;display:flex;justify-content:space-between;}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}thead{display:table-header-group;}tr{page-break-inside:avoid;}}
  </style></head><body>
  <div class="header">
    <div><h1>${s.icon} ${s.label}</h1><p>${esc(s.desc)} · ${rows.length} record</p></div>
    <p>Stampato il ${oggi}</p>
  </div>
  <table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
  <div class="footer"><span>Gestionale Dipendenti</span><span>${rows.length} record — ${oggi}</span></div>
  <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};<\/script>
  </body></html>`;
  const w=window.open('','_blank');
  if(!w){toast('Abilita i popup','error');return;}
  w.document.write(html); w.document.close();
};

// ── Export quick result to Excel ──────────────────────────────────────────────
App.exportQuickResult = function(id, t){
  try{
    const searches = CustomQuickSearches.getFullList(t, QUICK_SEARCHES[t] || []);
    const s = searches.find(x => x.id === id);
    if(!s){ toast('Ricerca non trovata','error'); return; }
    if(!s._originalLabel) s._originalLabel = s.label; s.label = CustomLabels.get(t, s.id, s._originalLabel);
    const srcTable = s.table || t;
    const crit = s.dynamic ? buildDynamicCriteria(s.dynamic) : s.criteria;
    const allRows = Store.getRows(srcTable);
    const storeCols = Store.getCols(srcTable);
    const storeColNames = storeCols.map(c => typeof c === 'string' ? c : (c.name || c.field || ''));
    let rows = allRows.filter(r => advMatchesCriteria(r, crit));
    if(s.customFilter) rows = applyCustomFilter(s.customFilter, rows, s._companyFilter);
    const cols = s.cols && s.cols.length
      ? s.cols.filter(c => c !== '__proroga_max')
      : storeColNames.filter(c => c && c !== '_id');
    if(!cols.length){ toast('Nessuna colonna da esportare','error'); return; }
    const data = [cols, ...rows.map(r => cols.map(c => r[c] ?? ''))];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = cols.map(c => ({wch: Math.max(c.length, 12)}));
    const wb = XLSX.utils.book_new();
    // Sanitizza nome foglio: max 31 chars, niente caratteri speciali Excel
    const sheetName = s.label.replace(/[\/\\?\*\[\]:]/g, '-').slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    // Sanitizza nome file
    const fileName = s.label.replace(/[^a-zA-Z0-9àèìòùÀÈÌÒÙ]/g, '_').replace(/_+/g, '_').slice(0, 50)
      + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    XLSX.writeFile(wb, fileName);
    toast('Excel scaricato ✓');
  } catch(e){
    console.error('exportQuickResult error:', e);
    toast('Errore export Excel: ' + e.message, 'error');
  }
};

// ─── STATISTICHE PER ANNO ─────────────────────────────────────────────────────

const EU_COUNTRIES = new Set([
  'italiana','italiano','italiana/o','italiana / italiano',
  'tedesca','francese','spagnola','portoghese','olandese','belga','austriaca',
  'greca','polacca','rumena','bulgara','ungherese','ceca','slovacca','slovena',
  'croata','estone','lettone','lituana','finlandese','svedese','danese',
  'irlandese','cipriota','lussemburghese','maltese','ue','europea',
  'germany','france','spain','poland','romania','portugal','netherlands',
  'eu','european','comunitario','comunitaria'
]);

function isEU(cittadinanza){
  if(!cittadinanza) return false;
  return EU_COUNTRIES.has(cittadinanza.toLowerCase().trim());
}

function parseYear(dateStr){
  if(!dateStr) return null;
  const p = dateStr.split(/[\/\-]/);
  if(p.length !== 3) return null;
  const y = p[0].length === 4 ? parseInt(p[0]) : parseInt(p[2]);
  return isNaN(y) ? null : y;
}

App.openStats = function(){
  // Build year selector from 2020 to current year
  const currentYear = new Date().getFullYear();
  const years = [];
  for(let y = currentYear; y >= 2020; y--) years.push(y);

  document.getElementById('modal-title').textContent = '📊 Statistiche per Anno';
  document.getElementById('modal-body').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;flex-wrap:wrap">
      <label style="font-size:13px;font-weight:700;color:var(--text2)">Anno di riferimento:</label>
      <select id="stats-year" onchange="App.renderStats()" style="font-size:15px;font-weight:700;padding:8px 16px;border-radius:8px;border:2px solid var(--accent);color:var(--accent);background:var(--surface);cursor:pointer;outline:none">
        ${years.map(y => `<option value="${y}">${y}</option>`).join('')}
      </select>
      <span style="font-size:12px;color:var(--text3)">Scorri per cambiare anno</span>
    </div>
    <div id="stats-content"></div>`;

  document.getElementById('modal-footer').innerHTML =
    `<button class="btn btn-ghost" onclick="App.printStats()">🖨 Stampa</button>
     <button class="btn btn-primary" onclick="App.closeModal()">Chiudi</button>`;

  this.openModal();
  requestAnimationFrame(()=>requestAnimationFrame(()=>this.renderStats()));

  // Mouse wheel on year selector
  document.getElementById('stats-year').addEventListener('wheel', function(e){
    e.preventDefault();
    const opts = [...this.options];
    const cur = this.selectedIndex;
    if(e.deltaY > 0 && cur < opts.length-1) this.selectedIndex = cur+1;
    if(e.deltaY < 0 && cur > 0) this.selectedIndex = cur-1;
    App.renderStats();
  }, {passive:false});
};

App.renderStats = function(){
  const year = parseInt(document.getElementById('stats-year').value);
  const dip  = Store.getRows('dipendenti');
  const cont = Store.getRows('contratti');
  const form = Store.getRows('formazione');

  const AZIENDE = ['ALIANTE Soc. Coop.','CAPITOLINA LOGISTICA Scarl','FIPAM  Scarl',
                   'SERIAM Scarl','CONSORZIO CAPITOLINA Srl','SNA Servizi & Management Srl',"SOCIETA' CESTINO"];

  function activeInYear(r, yr){
    const assYear = parseYear(r['Data assunzione']||r['Data Assunzione']||'');
    const fineStr = r['Data fine rapporto']||'';
    const fineYear = parseYear(fineStr);
    if(!assYear || assYear > yr) return false;
    if(fineYear && fineYear < yr) return false;
    return true;
  }

  function contrattiForDip(nsocio, yr){
    return cont.filter(c => {
      const id = (c['Id Dipendente (N° Socio)']||c['Matricola']||'').trim();
      if(!id || id !== nsocio.trim()) return false;
      const startY = parseYear(c['Data inizio']||c['Data assunzione']||c['Data Assunzione']||'');
      const endY   = parseYear(c['Data fine']||c['Scadenza Contratto']||'');
      if(!startY || startY > yr) return false;
      if(endY && endY < yr) return false;
      return true;
    });
  }

  // Build stats per azienda with M/F breakdown for each metric
  const stats = {};
  [...AZIENDE, 'Altra'].forEach(az => {
    stats[az] = {
      attivi:{tot:0,m:0,f:0},  non_attivi:{tot:0,m:0,f:0},
      det:{tot:0,m:0,f:0},     indet:{tot:0,m:0,f:0},
      fulltime:{tot:0,m:0,f:0},parttime:{tot:0,m:0,f:0},
      eu:{tot:0,m:0,f:0},      extraeu:{tot:0,m:0,f:0},
    };
  });

  dip.forEach(r => {
    const az = AZIENDE.find(a => a.trim() === (r.Azienda||'').trim()) || 'Altra';
    const sesso = (r.Sesso||'').toLowerCase();
    const isM = sesso.includes('maschio')||sesso==='m';
    const isF = sesso.includes('femmina')||sesso==='f';
    const mf  = isM?'m':isF?'f':null;

    function inc(obj){
      obj.tot++;
      if(mf) obj[mf]++;
    }

    const active = activeInYear(r, year);
    if(active) inc(stats[az].attivi); else inc(stats[az].non_attivi);

    // EU/ExtraEU
    const citt = r.Cittadinanza||r['Nazionalità']||'';
    if(citt){ if(isEU(citt)) inc(stats[az].eu); else inc(stats[az].extraeu); }

    // Contratto e orario
    const nsocio = (r['N° Socio']||'').trim();
    if(nsocio){
      const cs = contrattiForDip(nsocio, year);
      if(cs.length){
        const last = cs[cs.length-1];
        const tipo = (last['Tipologia contrattuale']||'').toLowerCase();
        if(tipo.includes('indeterminato')) inc(stats[az].indet);
        else if(tipo.includes('determinato')||tipo.includes('intermittente')) inc(stats[az].det);
        const orario = (last['Tipologia orario contrattuale']||'').toLowerCase();
        if(orario.includes('full')) inc(stats[az].fulltime);
        else if(orario.includes('part')) inc(stats[az].parttime);
      }
    }
  });

  // Formazione per tipo e anno
  const formByTipo = {};
  form.forEach(r => {
    const y = parseYear(r['Data Corso']||r['Data']||'');
    if(y !== year) return;
    const tipo = r['Tipologia Corso']||r['Tipo formazione']||'N/D';
    if(!formByTipo[tipo]) formByTipo[tipo]=0;
    formByTipo[tipo]++;
  });
  const totalForm = Object.values(formByTipo).reduce((a,b)=>a+b,0);

  // ── Render helpers ──────────────────────────────────────
  function statRow(label, obj, color=''){
    const num = typeof obj === 'object' ? obj.tot : obj;
    const hasMF = typeof obj === 'object' && (obj.m || obj.f);
    return `<div class="stat-row-block">
      <div class="stat-row">
        <span class="stat-row-label">${label}</span>
        <span class="stat-row-val"${color?` style="color:${color}"`:''}>${num}</span>
      </div>
      ${hasMF ? `<div class="stat-mf-row">
        <span class="mf-item male">👨 Uomini: <strong>${obj.m||0}</strong></span>
        <span class="mf-item female">👩 Donne: <strong>${obj.f||0}</strong></span>
      </div>` : ''}
    </div>`;
  }

  function azCard(az, idx){
    const s = stats[az];
    const tot = s.attivi.tot + s.non_attivi.tot;
    if(!tot) return '';
    const shortAz = az.replace(' Soc. Coop.','').replace(' Scarl','').replace(' Srl','').replace("SOCIETA' CESTINO","CESTINO");
    return `<div class="stats-az-card">
      <div class="stats-az-header">
        ${shortAz}
        <button class="stats-print-btn" onclick="App.printSingleStats('${az.replace(/'/g,"\'")}',${year})" title="Stampa ${shortAz}">🖨</button>
      </div>
      <div class="stats-az-body">
        <div class="stats-section-title">👤 Stato Dipendenti</div>
        ${statRow('✅ Attivi', s.attivi, 'var(--success)')}
        ${statRow('❌ Non in forza', s.non_attivi, 'var(--danger)')}
        ${statRow('Totale', {tot,m:s.attivi.m+s.non_attivi.m,f:s.attivi.f+s.non_attivi.f})}
        <div class="stats-section-title">📄 Tipo Contratto</div>
        ${statRow('Tempo indeterminato', s.indet, 'var(--success)')}
        ${statRow('Tempo determinato', s.det)}
        <div class="stats-section-title">⏱ Orario</div>
        ${statRow('Full Time', s.fulltime)}
        ${statRow('Part Time', s.parttime)}
        <div class="stats-section-title">🌍 Cittadinanza</div>
        ${statRow('Comunitari (EU)', s.eu)}
        ${statRow('Extracomunitari', s.extraeu, 'var(--warn)')}
      </div>
    </div>`;
  }

  const allAz = [...AZIENDE, 'Altra'];
  const cardsHtml = allAz.map((az,i) => azCard(az,i)).join('');

  const formHtml = Object.entries(formByTipo).sort((a,b)=>b[1]-a[1]).map(([tipo,n]) => {
    const pct = totalForm ? Math.round(n/totalForm*100) : 0;
    return `<div class="bar-item">
      <span class="bar-label" title="${esc(tipo)}">${esc(tipo)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:var(--accent2)"></div></div>
      <span class="bar-count">${n}</span>
    </div>`;
  }).join('') || '<p style="color:var(--text3);font-size:13px">Nessun corso per questo anno.</p>';

  document.getElementById('stats-content').innerHTML =
    '<p style="font-size:12px;color:var(--text3);margin-bottom:14px">I contatori 👨/👩 indicano la suddivisione uomini/donne per ogni voce.</p>' +
    '<div class="stats-az-grid">' + cardsHtml + '</div>' +
    '<div class="panel" style="margin-top:16px"><div class="panel-header">🎓 Formazione per Tipo — Anno ' + year + ' (' + totalForm + ' corsi totali)</div><div class="panel-body">' + formHtml + '</div></div>' +
    '<div class="panel stats-content-screen-only" style="margin-top:16px"><div class="panel-header">📊 Grafico Complessivo — Anno ' + year + '</div><div class="panel-body"><canvas id="chart-overall" height="120"></canvas></div></div>' +
    allAz.filter(az=>(stats[az]?.attivi?.tot||0)+(stats[az]?.non_attivi?.tot||0)>0).map(az=>
      '<div class="panel stats-content-screen-only" style="margin-top:14px"><div class="panel-header">📊 ' + az.replace(' Soc. Coop.','').replace(' Scarl','').replace(' Srl','') + ' — Anno ' + year + '</div>' +
      '<div class="panel-body" style="display:grid;grid-template-columns:1fr 1fr;gap:16px">' +
      '<canvas id="chart-' + az.replace(/[^a-zA-Z0-9]/g,'_') + '-stato" height="200"></canvas>' +
      '<canvas id="chart-' + az.replace(/[^a-zA-Z0-9]/g,'_') + '-dettagli" height="200"></canvas>' +
      '</div></div>'
    ).join('');

  // Draw charts after DOM update (timeout per garantire che il modal sia visibile e dimensionato)
  requestAnimationFrame(()=>requestAnimationFrame(()=>App._drawStatsCharts(year, stats, allAz, formByTipo)));

  // Store stats for print
  App._lastStats = {year, stats, formByTipo, totalForm, allAz};
};

App._drawStatsCharts = function(year, stats, allAz, formByTipo){
  function drawBar(canvasId, labels, datasets, title){
    const canvas = document.getElementById(canvasId);
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const parentW = canvas.parentElement ? canvas.parentElement.clientWidth : 0;
    const W = Math.max(canvas.offsetWidth, parentW, 380);
    const H = parseInt(canvas.getAttribute('height')) || 200;
    canvas.style.width = W+'px';
    canvas.style.height = H+'px';
    canvas.width = W;
    canvas.height = H;
    const barW = Math.max(8, (W - 60) / (labels.length * datasets.length + labels.length));
    const groupW = barW * datasets.length + 4;
    const maxVal = Math.max(1, ...datasets.flatMap(d=>d.data));
    const COLORS = ['#2563eb','#db2777','#16a34a','#d97706','#7c3aed','#0891b2'];
    const padL=50, padT=30, padB=60, padR=10;
    const chartH = H - padT - padB;
    const chartW = W - padL - padR;

    ctx.clearRect(0,0,W,H);
    // Title
    ctx.fillStyle='#374151'; ctx.font='bold 11px Arial'; ctx.textAlign='center';
    ctx.fillText(title, W/2, 16);

    // Grid lines
    ctx.strokeStyle='#e5e7eb'; ctx.lineWidth=0.5;
    for(let i=0;i<=4;i++){
      const y = padT + chartH - (i/4)*chartH;
      ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(W-padR,y); ctx.stroke();
      ctx.fillStyle='#9ca3af'; ctx.font='9px Arial'; ctx.textAlign='right';
      ctx.fillText(Math.round(maxVal*i/4), padL-4, y+3);
    }

    // Bars
    labels.forEach((label,gi)=>{
      const gx = padL + (gi/(labels.length))*(chartW) + chartW/(labels.length*2) - groupW/2;
      datasets.forEach((ds,di)=>{
        const val = ds.data[gi]||0;
        const bx = gx + di*barW;
        const bh = (val/maxVal)*chartH;
        const by = padT + chartH - bh;
        ctx.fillStyle = COLORS[di % COLORS.length];
        ctx.fillRect(bx, by, barW-2, bh);
        if(val>0){
          ctx.fillStyle='#111'; ctx.font='9px Arial'; ctx.textAlign='center';
          ctx.fillText(val, bx+barW/2-1, by-2);
        }
      });
      // Label
      ctx.fillStyle='#374151'; ctx.font='9px Arial'; ctx.textAlign='center';
      const lx = padL + (gi+0.5)*(chartW/labels.length);
      ctx.save(); ctx.translate(lx, H-padB+14);
      if(label.length>8){ctx.rotate(-0.4);}
      ctx.fillText(label.slice(0,14), 0, 0);
      ctx.restore();
    });

    // Legend
    datasets.forEach((ds,di)=>{
      ctx.fillStyle=COLORS[di%COLORS.length];
      ctx.fillRect(padL + di*80, H-12, 10, 8);
      ctx.fillStyle='#374151'; ctx.font='9px Arial'; ctx.textAlign='left';
      ctx.fillText(ds.label, padL+di*80+13, H-5);
    });
  }

  const AZIENDE_SHORT = {
    'ALIANTE Soc. Coop.':          'ALIANTE',
    'CAPITOLINA LOGISTICA Scarl':  'CAPITOLINA',
    'FIPAM  Scarl':                'FIPAM',
    'SERIAM Scarl':                'SERIAM',
    'CONSORZIO CAPITOLINA Srl':    'CONSORZIO',
    'SNA Servizi & Management Srl':'SNA',
    "SOCIETA' CESTINO":            'CESTINO',
    'Altra':                       'Altra',
  };

  const activeAz = allAz.filter(az=>(stats[az]?.attivi?.tot||0)+(stats[az]?.non_attivi?.tot||0)>0);
  const labels = activeAz.map(az=>AZIENDE_SHORT[az]||az.slice(0,10));

  // ── Grafico complessivo (tutti gli indicatori per azienda) ──────────────────
  drawBar('chart-overall', labels, [
    {label:'Attivi',        data: activeAz.map(az=>stats[az].attivi.tot||0)},
    {label:'Non in forza',  data: activeAz.map(az=>stats[az].non_attivi.tot||0)},
    {label:'T.Indeterminato',data:activeAz.map(az=>stats[az].indet.tot||0)},
    {label:'T.Determinato', data: activeAz.map(az=>stats[az].det.tot||0)},
    {label:'Full Time',     data: activeAz.map(az=>stats[az].fulltime.tot||0)},
    {label:'Part Time',     data: activeAz.map(az=>stats[az].parttime.tot||0)},
  ], 'Tutti gli indicatori per Azienda');

  // ── Grafici per singola azienda ────────────────────────────────────────────
  activeAz.forEach(az=>{
    const s = stats[az];
    const key = az.replace(/[^a-zA-Z0-9]/g,'_');

    // Grafico 1: Stato + Genere
    drawBar('chart-'+key+'-stato',
      ['Attivi','Non in forza','Uomini','Donne'],
      [
        {label:'Totale', data:[s.attivi.tot, s.non_attivi.tot, s.attivi.m+s.non_attivi.m, s.attivi.f+s.non_attivi.f]},
        {label:'Uomini', data:[s.attivi.m, s.non_attivi.m, 0, 0]},
        {label:'Donne',  data:[s.attivi.f, s.non_attivi.f, 0, 0]},
      ],
      'Stato Dipendenti e Genere'
    );

    // Grafico 2: Contratto + Orario + Cittadinanza
    drawBar('chart-'+key+'-dettagli',
      ['T.Indet.','T.Det.','Full Time','Part Time','EU','ExtraEU'],
      [
        {label:'Totale', data:[s.indet.tot, s.det.tot, s.fulltime.tot, s.parttime.tot, s.eu.tot, s.extraeu.tot]},
        {label:'Uomini', data:[s.indet.m,   s.det.m,   s.fulltime.m,   s.parttime.m,   s.eu.m,   s.extraeu.m]},
        {label:'Donne',  data:[s.indet.f,   s.det.f,   s.fulltime.f,   s.parttime.f,   s.eu.f,   s.extraeu.f]},
      ],
      'Contratto, Orario e Cittadinanza'
    );
  });
};

App.printSingleStats = function(az, year){
  App._printStatsFor([az], year);
};

App.printStats = function(){
  const year = parseInt(document.getElementById('stats-year')?.value || new Date().getFullYear());
  if(!App._lastStats) return;
  App._printStatsFor(App._lastStats.allAz, year);
};

App._printStatsFor = function(aziende, year){
  if(!App._lastStats) return;
  const {stats, formByTipo, totalForm, allAz} = App._lastStats;
  const oggi = new Date().toLocaleDateString('it-IT');
  const isSingle = aziende.length === 1;

  // Forza il ridisegno dei grafici (solo se stampa singola azienda, serve per i 2 grafici)
  if(isSingle){
    try{ App._drawStatsCharts(year, stats, allAz, formByTipo); }catch(e){ console.warn('Ridisegno grafici fallito:', e.message); }
  }

  function mfLine(label, obj, color=''){
    const num = typeof obj==='object' ? obj.tot : obj;
    const mf = typeof obj==='object' ? `<small style="color:#666"> (👨${obj.m||0} 👩${obj.f||0})</small>` : '';
    return `<div class="sr"><span>${label}</span><span${color?` style="color:${color};font-weight:700"`:' style="font-weight:700"'}>${num}${mf}</span></div>`;
  }

  const cards = aziende.map(az => {
    const s = stats[az];
    if(!s) return '';
    const tot = s.attivi.tot + s.non_attivi.tot;
    if(!tot) return '';
    const shortAz = az.replace(' Soc. Coop.','').replace(' Scarl','').replace(' Srl','');
    return `<div class="card">
      <div class="card-hdr">${shortAz}</div>
      <div class="card-body">
        <div class="sec">👤 Stato</div>
        ${mfLine('Attivi',s.attivi,'#16a34a')}
        ${mfLine('Non in forza',s.non_attivi,'#dc2626')}
        ${mfLine('Totale',{tot,m:s.attivi.m+s.non_attivi.m,f:s.attivi.f+s.non_attivi.f})}
        <div class="sec">📄 Contratto</div>
        ${mfLine('Tempo indeterminato',s.indet,'#16a34a')}
        ${mfLine('Tempo determinato',s.det)}
        <div class="sec">⏱ Orario</div>
        ${mfLine('Full Time',s.fulltime)}
        ${mfLine('Part Time',s.parttime)}
        <div class="sec">🌍 Cittadinanza</div>
        ${mfLine('Comunitari',s.eu)}
        ${mfLine('Extracomunitari',s.extraeu,'#d97706')}
      </div>
    </div>`;
  }).join('');

  const formRows = Object.entries(formByTipo).sort((a,b)=>b[1]-a[1]).map(([t,n])=>
    `<div class="sr"><span>${t}</span><span style="font-weight:700">${n}</span></div>`).join('');

  // ── Estrai i grafici già disegnati come immagini PNG ─────────────────────────
  let chartsHtml = '';
  try{
    if(isSingle){
      const key = aziende[0].replace(/[^a-zA-Z0-9]/g,'_');
      const c1 = document.getElementById('chart-'+key+'-stato');
      const c2 = document.getElementById('chart-'+key+'-dettagli');
      const img1 = (c1 && c1.width>0) ? c1.toDataURL('image/png') : '';
      const img2 = (c2 && c2.width>0) ? c2.toDataURL('image/png') : '';
      if(img1 || img2){
        chartsHtml = `<div class="chart-section">
          <div class="chart-hdr">📊 Grafici — ${aziende[0]}</div>
          <div class="chart-body">
            ${img1?`<img src="${img1}" class="chart-img"/>`:''}
            ${img2?`<img src="${img2}" class="chart-img"/>`:''}
          </div>
        </div>`;
      } else {
        chartsHtml = '<div class="chart-warn">⚠ Grafici non disponibili: apri prima la finestra Statistiche e attendi il caricamento, poi stampa.</div>';
      }
    }
    // Stampa complessiva (tutte le aziende): nessun grafico, solo dati tabellari
  }catch(e){
    console.warn('Impossibile estrarre i grafici:', e.message);
    if(isSingle) chartsHtml = '<div class="chart-warn">⚠ Errore nel caricamento dei grafici: '+e.message+'</div>';
  }

  const html=`<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"/>
  <title>Statistiche ${year}${isSingle?' — '+aziende[0]:''}</title>
  <style>
    @page{size:A4 portrait;margin:10mm;}
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:Arial,sans-serif;font-size:9px;color:#111;}
    .header{border-bottom:2px solid #1F4E79;padding-bottom:6px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:flex-end;}
    .header h1{font-size:14px;font-weight:800;color:#1F4E79;}
    .grid{display:grid;grid-template-columns:repeat(${isSingle?'1':'3'},1fr);gap:8px;margin-bottom:10px;}
    .card{border:1px solid #d1d9e6;border-radius:6px;overflow:hidden;break-inside:avoid;}
    .card-hdr{background:#1F4E79;color:#fff;padding:5px 8px;font-size:9px;font-weight:700;}
    .card-body{padding:5px 8px;}
    .sec{font-size:8px;font-weight:700;color:#2E75B6;text-transform:uppercase;margin:5px 0 2px;padding-bottom:2px;border-bottom:1px solid #e5e7eb;}
    .sr{display:flex;justify-content:space-between;padding:2px 0;font-size:8px;border-bottom:1px solid #f8f8f8;}
    .form-section{border:1px solid #d1d9e6;border-radius:6px;overflow:hidden;margin-top:8px;}
    .form-hdr{background:#0891b2;color:#fff;padding:5px 8px;font-size:9px;font-weight:700;}
    .form-body{padding:6px 8px;}
    .chart-section{border:1px solid #d1d9e6;border-radius:6px;overflow:hidden;margin-top:10px;break-inside:avoid;}
    .chart-hdr{background:#475569;color:#fff;padding:5px 8px;font-size:9px;font-weight:700;}
    .chart-body{padding:8px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;}
    .chart-img{max-width:48%;height:auto;border:1px solid #e5e7eb;border-radius:4px;}
    .chart-img-full{max-width:100%;height:auto;border:1px solid #e5e7eb;border-radius:4px;}
    .chart-warn{background:#fef9c3;border:1px solid #eab308;border-radius:6px;padding:8px 12px;font-size:9px;color:#92400e;margin-top:8px;}
    .footer{margin-top:6px;font-size:7px;color:#999;text-align:right;}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .card,.chart-section{break-inside:avoid;}}
  </style></head><body>
  <div class="header">
    <h1>📊 Statistiche ${isSingle?aziende[0]:'Tutte le Aziende'} — Anno ${year}</h1>
    <span style="font-size:8px;color:#555">${oggi}</span>
  </div>
  <div class="grid">${cards}</div>
  ${chartsHtml}
  ${totalForm>0?`<div class="form-section">
    <div class="form-hdr">🎓 Formazione per Tipo — ${totalForm} corsi totali</div>
    <div class="form-body">${formRows}</div>
  </div>`:''}
  <div class="footer">Gestionale Dipendenti — ${oggi}</div>
  <script>
    window.onload=function(){
      // Aspetta che tutte le immagini (grafici) siano caricate prima di stampare
      const imgs=[...document.images];
      const pending=imgs.filter(img=>!img.complete);
      if(pending.length===0){
        setTimeout(()=>window.print(),100);
      } else {
        let loaded=0;
        pending.forEach(img=>{
          img.onload=img.onerror=()=>{ loaded++; if(loaded===pending.length) setTimeout(()=>window.print(),100); };
        });
      }
      window.onafterprint=function(){window.close();};
    };
  <\/script>
  </body></html>`;
  const w=window.open('','_blank');
  if(!w){toast('Abilita i popup per stampare','error');return;}
  w.document.write(html);w.document.close();
  console.log('Stampa generata. Grafici inclusi:', chartsHtml.length>0);
};

// (funzione printStats legacy rimossa - era duplicata e copiava innerHTML grezzo coi canvas vuoti)
