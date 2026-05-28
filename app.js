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
  dipendenti:   {label:'Dipendenti',             cols:['Cognome','Nome','Cod. Fiscale','Azienda','Mansione','Stato Dipendente','Sesso'],        status:null},
  contratti:    {label:'Contratti di Lavoro',    cols:['Cognome e Nome','Azienda','Data inizio','Data fine','Tipologia contrattuale','Livello'], status:null},
  formazione:   {label:'Formazione',             cols:['Cognome e Nome','Azienda','Tipologia Corso','Data Corso','Scadenza Corso','Stato Corso'],status:'Stato Corso'},
  sorveglianza: {label:'Sorveglianza Sanitaria', cols:['Cognome e Nome','Azienda','Data visita medica','Scadenza Idoneità','Stato idoneità'],   status:'Stato idoneità'},
  aziende:      {label:'Anagrafica Aziende',     cols:['Denominazione Ditta','Partita IVA','PEC','Email','Codice ATECO'],                       status:null},
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

function buildField(col, val){
  val = String(val??'');
  const def = FIELDS[col];

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
      sw.style.display='none'; ba.style.display='none'; this.renderDash();
    } else if(v==='utenti'){
      sw.style.display='none'; ba.style.display=Auth.isAdmin()?'':'none';
      ba.onclick=()=>this.openAddUser(); this.renderUsers();
    } else {
      this.table=v; sw.style.display=''; ba.style.display=Auth.canEdit()?'':'none';
      ba.onclick=()=>this.openAdd(); this.renderTable(v);
    }
  },

  search(val){ this.filter=val.toLowerCase(); this.page=1; this.renderTable(this.table); },

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

    const sc_=(cl,l,v,s)=>`<div class="stat-card ${cl}"><div class="stat-label">${l}</div><div class="stat-value">${v}</div><div class="stat-sub">${s}</div></div>`;
    const bar_=(l,n,m,c)=>`<div class="bar-item"><span class="bar-label" title="${esc(l)}">${esc(l)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/m*100)}%;background:${c}"></div></div><span class="bar-count">${n}</span></div>`;
    const pan_=(t,b)=>`<div class="panel"><div class="panel-header">${t}</div><div class="panel-body">${b}</div></div>`;

    document.getElementById('content').innerHTML=
      '<div class="stats-grid">'+
      sc_('blue','Dipendenti',D.length,'in anagrafica')+
      sc_('cyan','Contratti',C.length,'rapporti di lavoro')+
      sc_('green','Formazione',F.length,'corsi registrati')+
      sc_('warn','Scadenze Sorveg.',sc,'entro 90 giorni')+
      sc_('red','Sorveglianza',S.length,'visite registrate')+
      sc_('blue','Aziende',A.length,'in anagrafica')+
      '</div><div class="dash-grid">'+
      pan_('📄 Contratti per Azienda',topAz.map(([a,n])=>bar_(a,n,mAz,'var(--accent)')).join(''))+
      pan_('🎓 Formazione per Tipo',topF.map(([t,n])=>bar_(t,n,mF,'var(--accent2)')).join(''))+
      pan_('🏥 Giudizi Sorveglianza',Object.entries(gC).sort((a,b)=>b[1]-a[1]).map(([g,n])=>`<div class="bar-item"><span class="bar-label">${pill(g)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/S.length*100)}%;background:var(--success)"></div></div><span class="bar-count">${n}</span></div>`).join(''))+
      pan_('📊 Riepilogo','<table style="width:100%;font-size:14px">'+
        [['Dipendenti',D.length,''],['Contratti',C.length,''],['Formazione',F.length,''],['Sorveglianza',S.length,''],['⚠ Scadenze 90gg',sc,'color:var(--warn)']].map(([l,v,s],i,a)=>
          `<tr><td style="color:var(--text3);padding:8px 0;${i<a.length-1?'border-bottom:1px solid var(--border)':''}">${l}</td><td style="text-align:right;font-weight:700;padding:8px 0;${s};${i<a.length-1?'border-bottom:1px solid var(--border)':''}">${v}</td></tr>`
        ).join('')+'</table>')+
      '</div>';
  },

  // ── TABELLA ────────────────────────────────────────────────────────────────
  renderTable(t){
    const all=Store.getRows(t), cols=dispCols(t), meta=TABLE_META[t], canEdit=Auth.canEdit();
    let rows=all;
    if(this.filter){const q=this.filter;rows=all.filter(r=>Object.values(r).some(v=>String(v).toLowerCase().includes(q)));}
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
          <button class="btn btn-ghost" style="font-size:13px" onclick="App.exportCSV('${t}')">↓ CSV</button>
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
    _formState={table:t, idx:idx};
    document.getElementById('modal-title').textContent=(idx!==null?'✎ Modifica':'＋ Nuovo')+' — '+TABLE_META[t].label;

    const allCols=Store.getCols(t);
    const secs=SECTIONS[t]||[{t:'Campi',c:allCols.filter(c=>!SKIP.has(c))}];

    // collect all cols that will appear in form
    const usedCols=new Set();
    let html='';

    for(const sec of secs){
      const visCols=sec.c.filter(c=>!SKIP.has(c)&&c!=='_id');
      if(!visCols.length)continue;
      html+=`<div class="form-section"><div class="form-section-title">${sec.t}</div><div class="form-grid">`;
      for(const c of visCols){
        usedCols.add(c);
        const def=FIELDS[c];
        const wide=def?.type==='radio'||def?.type==='textarea'||c.toLowerCase().includes('note')||c.toLowerCase().includes('indirizzo');
        html+=`<div class="form-group ${wide?'full':''}"><label class="field-label">${esc(c)}</label>${buildField(c,row?row[c]:'')}</div>`;
      }
      html+='</div></div>';
    }
    // extra cols from store not covered by sections
    const extra=allCols.filter(c=>!usedCols.has(c)&&!SKIP.has(c)&&c!=='_id');
    if(extra.length){
      html+='<div class="form-section"><div class="form-section-title">📁 Altri campi</div><div class="form-grid">';
      for(const c of extra){
        usedCols.add(c);
        html+=`<div class="form-group"><label class="field-label">${esc(c)}</label>${buildField(c,row?row[c]:'')}</div>`;
      }
      html+='</div></div>';
    }

    _formState.cols=[...usedCols];

    document.getElementById('modal-body').innerHTML=html;
    document.getElementById('modal-footer').innerHTML=`
      <button class="btn btn-ghost" onclick="App.closeModal()">Annulla</button>
      <button class="btn btn-primary" id="btn-save-form">${idx!==null?'✓ Salva modifiche':'＋ Aggiungi'}</button>`;

    // attach save handler DIRECTLY — no JSON in onclick!
    document.getElementById('btn-save-form').addEventListener('click', ()=>this.saveForm());
    this.openModal();
  },

  saveForm(){
    const {table,cols,idx}=_formState;
    if(!table){toast('Errore: tabella non impostata','error');return;}
    const row={};
    for(const c of cols){ row[c]=readField(c); }
    if(idx!==null){
      Store.updateRow(table,idx,row);
      toast('Record aggiornato ✓');
    } else {
      Store.addRow(table,row);
      toast('Record aggiunto ✓');
    }
    this.closeModal();
    const b=document.getElementById('badge-'+table);
    if(b) b.textContent=Store.getRows(table).length;
    this.renderTable(table);
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

  // ── CSV ────────────────────────────────────────────────────────────────────
  exportCSV(t){
    const rows=this.filtered.length?this.filtered:Store.getRows(t);
    const cols=Store.getCols(t).filter(c=>c&&c!=='_id');
    const lines=[cols.map(c=>'"'+c+'"').join(',')];
    rows.forEach(r=>lines.push(cols.map(c=>'"'+String(r[c]||'').replace(/"/g,'""')+'"').join(',')));
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob(['\uFEFF'+lines.join('\n')],{type:'text/csv;charset=utf-8'}));
    a.download=t+'_'+new Date().toISOString().slice(0,10)+'.csv';a.click();
    toast('Export CSV completato');
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
