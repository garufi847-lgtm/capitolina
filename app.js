'use strict';

// ─── AUTH ─────────────────────────────────────────────────────────────────────
const DEFAULT_USERS = [
  { username:'admin',  password:'admin123',   role:'admin',  nome:'Amministratore' },
  { username:'hr',     password:'hr2024',     role:'editor', nome:'Ufficio HR' },
  { username:'viewer', password:'viewer2024', role:'viewer', nome:'Visualizzatore' },
];
const Auth = {
  getUsers(){ const s=localStorage.getItem('gest_users'); return s?JSON.parse(s):DEFAULT_USERS; },
  saveUsers(u){ localStorage.setItem('gest_users',JSON.stringify(u)); },
  login(u,p){ const x=this.getUsers().find(x=>x.username===u&&x.password===p); if(x){sessionStorage.setItem('gest_sess',JSON.stringify(x));return x;} return null; },
  logout(){ sessionStorage.removeItem('gest_sess'); },
  current(){ const s=sessionStorage.getItem('gest_sess'); return s?JSON.parse(s):null; },
  canEdit(){ const u=this.current(); return u&&(u.role==='admin'||u.role==='editor'); },
  isAdmin(){ const u=this.current(); return u&&u.role==='admin'; }
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
  dipendenti:   {label:'Dipendenti',             cols:['N° Socio','Azienda','Cognome','Nome','Mansione','Stato Dipendente','Codice Fiscale'],                                                   status:null},
  contratti:    {label:'Contratti di Lavoro',    cols:['Id Dipendente (N° Socio)','Azienda','Cognome','Nome','Tipologia contrattuale','Livello','Scadenza Contratto'],                          status:null},
  formazione:   {label:'Formazione',             cols:['Id Dipendente (N° Socio)','Azienda','Cognome','Nome','Tipologia Corso','Data Corso','Scadenza Corso','Stato Corso'],                    status:'Stato Corso'},
  sorveglianza: {label:'Sorveglianza Sanitaria', cols:['Id Dipendente (N° Socio)','Azienda','Cognome','Nome','Data visita medica','Scadenza Idoneità','Stato idoneità'],                        status:'Stato idoneità'},
  aziende:      {label:'Anagrafica Aziende',     cols:['Denominazione Ditta','Partita IVA','PEC','Email','Codice ATECO'],                                                                       status:null},
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
      ba.style.display='';
      ba.textContent='📂 Importa Gestionale';
      ba.className='btn btn-primary';
      ba.onclick=()=>this.importXLSX('dipendenti');
      this.renderDash();
    } else if(v==='utenti'){
      sw.style.display='none'; ba.style.display=Auth.isAdmin()?'':'none';
      ba.textContent='+ Aggiungi'; ba.className='btn btn-primary';
      ba.onclick=()=>this.openAddUser(); this.renderUsers();
    } else {
      this.table=v; sw.style.display=''; ba.style.display=Auth.canEdit()?'':'none';
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

    const ths=cols.map(c=>`<th class="${this.sortCol===c?'sorted':''}" onclick="App.sortBy('${esc(c)}')">${esc(c)} <span class="sort-icon">${this.sortCol===c?(this.sortDir===1?'↑':'↓'):'↕'}</span></th>`).join('')+'<th style="width:100px">Azioni</th>';

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
    _formState={table:t, idx:idx, cols:[]};
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

    // Aggiungi sezioni allegati
    const allegSlots = ALLEGATI_SLOTS[t] || [];
    if(allegSlots.length && idx !== null){
      const row = Store.getRows(t)[idx];
      const recordId = row?._id || ('new_'+Date.now());
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
      if(idx!==null){ Store.updateRow(table,idx,row); toast('Record aggiornato ✓'); }
      else           { Store.addRow(table,row);        toast('Record aggiunto ✓'); }
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
    document.getElementById('content').innerHTML=`
      <div class="table-wrap"><div class="table-scroll"><table>
        <thead><tr><th>Username</th><th>Nome</th><th>Ruolo</th><th>Azioni</th></tr></thead>
        <tbody>${Auth.getUsers().map((u,i)=>`<tr>
          <td>${esc(u.username)}</td><td>${esc(u.nome)}</td>
          <td><span class="pill ${u.role==='admin'?'pill-red':u.role==='editor'?'pill-blue':'pill-gray'}">${u.role}</span></td>
          <td><div class="td-actions">
            <button class="icon-btn" onclick="App.openEditUser(${i})">✎</button>
            <button class="icon-btn danger" onclick="App.confirmDeleteUser(${i})">✕</button>
          </div></td></tr>`).join('')}
        </tbody>
      </table></div></div>`;
  },
  openAddUser(){ this._openUserForm(null,null); },
  openEditUser(i){ this._openUserForm(Auth.getUsers()[i],i); },
  _openUserForm(u,idx){
    document.getElementById('modal-title').textContent=u?'Modifica Utente':'Nuovo Utente';
    document.getElementById('modal-body').innerHTML=`
      <div class="form-grid" style="padding:0">
        <div class="form-group"><label class="field-label">Username</label><input type="text" id="u_un" value="${esc(u?.username||'')}"/></div>
        <div class="form-group"><label class="field-label">Nome</label><input type="text" id="u_no" value="${esc(u?.nome||'')}"/></div>
        <div class="form-group"><label class="field-label">Password</label><input type="password" id="u_pw" placeholder="${u?'Lascia vuoto per non cambiare':'Password'}"/></div>
        <div class="form-group"><label class="field-label">Ruolo</label>
          <select id="u_ro">
            <option value="viewer" ${u?.role==='viewer'?'selected':''}>viewer – solo lettura</option>
            <option value="editor" ${u?.role==='editor'?'selected':''}>editor – modifica</option>
            <option value="admin"  ${u?.role==='admin' ?'selected':''}>admin – completo</option>
          </select></div></div>`;
    document.getElementById('modal-footer').innerHTML=
      `<button class="btn btn-ghost" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-primary" id="btn-save-user">Salva</button>`;
    document.getElementById('btn-save-user').addEventListener('click',()=>{
      const un=document.getElementById('u_un').value.trim();
      const no=document.getElementById('u_no').value.trim();
      const pw=document.getElementById('u_pw').value;
      const ro=document.getElementById('u_ro').value;
      if(!un||!no){toast('Compila tutti i campi','error');return;}
      const users=Auth.getUsers();
      if(idx===null){if(!pw){toast('Inserisci una password','error');return;}users.push({username:un,nome:no,password:pw,role:ro});}
      else{users[idx]={username:un,nome:no,role:ro,password:pw||users[idx].password};}
      Auth.saveUsers(users);toast('Utente salvato');this.closeModal();this.renderUsers();
    });
    this.openModal();
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

  // ── IMPORT XLSX ──────────────────────────────────────────────────────────────
  // Mapping: foglio xlsx → chiave tabella interna
  _sheetMap(){
    return {
      'Anagrafica Dipendente':  'dipendenti',
      'Contratti di Lavoro':    'contratti',
      'Formazione':             'formazione',
      'Sorveglianza Sanitaria': 'sorveglianza',
      'Anagrafica Azienda':     'aziende',
    };
  },

  importXLSX(targetTable){
    const input=document.createElement('input');
    input.type='file'; input.accept='.xlsx,.xls';
    input.onchange=async(e)=>{
      const file=e.target.files[0]; if(!file)return;
      try{
        const buf=await file.arrayBuffer();
        const wb=XLSX.read(buf,{type:'array',raw:false,cellDates:false,cellText:true});
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
      if(rawRow[col]!==undefined){ row[col]=String(rawRow[col]||''); continue; }
      // 2. Corrispondenza case-insensitive
      const lc=col.toLowerCase().trim();
      if(rawLower[lc]){ row[col]=String(rawRow[rawLower[lc]]||''); continue; }
      // 3. Varianti note
      const aliases={
        'n° socio':          ['n socio','n.socio','nsocio','numero socio','n° socio'],
        'id dipendente (n° socio)': ['id dipendente','id_dipendente','n° socio','n socio'],
        'codice fiscale':    ['codice fiscale','codicefiscale','cf'],
        'codice fiscale':    ['codice fiscale','codice_fiscale'],
        'stato dipendente':  ['stato dipendente','stato_dipendente'],
        'stato dipendente':  ['stato dipendente'],
        'data assunzione':   ['data assunzione','data_assunzione'],
        'tipologia corso':   ['tipo formazione','tipologia corso'],
        'scadenza idoneità': ['scadenza idoneita','scadenza idoneit'],
        'stato idoneità':    ['stato idoneita','stato idoneit'],
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
    Store.data[t].rows=rawRows.map(r=>{
      const row=this._mapRow(t,r);
      row._id=Date.now().toString(36)+Math.random().toString(36).slice(2);
      return row;
    });
    Store.save(t);
    const b=document.getElementById('badge-'+t); if(b)b.textContent=Store.getRows(t).length;
    if(this.table===t) this.renderTable(t);
  },

  _doAppend(t,rawRows){
    rawRows.forEach(r=>{
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
