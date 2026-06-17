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
  load(){
    for(const t of ['dipendenti','contratti','formazione','sorveglianza','aziende']){
      const local=localStorage.getItem('gest_data_'+t);
      if(local){ try{this.data[t]=JSON.parse(local);}catch{this.data[t]=JSON.parse(JSON.stringify(EMBEDDED_DATA[t]));} }
      else{ this.data[t]=JSON.parse(JSON.stringify(EMBEDDED_DATA[t])); this.save(t); }
    }
  },
  save(t){ localStorage.setItem('gest_data_'+t,JSON.stringify(this.data[t])); },
  getRows(t){ return this.data[t]?.rows||[]; },
  getCols(t){ return this.data[t]?.columns||[]; },
  addRow(t,row){ row._id=Date.now().toString(36)+Math.random().toString(36).slice(2); this.data[t].rows.push(row); this.save(t); },
  updateRow(t,idx,row){ const id=this.data[t].rows[idx]?._id; this.data[t].rows[idx]={...row,_id:id}; this.save(t); },
  deleteRow(t,idx){ this.data[t].rows.splice(idx,1); this.save(t); }
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
  statoDip: ['ATTIVO','NON IN FORZA'],
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

const Allegati = {
  // URL base API NAS - stessa della store
  base(){ return typeof NAS_API !== 'undefined' ? NAS_API.replace('/api','') : ''; },

  // Apri modale allegati per un record
  async openModal(table, recordId, slotDef){
    const { label, slot, single } = slotDef;
    document.getElementById('modal-title').textContent = label;

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

    document.getElementById('modal-body').innerHTML = `
      <div style="margin-bottom:16px">
        ${single ? '<p style="font-size:13px;color:var(--text3);margin-bottom:12px">⚠ Caricando un nuovo file, quello precedente viene sostituito.</p>' : ''}
        <label class="btn btn-primary" style="cursor:pointer;display:inline-flex;align-items:center;gap:8px">
          ➕ ${single ? 'Carica PDF (sostituisce)' : 'Aggiungi PDF'}
          <input type="file" accept=".pdf" style="display:none" id="file-input-${slot}" onchange="Allegati.upload('${table}','${recordId}','${slot}',${single},this)"/>
        </label>
      </div>
      <div id="allegati-list-${slot}">${list}</div>`;

    document.getElementById('modal-footer').innerHTML =
      `<button class="btn btn-ghost" onclick="App.closeModal()">Chiudi</button>`;
    App.openModal();
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
    if(!file) return;
    if(file.type !== 'application/pdf'){ toast('Solo file PDF','error'); return; }

    const base = this.base();
    if(base){
      // Carica sul NAS
      const fd = new FormData();
      fd.append('file', file);
      try{
        const r = await fetch(`${base}/files/${recordId}/${slot}`, { method:'POST', body:fd });
        if(!r.ok) throw new Error('Upload fallito');
        toast('Allegato caricato ✓');
      }catch(e){ toast('Errore upload: '+e.message,'error'); return; }
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
    {t:'👤 Dati Anagrafici',       c:['Cognome','Nome','Data di Nascita','Luogo di Nascita','Sesso','Cittadinanza','Cod. Fiscale']},
    {t:'🏠 Residenza',             c:['Indirizzo Residenza','Comune Residenza','CAP','Provincia Residenza']},
    {t:'📦 Domicilio',             c:['Domicilio diverso Residenza','Indirizzo Domicilio','Comune Domicilio','CAP domicilio','Provincia Domicilio']},
    {t:'📞 Contatti',              c:['Telefono Cellulare','Altro Recapito','Email']},
    {t:'🪪 Documento',             c:['Tipo Documento','N° Documento','Data Rilascio Documento','Scadenza Documento']},
    {t:'🏢 Dati Lavorativi',       c:['Azienda','N° Socio','Stato Socio','Data Delibera Ammissione','Data Delibera Recesso / Esclusione','Stato Dipendente','Mansione','Appalto / sede di lavoro']},
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
  contratti:    {label:'Contratti di Lavoro',    cols:['Id Dipendente (N° Socio)','Azienda','Cognome','Nome','Tipologia contrattuale','Livello','Scadenza Contratto','Stato Dipendente'], status:null},
  formazione:   {label:'Formazione',             cols:['Id Dipendente (N° Socio)','Azienda','Cognome','Nome','Tipologia Corso','Data Corso','Scadenza Corso','Stato Corso','Stato Dipendente'], status:'Stato Corso'},
  sorveglianza: {label:'Sorveglianza Sanitaria', cols:['Id Dipendente (N° Socio)','Azienda','Cognome','Nome','Data visita medica','Scadenza Idoneità','Stato idoneità','Stato dipendente'], status:'Stato idoneità'},
  aziende:      {label:'Anagrafica Aziende',     cols:['Denominazione Ditta','Partita IVA','PEC','Email','Codice ATECO'], status:null},
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

    const sc_=(cl,l,v,s,onclick)=>`<div class="stat-card ${cl}"${onclick?' onclick="'+onclick+'" style="cursor:pointer"':''} title="${onclick?'Clicca per dettagli':''}"><div class="stat-label">${l}</div><div class="stat-value">${v}</div><div class="stat-sub">${s}</div></div>`;
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
        '<button class="btn btn-primary" style="font-size:13px" onclick="App.importGestionale()">📂 Importa Gestionale</button>';
      topbarEl.appendChild(btnWrap);
    }

    document.getElementById('content').innerHTML=
      '<div class="stats-grid">'+
      sc_('blue','Dipendenti',D.length,'in anagrafica',"App.show('dipendenti')")+
      sc_('cyan','Contratti',C.length,'rapporti di lavoro',"App.show('contratti')")+
      sc_('green','Formazione',F.length,'corsi registrati',"App.show('formazione')")+
      sc_('warn','Scadenze Sorveglianza',sc,'entro 90 giorni',"App.dashDetail('scadenze')")+
      sc_('red','Sorveglianza',S.length,'visite registrate',"App.show('sorveglianza')")+
      sc_('blue','Aziende',A.length,'in anagrafica',"App.show('aziende')")+
      sc_('red','Scadenze Permesso',ps,'entro 90 giorni',"App.dashDetail('permessi')")+
      sc_('cyan','Permessi Soggiorno',pp,'dipendenti con permesso',"App.dashDetail('tutti_permessi')")+
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
  goPage(p){const tp=Math.max(1,Math.ceil(this.filtered.length/this.pageSize));this.page=Math.max(1,Math.min(p,tp));this.renderTable(this.table);},

  // ── VISUALIZZA DETTAGLIO ───────────────────────────────────────────────────
  openView(t, idx){
    const row=Store.getRows(t)[idx];
    const meta=TABLE_META[t];
    document.getElementById('modal-title').textContent='👁 Dettaglio — '+meta.label;

    const allCols=Store.getCols(t).filter(c=>!SKIP.has(c)&&c!=='_id');
    const secs=SECTIONS[t]||[{t:'Dati',c:allCols}];

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
    // extra cols not in sections
    const secCols=new Set(secs.flatMap(s=>s.c));
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
    const secs=SECTIONS[t]||[{t:'Campi',c:allCols}];

    // Build an ordered list: first cols that appear in sections, then the rest
    const ordered=[];
    const seen=new Set();
    for(const sec of secs){
      for(const c of sec.c){
        if(allCols.includes(c)&&!seen.has(c)){ ordered.push({c,sec:sec.t}); seen.add(c); }
      }
    }
    for(const c of allCols){ if(!seen.has(c)){ ordered.push({c,sec:'📁 Altri campi'}); seen.add(c); } }

    // Group by section title
    const bySection={};
    for(const {c,sec} of ordered){
      if(!bySection[sec])bySection[sec]=[];
      bySection[sec].push(c);
    }

    let html='';
    for(const [secTitle,cols] of Object.entries(bySection)){
      html+=`<div class="form-section"><div class="form-section-title">${secTitle}</div><div class="form-grid">`;
      for(const c of cols){
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
    for(const c of cols){
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
        // Aggiorna anche le altre tabelle collegate
        this.syncRelatedTables(table, row, idx);
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
    document.getElementById('confirm-title').textContent='Elimina record';
    document.getElementById('confirm-msg').textContent=`Eliminare "${String(name).slice(0,70)}"? Operazione non reversibile.`;
    document.getElementById('confirm-ok').onclick=()=>{
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

  // Campi da copiare da dipendenti alle tabelle collegate
  _dipFields(dip){
    return {
      'Id Dipendente (N° Socio)': dip['N° Socio']||'',
      'Cognome':                  dip['Cognome']||'',
      'Nome':                     dip['Nome']||'',
      'Azienda':                  dip['Azienda']||'',
      'Mansione':                 dip['Mansione']||'',
      'Stato Dipendente':         dip['Stato Dipendente']||'',
      'Stato dipendente':         dip['Stato Dipendente']||'',
      'Appalto / sede di lavoro': dip['Appalto / sede di lavoro']||'',
      'Data assunzione':          dip['Data assunzione']||'',
      'Codice Fiscale':           dip['Codice Fiscale']||'',
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
      cols.forEach(c => { row[c] = shared[c] !== undefined ? shared[c] : ''; });
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
          this._setupConfirmBtns('Importa tutto',()=>{
            let total=0;
            for(const sheetName of matchedSheets){
              const t=sheetMap[sheetName];
              const ws=wb.Sheets[sheetName];
              const rows=XLSX.utils.sheet_to_json(ws,{raw:false,defval:''});
              this._doReplace(t,rows);
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
          addBtn.onclick=()=>{this._doAppend(tableName,rows);this._resetConfirm();this.closeConfirm();};
          document.getElementById('confirm-ok').textContent='Sostituisci';
          document.getElementById('confirm-ok').className='btn btn-danger';
          document.getElementById('confirm-ok').onclick=()=>{this._doReplace(tableName,rows);this._resetConfirm();this.closeConfirm();};
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
        'n° socio':               ['n socio','n.socio','nsocio','numero socio','n° socio','matricola'],
        'id dipendente (n° socio)':['id dipendente','id_dipendente','n° socio','n socio','matricola'],
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

  _doReplace(t,rawRows){
    // Salta righe completamente vuote
    const validRows=rawRows.filter(r=>Object.values(r).some(v=>v!==null&&v!==undefined&&String(v).trim()!==''));
    Store.data[t].rows=validRows.map(r=>{
      const row=this._mapRow(t,r);
      row._id=Date.now().toString(36)+Math.random().toString(36).slice(2);
      return row;
    });
    Store.save(t);
    const b=document.getElementById('badge-'+t); if(b)b.textContent=Store.getRows(t).length;
    if(this.table===t) this.renderTable(t);
    // Se siamo nella dashboard, aggiorna la dashboard
    if(this.view==='dashboard') this.renderDash();
  },

  _doAppend(t,rawRows){
    const validRows=rawRows.filter(r=>Object.values(r).some(v=>v!==null&&v!==undefined&&String(v).trim()!==''));
    validRows.forEach(r=>{
      const row=this._mapRow(t,r);
      Store.addRow(t,row);
    });
    const b=document.getElementById('badge-'+t); if(b)b.textContent=Store.getRows(t).length;
    if(this.table===t) this.renderTable(t);
  },

  // Kept for backward compat
  data_replace(t,rows){ this._doReplace(t,rows); },
  data_append(t,rows){ this._doAppend(t,rows); },

  // ── SVUOTA TABELLA ────────────────────────────────────────────────────────────
  clearTable(t){
    document.getElementById('confirm-title').textContent='⚠ Svuota tabella';
    document.getElementById('confirm-msg').textContent=
      `Sei sicuro di voler eliminare TUTTI i ${Store.getRows(t).length} record di "${TABLE_META[t].label}"? Operazione irreversibile.`;
    document.getElementById('confirm-ok').textContent='Svuota tutto';
    document.getElementById('confirm-ok').className='btn btn-danger';
    document.getElementById('confirm-ok').onclick=()=>{
      Store.data[t].rows=[];
      Store.save(t);
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
try{ Store.load(); }catch(e){ console.error('Store error:',e); }
document.getElementById('loading').classList.add('hidden');
const _sess=Auth.current();
if(_sess){ document.getElementById('login-screen').style.display='none'; App.initApp(_sess); }
else      { document.getElementById('login-screen').style.display='flex'; }
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
    { label:'Data assunzione',     field:'Data assunzione',                    type:'date' },
    { label:'Causa fine rapporto', field:'Causa fine rapporto',                type:'select', opts:'causaFine' },
    { label:'Data fine rapporto',  field:'Data fine rapporto',                 type:'date' },
    { label:'Requisiti Incentivi', field:'Requisiti Incentivi',                type:'select', opts:'incentivi' },
    { label:'Assistenza Sanitaria',field:'Assistenza Sanitaria integrativa',   type:'select', opts:'assistenza' },
    { label:'Data Proroga 1',      field:'Data Proroga 1',                     type:'date' },
    { label:'Data Proroga 2',      field:'Data Proroga 2',                     type:'date' },
    { label:'Appalto / Sede',      field:'Appalto / sede di lavoro',           type:'text' },
  ],
  formazione: [
    { label:'ID Socio',            field:'Id Dipendente (N° Socio)',           type:'text' },
    { label:'Cognome',             field:'Cognome',                            type:'text' },
    { label:'Nome',                field:'Nome',                               type:'text' },
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
    { label:'Azienda',             field:'Azienda',                            type:'select', opts:'aziende' },
    { label:'Stato Dipendente',    field:'Stato Dipendente',                   type:'select', opts:'statoDip' },
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

App.openAdvSearch = function(t){
  _advTable = t;
  _advRowCount = 0;
  App.advCriteria = [];

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
    if(op==='is')           return rv === v1;
    if(op==='is_not')       return rv !== v1;
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

  const advCount=this.advCriteria?this.advCriteria.length:0;
  const advBadge=advCount?`<span style="background:var(--accent);color:#fff;border-radius:12px;padding:1px 8px;font-size:11px;margin-left:4px">${advCount} filtri</span>`:'';
  const resetBtn=advCount?`<button class="btn btn-ghost" style="font-size:12px;color:var(--danger)" onclick="App.advCriteria=[];App.renderTable('${t}')">✕ Rimuovi filtri</button>`:'';

  const ths=cols.map(c=>`<th class="${this.sortCol===c?'sorted':''}" onclick="App.sortBy('${esc(c)}')">${esc(c)} <span class="sort-icon">${this.sortCol===c?(this.sortDir===1?'↑':'↓'):'↕'}</span></th>`).join('')+
    `<th style="width:100px;cursor:pointer" onclick="App.sortCol=null;App.sortDir=1;App.renderTable('${t}')" title="Torna all'ordine di inserimento">
      ${!this.sortCol?'🕒 Inserimento':'↺'}</th>`;
  const trs=page.map(row=>{
    const oi=all.indexOf(row);
    const tds=cols.map(c=>{const v=row[c]??'';return meta.status===c?'<td>'+pill(v)+'</td>':`<td title="${esc(v)}">${esc(v)}</td>`;}).join('');
    const actView=`<button class="icon-btn view" title="Visualizza" onclick="App.openView('${t}',${oi})">👁</button>`;
    const actMod=Auth.can('edit')?`<button class="icon-btn" title="Modifica" onclick="App.openEdit('${t}',${oi})">✎</button>`:'';
    const actDel=Auth.can('delete')?`<button class="icon-btn danger" title="Elimina" onclick="App.confirmDelete('${t}',${oi})">✕</button>`:'';
    return`<tr>${tds}<td><div class="td-actions">${actView}${actMod}${actDel}</div></td></tr>`;
  }).join('')||'<tr><td colspan="99" style="text-align:center;color:var(--text3);padding:36px">Nessun risultato</td></tr>';

  let pgs='';const mB=7,sP=Math.max(1,Math.min(this.page-3,tp-mB+1)),eP=Math.min(tp,sP+mB-1);
  for(let i=sP;i<=eP;i++)pgs+=`<button class="page-btn ${i===this.page?'active':''}" onclick="App.goPage(${i})">${i}</button>`;

  document.getElementById('content').innerHTML=`
    <div class="table-wrap">
      <div class="table-toolbar">
        <span style="font-size:14px;color:var(--text2);font-weight:600">${meta.label}${advBadge}</span>
        ${resetBtn}
        <span class="record-count">${this.filter||advCount?tot+' filtrati / ':''}${all.length} totali</span>
        ${Auth.can('quick_search')?`<button class="btn btn-ghost" style="font-size:13px;background:var(--accent);color:#fff;border-color:var(--accent)" onclick="App.openQuickSearches('${t}')">⚡ Ricerche Rapide</button>`:''}
        ${Auth.can('adv_search')?`<button class="btn btn-ghost" style="font-size:13px;border-color:var(--accent);color:var(--accent)" onclick="App.openAdvSearch('${t}')">🔍 Ricerca Avanzata</button>`:''}
        ${Auth.can('export')?`<button class="btn btn-ghost" style="font-size:13px" onclick="App.exportXLSX('${t}')">↓ Excel</button>`:''}
        ${Auth.can('import')?`<button class="btn btn-ghost" style="font-size:13px" onclick="App.importXLSX('${t}')">↑ Importa</button>`:''}
        ${Auth.can('print')?`<button class="btn btn-ghost" style="font-size:13px" onclick="App.printTable('${t}')">🖨 Stampa</button>`:''}
        ${Auth.can('clear_table')?`<button class="btn btn-ghost" style="font-size:13px;color:var(--danger);border-color:#fca5a5" onclick="App.clearTable('${t}')">🗑 Svuota</button>`:''}
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
};

// ─── RICERCHE RAPIDE ──────────────────────────────────────────────────────────

const QUICK_SEARCHES = {
  dipendenti: [
    {
      id:'aliante_soci', icon:'👥',
      label:'ALIANTE — Elenco Soci per Assemblee',
      desc:'Soci ATTIVI di ALIANTE Soc. Coop.',
      table:'dipendenti',
      cols:['N° Socio','Cognome','Nome','Data Delibera Ammissione','Note'],
      criteria:[
        {field:'Azienda',        fieldDef:{type:'select'}, op:'is', val1:'ALIANTE Soc. Coop.', val2:'', connector:'AND'},
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
        {field:'Azienda',     fieldDef:{type:'select'}, op:'is', val1:'CAPITOLINA LOGISTICA Scarl', val2:'', connector:'AND'},
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
        {field:'Azienda',     fieldDef:{type:'select'}, op:'is', val1:'FIPAM  Scarl', val2:'', connector:'AND'},
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
        {field:'Azienda',     fieldDef:{type:'select'}, op:'is', val1:'SERIAM Scarl', val2:'', connector:'AND'},
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
        {field:'Azienda',        fieldDef:{type:'select'}, op:'is',           val1:'ALIANTE Soc. Coop.', val2:'', connector:'AND'},
        {field:'Tipo permesso',  fieldDef:{type:'select'}, op:'is_not_empty', val1:'',                   val2:'', connector:'AND'},
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
      desc:'Dipendenti assunti o cessati nella settimana precedente',
      table:'dipendenti',
      cols:['Azienda','Cognome','Nome','Data di Nascita','Luogo di Nascita','Codice Fiscale','Mansione','Stato Dipendente','Data assunzione','Data fine rapporto','Appalto / sede di lavoro'],
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
  formazione: [
    {
      id:'form_scadenza_mese', icon:'📅',
      label:'Scadenzario Formazione — Mese Corrente e Prossimo',
      desc:'Corsi con scadenza nei prossimi 60 giorni',
      table:'formazione',
      cols:['Id Dipendente (N° Socio)','Azienda','Cognome','Nome','Stato Dipendente','Mansione','Appalto / sede di lavoro','Tipologia Corso','Scadenza Corso','Stato Corso'],
      criteria:[
        {field:'Scadenza Corso', fieldDef:{type:'date'}, op:'next_60_days', val1:'', val2:'', connector:'AND'},
        {field:'Stato Corso',    fieldDef:{type:'select'}, op:'is', val1:'Completato', val2:'', connector:'AND'},
      ]
    },
    {
      id:'form_corso_base', icon:'📅',
      label:'Scadenzario Corso Base — Mese Corrente e Prossimo',
      desc:'Corso Base in scadenza nei prossimi 60 giorni',
      table:'formazione',
      cols:['Cognome','Nome','Mansione','Stato Dipendente','Appalto / sede di lavoro','Tipologia Corso','Scadenza Corso','Azienda'],
      criteria:[
        {field:'Tipologia Corso', fieldDef:{type:'select'}, op:'is', val1:'Corso Base', val2:'', connector:'AND'},
        {field:'Scadenza Corso',  fieldDef:{type:'date'}, op:'next_60_days', val1:'', val2:'', connector:'AND'},
      ]
    },
    {
      id:'form_da_completare', icon:'⏳',
      label:'Formazione Da Completare',
      desc:'Corsi con stato "Da completare"',
      table:'formazione',
      cols:['Id Dipendente (N° Socio)','Azienda','Cognome','Nome','Tipologia Corso','Data Corso','Scadenza Corso','Stato Corso'],
      criteria:[
        {field:'Stato Corso', fieldDef:{type:'select'}, op:'is', val1:'Da completare', val2:'', connector:'AND'},
      ]
    },
    {
      id:'form_scaduti', icon:'🔴',
      label:'Formazione Scaduta',
      desc:'Corsi con scadenza già passata',
      table:'formazione',
      cols:['Id Dipendente (N° Socio)','Azienda','Cognome','Nome','Tipologia Corso','Scadenza Corso','Stato Corso'],
      criteria:[
        {field:'Scadenza Corso', fieldDef:{type:'date'}, op:'before', val1:new Date().toISOString().slice(0,10), val2:'', connector:'AND'},
        {field:'Stato Corso',    fieldDef:{type:'select'}, op:'is', val1:'Completato', val2:'', connector:'AND'},
      ]
    },
  ],
  sorveglianza: [
    {
      id:'sorv_scadenza_mese', icon:'📅',
      label:'Scadenze Idoneità — Mese Corrente e Prossimo',
      desc:'Visite con scadenza nei prossimi 60 giorni',
      table:'sorveglianza',
      cols:['Azienda','Cognome','Nome','Mansione','Appalto / sede di lavoro','Data assunzione','Scadenza Idoneità','Stato idoneità','Data Analisi','Note'],
      criteria:[
        {field:'Scadenza Idoneità', fieldDef:{type:'date'}, op:'next_60_days', val1:'', val2:'', connector:'AND'},
      ]
    },
    {
      id:'sorv_scaduti', icon:'🔴',
      label:'Idoneità Scaduta',
      desc:'Dipendenti con scadenza idoneità già passata',
      table:'sorveglianza',
      cols:['Azienda','Cognome','Nome','Mansione','Scadenza Idoneità','Stato idoneità','Medico'],
      criteria:[
        {field:'Scadenza Idoneità', fieldDef:{type:'date'}, op:'before', val1:new Date().toISOString().slice(0,10), val2:'', connector:'AND'},
      ]
    },
    {
      id:'sorv_prescrizioni', icon:'🟡',
      label:'Idonei con Prescrizioni',
      desc:'Dipendenti con prescrizioni mediche',
      table:'sorveglianza',
      cols:['Azienda','Cognome','Nome','Mansione','Scadenza Idoneità','Stato idoneità','Note prescrizione','Medico'],
      criteria:[
        {field:'Stato idoneità', fieldDef:{type:'select'}, op:'contains', val1:'prescrizioni', val2:'', connector:'AND'},
      ]
    },
    {
      id:'sorv_in_attesa', icon:'🔵',
      label:'In Attesa di Visita',
      desc:'Dipendenti in attesa di visita medica',
      table:'sorveglianza',
      cols:['Azienda','Cognome','Nome','Mansione','Data visita medica','Scadenza Idoneità','Stato idoneità'],
      criteria:[
        {field:'Stato idoneità', fieldDef:{type:'select'}, op:'contains', val1:'attesa', val2:'', connector:'AND'},
      ]
    },
  ],
  contratti: [
    {
      id:'cont_scadenza_30', icon:'📅',
      label:'Contratti in Scadenza — Prossimi 30 Giorni',
      desc:'Contratti a tempo determinato in scadenza',
      table:'contratti',
      cols:['Id Dipendente (N° Socio)','Azienda','Cognome','Nome','Tipologia contrattuale','Data inizio','Scadenza Contratto','Mansione'],
      criteria:[
        {field:'Scadenza Contratto',       fieldDef:{type:'date'},   op:'next_30_days', val1:'', val2:'', connector:'AND'},
        {field:'Tipologia contrattuale',   fieldDef:{type:'select'}, op:'is', val1:'Tempo determinato', val2:'', connector:'AND'},
      ]
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
  ],
  aziende:[],
};

// ── Dynamic criteria helpers ──────────────────────────────────────────────────
function buildDynamicCriteria(dynamicKey){
  if(dynamicKey === 'entrate_uscite'){
    // Settimana precedente: da lunedi scorso a domenica scorsa
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=dom, 1=lun...
    const daysToLastMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const lastMon = new Date(now); lastMon.setDate(now.getDate() - daysToLastMon - 7);
    const lastSun = new Date(lastMon); lastSun.setDate(lastMon.getDate() + 6);
    const fromISO = lastMon.toISOString().slice(0,10);
    const toISO   = lastSun.toISOString().slice(0,10);
    return [
      {field:'Data assunzione',      fieldDef:{type:'date'}, op:'between', val1:fromISO, val2:toISO, connector:'AND'},
    ];
  }
  return [];
}

// ── Quick search modal ────────────────────────────────────────────────────────
App.openQuickSearches = function(t){
  const searches = QUICK_SEARCHES[t] || [];
  const meta = TABLE_META[t];
  if(!searches.length){ toast('Nessuna ricerca rapida per questa tabella','error'); return; }

  document.getElementById('modal-title').textContent = '⚡ Ricerche Rapide — '+meta.label;

  let html = '<div class="quick-search-grid">';
  searches.forEach(s => {
    const crit = s.dynamic ? buildDynamicCriteria(s.dynamic) : s.criteria;
    const srcRows = Store.getRows(s.table || t);
    const count = srcRows.filter(r => advMatchesCriteria(r, crit)).length;
    html += `
      <div class="quick-card" onclick="App.runQuickSearch('${t}','${s.id}')">
        <div class="quick-card-icon">${s.icon}</div>
        <div class="quick-card-label">${esc(s.label)}</div>
        <div class="quick-card-desc">${esc(s.desc)}</div>
        <div class="quick-card-count">${count} record</div>
      </div>`;
  });
  html += '</div>';

  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-footer').innerHTML =
    `<button class="btn btn-ghost" onclick="App.closeModal()">Chiudi</button>`;
  App.openModal();
};

// ── Run quick search → show results in styled table inside modal ──────────────
App.runQuickSearch = function(t, id){
  const searches = QUICK_SEARCHES[t] || [];
  const s = searches.find(x => x.id === id);
  if(!s) return;

  const srcTable = s.table || t;
  const crit = s.dynamic ? buildDynamicCriteria(s.dynamic) : s.criteria;
  const allRows = Store.getRows(srcTable);
  const storeCols = Store.getCols(srcTable);
  const rows = allRows.filter(r => advMatchesCriteria(r, crit));

  // Use only cols that exist in store
  const cols = s.cols.filter(c => storeCols.includes(c));

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
  const searches = QUICK_SEARCHES[t] || [];
  const s = searches.find(x => x.id === id);
  if(!s) return;
  App.advCriteria = s.dynamic ? buildDynamicCriteria(s.dynamic) : s.criteria;
  App.filter = '';
  document.getElementById('search-input').value = '';
  App.page = 1;
  App.closeModal();
  App.renderTable(t);
  toast(s.icon+' '+s.label+' — '+App.filtered.length+' risultati');
};

// ── Print quick result ────────────────────────────────────────────────────────
App.printQuickResult = function(id, t){
  const searches = QUICK_SEARCHES[t] || [];
  const s = searches.find(x => x.id === id);
  if(!s) return;
  const srcTable = s.table || t;
  const crit = s.dynamic ? buildDynamicCriteria(s.dynamic) : s.criteria;
  const allRows = Store.getRows(srcTable);
  const storeCols = Store.getCols(srcTable);
  const rows = allRows.filter(r => advMatchesCriteria(r, crit));
  if(rows.includes && rows.sort) rows.sort((a,b) => (a.Cognome||'').localeCompare(b.Cognome||''));
  const cols = s.cols.filter(c => storeCols.includes(c));
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
  const searches = QUICK_SEARCHES[t] || [];
  const s = searches.find(x => x.id === id);
  if(!s) return;
  const srcTable = s.table || t;
  const crit = s.dynamic ? buildDynamicCriteria(s.dynamic) : s.criteria;
  const allRows = Store.getRows(srcTable);
  const storeCols = Store.getCols(srcTable);
  const rows = allRows.filter(r => advMatchesCriteria(r, crit));
  const cols = s.cols.filter(c => storeCols.includes(c));
  const data=[cols,...rows.map(r=>cols.map(c=>r[c]||''))];
  const ws=XLSX.utils.aoa_to_sheet(data);
  ws['!cols']=cols.map(c=>({wch:Math.max(c.length,12)}));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,s.label.slice(0,31));
  XLSX.writeFile(wb,s.label.replace(/[^a-zA-Z0-9]/g,'_').slice(0,50)+'_'+new Date().toISOString().slice(0,10)+'.xlsx');
  toast('Excel scaricato ✓');
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

App.printStats = function(){
  const year = parseInt(document.getElementById('stats-year')?.value || new Date().getFullYear());
  const content = document.getElementById('stats-content')?.innerHTML || '';
  const oggi = new Date().toLocaleDateString('it-IT');
  const html = `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"/>
  <title>Statistiche ${year}</title>
  <style>
    @page{size:A4 portrait;margin:10mm;}
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:Arial,sans-serif;font-size:9px;color:#111;}
    .header{border-bottom:2px solid #1F4E79;padding-bottom:6px;margin-bottom:12px;display:flex;justify-content:space-between;}
    .header h1{font-size:14px;font-weight:800;color:#1F4E79;}
    .stats-az-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;}
    .stats-az-card{border:1px solid #d1d9e6;border-radius:6px;overflow:hidden;}
    .stats-az-header{background:#1F4E79;color:#fff;padding:5px 8px;font-size:9px;font-weight:700;}
    .stats-az-body{padding:6px 8px;}
    .stats-section-title{font-size:8px;font-weight:700;color:#2E75B6;text-transform:uppercase;margin:5px 0 2px;letter-spacing:.04em;}
    .stat-row{display:flex;justify-content:space-between;padding:1px 0;font-size:8px;border-bottom:1px solid #f1f5f9;}
    .stat-row-val{font-weight:700;}
    .bar-item{display:flex;align-items:center;gap:6px;margin-bottom:5px;}
    .bar-label{font-size:8px;width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .bar-track{flex:1;height:6px;background:#e5e7eb;border-radius:3px;}
    .bar-fill{height:100%;background:#0891b2;border-radius:3px;}
    .bar-count{font-size:8px;width:24px;text-align:right;}
    .panel{border:1px solid #d1d9e6;border-radius:6px;overflow:hidden;}
    .panel-header{background:#f5f7fb;padding:6px 10px;font-size:9px;font-weight:700;border-bottom:1px solid #d1d9e6;}
    .panel-body{padding:8px 10px;}
    .footer{margin-top:8px;font-size:7px;color:#999;text-align:right;}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
  </style></head><body>
  <div class="header"><h1>📊 Statistiche Dipendenti — Anno ${year}</h1><span>${oggi}</span></div>
  ${content}
  <div class="footer">Gestionale Dipendenti — ${oggi}</div>
  <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};<\/script>
  </body></html>`;
  const w=window.open('','_blank');
  if(!w){toast('Abilita i popup','error');return;}
  w.document.write(html); w.document.close();
};
