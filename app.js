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
  el.innerHTML='<span>'+(type==='success'?'✓':'✕')+'</span> '+msg;
  document.getElementById('toast').appendChild(el);
  setTimeout(()=>el.remove(),3000);
}

// ─── FIELD DEFINITIONS ────────────────────────────────────────────────────────
// Defines which columns get select/radio/checkbox/date treatment in forms

const AZIENDE_OPTS = ['ALIANTE Soc. Coop.','FIPAM  Scarl','SERIAM Scarl','CAPITOLINA LOGISTICA Scarl','CONSORZIO CAPITOLINA Srl','SNA Servizi & Management Srl'];
const MANSIONI_OPTS = ['Addetto controllo accessi','Addetto manutenzione aree verdi','Addetto pulizie','Addetto pulizie esterne','Addetto Ristorazione','Autista pat. B','Cameriera ai piani','Cameriera ai piani / Addetto ristorazione','Custode','Facchino','Facchino / Muletto',"Facchino d'albergo","Facchino d'albergo / Addetto ristorazione",'Fattorino','Governante','Impiegato amministrativo','Magazziniere','Magazziniere / Muletto','Manutentore','Addetto Pulizie','Responsabile'];
const STATO_DIP_OPTS = ['ATTIVO','NON IN FORZA'];
const STATO_SOCIO_OPTS = ['ATTIVO','NON ATTIVO'];
const CERBA_OPTS = ['CERBA HEALTH CARE - Albano','CERBA HEALTH CARE - Appia (Roma)','CERBA HEALTH CARE - Balduina (Roma)','CERBA HEALTH CARE - Bologna (Roma)','CERBA HEALTH CARE - Casetta Mattei (Roma)','CERBA HEALTH CARE - Cesano','CERBA HEALTH CARE - Cipro (Roma)','CERBA HEALTH CARE - Fiano Romano','CERBA HEALTH CARE - Formello','CERBA HEALTH CARE - Graf (Roma)','CERBA HEALTH CARE - Guidonia','CERBA HEALTH CARE - Ladispoli','CERBA HEALTH CARE - Mentana','CERBA HEALTH CARE - Monterotondo','CERBA HEALTH CARE - Spinaceto (Roma)','CERBA HEALTH CARE - Tiburtina (Roma)','Privato'];

// col name -> {type, options}
const FIELD_META = {
  // ── DIPENDENTI ──
  'Azienda':                    {type:'select',  opts: AZIENDE_OPTS},
  'Sesso':                      {type:'radio',   opts:['Maschio','Femmina']},
  'Domicilio diverso Residenza':{type:'radio',   opts:['No','Sì']},
  'Tipo Documento':             {type:'select',  opts:['Carta Identità','Carta Identità Europea','Patente','Passaporto','PSP']},
  'Stato Socio':                {type:'select',  opts: STATO_SOCIO_OPTS},
  'Stato Dipendente':           {type:'select',  opts: STATO_DIP_OPTS},
  'Mansione':                   {type:'select',  opts: MANSIONI_OPTS},
  'Tipo permesso':              {type:'select',  opts:['Asilo','Attesa occupazione','Carta di soggiorno','Lavoro autonomo','Lavoro subordinato','Motivi Familiari','Motivi di studio','Protezione Internazionale','Protezione Speciale','Protezione Sussidiaria','Protezione Temporanea','Soggiornante Lungo Periodo']},
  // date fields dipendenti
  'Data di Nascita':            {type:'date'},
  'Data Rilascio Documento':    {type:'date'},
  'Scadenza Documento':         {type:'date'},
  'Data Delibera Ammissione':   {type:'date'},
  'Data Delibera Recesso / Esclusione':{type:'date'},
  'Data rilascio Permesso Soggiorno':  {type:'date'},
  'Data scadenza Permesso Soggiorno':  {type:'date'},
  // ── CONTRATTI ──
  'Tipologia contrattuale':     {type:'select',  opts:['Tempo determinato','Tempo indeterminato','Lavoro intermittente']},
  'Tipologia orario contrattuale':{type:'radio', opts:['Full Time','Part time']},
  'Ore contrattuali settimanali':{type:'select', opts:['15','18','20','21','24','25','30','34','36','38','40']},
  'Requisiti Incentivi':        {type:'radio',   opts:['SI','NO']},
  'Assistenza Sanitaria integrativa':{type:'radio', opts:['Sì','No']},
  'Causa fine rapporto':        {type:'select',  opts:['Dimissioni','Dimissioni concludenti','Dimissioni in prova','Licenziamento','Non superamento prova','Scadenza contratto']},
  'Livello':                    {type:'select',  opts:['1°','3','4','5','6','6.1','B1','B2','C1','C2','D1','D2','E1']},
  'Data inizio':                {type:'date'},
  'Data fine':                  {type:'date'},
  'Data assunzione':            {type:'date'},
  'Data licenziamento':         {type:'date'},
  // ── FORMAZIONE ──
  'Tipo formazione':            {type:'select',  opts:['Corso Base','Haccp','Preposto','Carrelli Elevatori / Muletti','Lavori in quota','Piattaforme aeree','Primo Soccorso','Antincendio','RLS']},
  'Tipologia Corso':            {type:'select',  opts:['Corso Base','Haccp','Preposto','Carrelli Elevatori / Muletti','Lavori in quota','Piattaforme aeree','Primo Soccorso','Antincendio','RLS']},
  'Stato Corso':                {type:'radio',   opts:['Completato','Da completare']},
  'Data':                       {type:'date'},
  'Scadenza':                   {type:'date'},
  'Data Corso':                 {type:'date'},
  'Scadenza Corso':             {type:'date'},
  // ── SORVEGLIANZA ──
  'Stato idoneità':             {type:'radio',   opts:['Idoneo','Idoneo con prescrizioni','In attesa visita','In attesa idoneità']},
  'Analisi':                    {type:'radio',   opts:['Sì','No']},
  'Laboratorio Analisi':        {type:'select',  opts: CERBA_OPTS},
  'Data visita':                {type:'date'},
  'Data visita medica':         {type:'date'},
  'Scadenza Idoneità':          {type:'date'},
  'Data Analisi':               {type:'date'},
};

// Table column display config
const TABLE_META = {
  dipendenti:   { label:'Dipendenti',             cols:['Cognome','Nome','Cod. Fiscale','Azienda','Mansione','Sesso','Stato Dipendente'], statusCol:null },
  contratti:    { label:'Contratti di Lavoro',    cols:['Cognome e Nome','Azienda','Data inizio','Data fine','Tipologia contrattuale','Mansione','Livello'], statusCol:null },
  formazione:   { label:'Formazione',             cols:['Cognome e Nome','Azienda','Tipologia Corso','Data Corso','Scadenza Corso','Stato Corso','Ore'], statusCol:'Stato Corso' },
  sorveglianza: { label:'Sorveglianza Sanitaria', cols:['Cognome e Nome','Azienda','Data visita medica','Scadenza Idoneità','Stato idoneità','Mansione'], statusCol:'Stato idoneità' },
  aziende:      { label:'Anagrafica Aziende',     cols:['Denominazione Ditta','Partita IVA','PEC','Email','Codice ATECO'], statusCol:null },
};

const SKIP_COLS = new Set(['_id','Riepilogo Dipendente','Riepilogo Dati contrattuali',
  'Riepilogo Formazione','Riepilogo Sorveglianza Sanitaria','Allegati documenti permesso',
  'Allegati formazione (Attestati)','Allegati aggiornamento formazione','Attestato Idoneità ',
  'UNILAV ASSUNZIONE','UNILAV PROROGHE','UNILAV TRASFORMAZIONI','UNILAV CESSAZIONE',
  'Anagrafica Dipendente','Dati Associativi','Sezione stranieri','Dettagli permesso di soggiorno']);

// Form sections per tabella
const FORM_SECTIONS = {
  dipendenti: [
    { title:'📋 Dati Anagrafici', cols:['Cognome','Nome','Data di Nascita','Luogo di Nascita','Sesso','Cittadinanza','Cod. Fiscale'] },
    { title:'🏠 Residenza e Domicilio', cols:['Indirizzo Residenza','Comune Residenza','CAP','Provincia Residenza','Domicilio diverso Residenza','Indirizzo Domicilio','Comune Domicilio','CAP domicilio','Provincia Domicilio'] },
    { title:'📞 Contatti', cols:['Telefono Cellulare','Altro Recapito','Email'] },
    { title:'🪪 Documento', cols:['Tipo Documento','N° Documento','Data Rilascio Documento','Scadenza Documento'] },
    { title:'🏢 Dati Lavorativi', cols:['Azienda','N° Socio','Stato Socio','Data Delibera Ammissione','Data Delibera Recesso / Esclusione','Stato Dipendente','Mansione','Appalto / sede di lavoro','Note'] },
    { title:'🌍 Permesso di Soggiorno', cols:['Tipo permesso','Rilasciato da Questura','Data rilascio Permesso Soggiorno','Data scadenza Permesso Soggiorno','Note permesso'] },
  ],
  contratti: [
    { title:'👤 Dipendente', cols:['Cognome e Nome','Azienda','Stato Dipendente','Mansione','Data assunzione'] },
    { title:'📄 Contratto', cols:['Tipologia contrattuale','Tipologia orario contrattuale','Livello','Ore contrattuali settimanali','CCNL','Data inizio','Data fine','Scadenza Contratto','Causa fine rapporto'] },
    { title:'📋 Proroghe', cols:['Data Proroga 1','Data Proroga 2','Data Proroga 3','Data Proroga 4'] },
    { title:'⚙ Altro', cols:['Requisiti Incentivi','Assistenza Sanitaria integrativa','Note'] },
  ],
  formazione: [
    { title:'👤 Dipendente', cols:['Cognome e Nome','Azienda','Stato Dipendente','Mansione','Data assunzione','Appalto / sede di lavoro'] },
    { title:'🎓 Corso', cols:['Tipologia Corso','Data Corso','Scadenza Corso','Stato Corso','Ore','Docente','Note'] },
  ],
  sorveglianza: [
    { title:'👤 Dipendente', cols:['Cognome e Nome','Azienda','Stato Dipendente','Mansione','Appalto / sede di lavoro','Data assunzione'] },
    { title:'🏥 Visita Medica', cols:['Data visita medica','Scadenza Idoneità','Stato idoneità','Note prescrizione','Medico'] },
    { title:'🧪 Analisi', cols:['Analisi','Data Analisi','Laboratorio Analisi','Note Analisi'] },
    { title:'📝 Note', cols:['Note'] },
  ],
  aziende: [
    { title:'🏢 Anagrafica', cols:['ID Ditta','Denominazione Ditta','Indirizzo','Partita IVA','Codice Univoco','PEC','Email','Codice ATECO','PAT','Posizione INPS','Codice Ditta INAIL','Cod. Fiscale Legale Rappresentante'] },
  ],
};

function getDisplayCols(table){
  const meta=TABLE_META[table];
  const all=Store.getCols(table);
  const primary=meta.cols.filter(c=>all.includes(c));
  return primary.length>0?primary:all.filter(c=>!SKIP_COLS.has(c)).slice(0,7);
}

function statusPill(val){
  if(!val)return '';
  const v=val.toLowerCase();
  if(v==='completato'||v==='attivo'||(v.includes('idon')&&!v.includes('non')&&!v.includes('attesa'))) return '<span class="pill pill-green">'+esc(val)+'</span>';
  if(v==='da completare'||v==='non in forza'||v==='non attivo') return '<span class="pill pill-gray">'+esc(val)+'</span>';
  if(v.includes('non idon')||v.includes('inidon')) return '<span class="pill pill-red">'+esc(val)+'</span>';
  if(v.includes('parzial')||v.includes('prescriz')||v.includes('con prescrizioni')) return '<span class="pill pill-yellow">'+esc(val)+'</span>';
  if(v.includes('attesa')) return '<span class="pill pill-blue">'+esc(val)+'</span>';
  return '<span class="pill pill-gray">'+esc(val)+'</span>';
}

// ─── BUILD FORM FIELD ──────────────────────────────────────────────────────────
function buildField(col, val){
  val = val ?? '';
  const meta = FIELD_META[col];
  const fid = 'f_'+col.replace(/[^a-zA-Z0-9]/g,'_');

  if(!meta || meta.type==='text'){
    return `<input type="text" id="${fid}" value="${esc(val)}" placeholder="${esc(col)}"/>`;
  }
  if(meta.type==='date'){
    // normalize value to YYYY-MM-DD if it's in DD-MM-YYYY
    let dval = val;
    if(/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(val)){
      const p=val.split(/[\/\-]/); dval=p[2]+'-'+p[1]+'-'+p[0];
    }
    return `<input type="date" id="${fid}" value="${esc(dval)}"/>`;
  }
  if(meta.type==='select'){
    const optsHtml = meta.opts.map(o=>`<option value="${esc(o)}"${o===val?'selected':''}>${esc(o)}</option>`).join('');
    return `<select id="${fid}"><option value="">-- seleziona --</option>${optsHtml}</select>`;
  }
  if(meta.type==='radio'){
    const radios = meta.opts.map(o=>`<label><input type="radio" name="${fid}" value="${esc(o)}"${o===val?' checked':''}> ${esc(o)}</label>`).join('');
    return `<div class="radio-group">${radios}</div>`;
  }
  if(meta.type==='checkbox'){
    const vals = val ? val.split(',').map(v=>v.trim()) : [];
    const checks = meta.opts.map(o=>`<label><input type="checkbox" name="${fid}" value="${esc(o)}"${vals.includes(o)?' checked':''}> ${esc(o)}</label>`).join('');
    return `<div class="check-group">${checks}</div>`;
  }
  return `<input type="text" id="${fid}" value="${esc(val)}"/>`;
}

function readField(col){
  const meta = FIELD_META[col];
  const fid = 'f_'+col.replace(/[^a-zA-Z0-9]/g,'_');
  if(meta?.type==='radio'){
    const checked=document.querySelector(`input[name="${fid}"]:checked`);
    return checked?checked.value:'';
  }
  if(meta?.type==='checkbox'){
    const checked=[...document.querySelectorAll(`input[name="${fid}"]:checked`)].map(i=>i.value);
    return checked.join(', ');
  }
  if(meta?.type==='date'){
    const el=document.getElementById(fid);
    if(!el)return '';
    const v=el.value;
    // convert back to DD-MM-YYYY for storage consistency
    if(/^\d{4}-\d{2}-\d{2}$/.test(v)){
      const p=v.split('-'); return p[2]+'-'+p[1]+'-'+p[0];
    }
    return v;
  }
  const el=document.getElementById(fid);
  return el?el.value:'';
}

// ─── APP ──────────────────────────────────────────────────────────────────────
const App = {
  currentView:'dashboard', currentTable:null,
  page:1, pageSize:25, sortCol:null, sortDir:1, filterText:'', filteredRows:[],

  login(){
    const u=document.getElementById('login-user').value.trim();
    const p=document.getElementById('login-pass').value;
    const user=Auth.login(u,p);
    const err=document.getElementById('login-error');
    if(user){ err.style.display='none'; document.getElementById('login-screen').style.display='none'; this.initApp(user); }
    else{ err.textContent='Credenziali non valide.'; err.style.display='block'; }
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
      const b=document.getElementById('badge-'+t);
      if(b)b.textContent=Store.getRows(t).length;
    });
    if(Auth.isAdmin()){ document.getElementById('admin-section').style.display=''; document.getElementById('nav-utenti').style.display=''; }
    this.show('dashboard');
  },

  show(view){
    this.currentView=view; this.page=1; this.filterText=''; this.sortCol=null;
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
    document.querySelector('[data-view="'+view+'"]')?.classList.add('active');
    document.getElementById('topbar-title').textContent=TABLE_META[view]?.label||(view==='dashboard'?'Dashboard':'Gestione Utenti');
    const sw=document.getElementById('search-wrap'), ba=document.getElementById('btn-add');
    document.getElementById('search-input').value='';
    if(view==='dashboard'){ sw.style.display='none'; ba.style.display='none'; this.renderDashboard(); }
    else if(view==='utenti'){ sw.style.display='none'; ba.style.display=Auth.isAdmin()?'':'none'; ba.onclick=()=>this.openAddUser(); this.renderUsers(); }
    else{ this.currentTable=view; sw.style.display=''; ba.style.display=Auth.canEdit()?'':'none'; ba.onclick=()=>this.openAdd(); this.renderTable(view); }
  },

  search(val){ this.filterText=val.toLowerCase(); this.page=1; this.renderTable(this.currentTable); },

  // ── DASHBOARD ────────────────────────────────────────────────────────────────
  renderDashboard(){
    const dip=Store.getRows('dipendenti'), con=Store.getRows('contratti');
    const for_=Store.getRows('formazione'), sor=Store.getRows('sorveglianza'), az=Store.getRows('aziende');
    const azC={};con.forEach(r=>{const a=r['Azienda']||'N/D';azC[a]=(azC[a]||0)+1;});
    const topAz=Object.entries(azC).sort((a,b)=>b[1]-a[1]).slice(0,8), maxAz=topAz[0]?.[1]||1;
    const forT={};for_.forEach(r=>{const t=r['Tipologia Corso']||r['Tipo formazione']||'N/D';forT[t]=(forT[t]||0)+1;});
    const topFor=Object.entries(forT).sort((a,b)=>b[1]-a[1]).slice(0,8), maxFor=topFor[0]?.[1]||1;
    const giu={};sor.forEach(r=>{const g=r['Stato idoneità']||'N/D';giu[g]=(giu[g]||0)+1;});
    const oggi=new Date(), lim=new Date(); lim.setDate(oggi.getDate()+90);
    let sc=0;sor.forEach(r=>{const s=r['Scadenza Idoneità'];if(!s)return;const p=s.split(/[\/\-]/);if(p.length===3){const d=p[0].length===4?new Date(p[0]+'-'+p[1]+'-'+p[2]):new Date(p[2]+'-'+p[1]+'-'+p[0]);if(!isNaN(d)&&d>=oggi&&d<=lim)sc++;}});

    const sc_card=(cl,label,val,sub)=>`<div class="stat-card ${cl}"><div class="stat-label">${label}</div><div class="stat-value">${val}</div><div class="stat-sub">${sub}</div></div>`;
    const bar=(l,n,max,col)=>`<div class="bar-item"><span class="bar-label" title="${esc(l)}">${esc(l)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/max*100)}%;background:${col}"></div></div><span class="bar-count">${n}</span></div>`;
    const panel=(t,b)=>`<div class="panel"><div class="panel-header">${t}</div><div class="panel-body">${b}</div></div>`;

    document.getElementById('content').innerHTML=
      '<div class="stats-grid">'+sc_card('blue','Dipendenti',dip.length,'anagrafica')+sc_card('cyan','Contratti',con.length,'rapporti di lavoro')+sc_card('green','Formazione',for_.length,'corsi')+sc_card('warn','Scadenze Sorveg.',sc,'entro 90 giorni')+sc_card('red','Sorveglianza',sor.length,'visite')+sc_card('blue','Aziende',az.length,'in anagrafica')+'</div>'+
      '<div class="dash-grid">'+
      panel('📄 Contratti per Azienda',topAz.map(([a,n])=>bar(a,n,maxAz,'var(--accent)')).join(''))+
      panel('🎓 Formazione per Tipo',topFor.map(([t,n])=>bar(t,n,maxFor,'var(--accent2)')).join(''))+
      panel('🏥 Giudizi Sorveglianza',Object.entries(giu).sort((a,b)=>b[1]-a[1]).map(([g,n])=>`<div class="bar-item"><span class="bar-label">${statusPill(g)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/sor.length*100)}%;background:var(--success)"></div></div><span class="bar-count">${n}</span></div>`).join(''))+
      panel('📊 Riepilogo','<table style="width:100%;font-size:14px">'+[['Dipendenti totali',dip.length,''],['Contratti',con.length,''],['Corsi formazione',for_.length,''],['Visite mediche',sor.length,''],['⚠ Scadenze prossime (90gg)',sc,'color:var(--warn)']].map(([l,v,s],i,a)=>`<tr><td style="color:var(--text3);padding:8px 0;${i<a.length-1?'border-bottom:1px solid var(--border)':''}">${l}</td><td style="text-align:right;font-family:var(--font-mono);font-weight:700;padding:8px 0;${s};${i<a.length-1?'border-bottom:1px solid var(--border)':''}">${v}</td></tr>`).join('')+'</table>')+
      '</div>';
  },

  // ── TABLE VIEW ────────────────────────────────────────────────────────────────
  renderTable(table){
    const allRows=Store.getRows(table), cols=getDisplayCols(table), meta=TABLE_META[table], canEdit=Auth.canEdit();
    let rows=allRows;
    if(this.filterText){ const q=this.filterText; rows=allRows.filter(r=>Object.values(r).some(v=>String(v).toLowerCase().includes(q))); }
    if(this.sortCol){ const sc=this.sortCol,sd=this.sortDir; rows=[...rows].sort((a,b)=>{const va=String(a[sc]||'').toLowerCase(),vb=String(b[sc]||'').toLowerCase();return va<vb?-sd:va>vb?sd:0;}); }
    this.filteredRows=rows;
    const total=rows.length, tp=Math.max(1,Math.ceil(total/this.pageSize));
    if(this.page>tp)this.page=tp;
    const start=(this.page-1)*this.pageSize, pageRows=rows.slice(start,start+this.pageSize);

    const ths=cols.map(c=>`<th class="${this.sortCol===c?'sorted':''}" onclick="App.sortBy('${esc(c)}')">${esc(c)} <span class="sort-icon">${this.sortCol===c?(this.sortDir===1?'↑':'↓'):'↕'}</span></th>`).join('')+(canEdit?'<th style="width:90px">Azioni</th>':'');
    const trs=pageRows.map(row=>{
      const oi=allRows.indexOf(row);
      const tds=cols.map(c=>{const v=row[c]??'';if(meta.statusCol===c)return'<td>'+statusPill(v)+'</td>';return`<td title="${esc(v)}">${esc(v)}</td>`;}).join('');
      const act=canEdit?`<td><div class="td-actions"><button class="icon-btn" onclick="App.openEdit('${table}',${oi})" title="Modifica">✎</button><button class="icon-btn danger" onclick="App.confirmDelete('${table}',${oi})" title="Elimina">✕</button></div></td>`:'';
      return'<tr>'+tds+act+'</tr>';
    }).join('')||'<tr><td colspan="99" style="text-align:center;color:var(--text3);padding:36px;font-size:15px">Nessun risultato trovato</td></tr>';

    let pages='';
    const maxB=7,sP=Math.max(1,Math.min(this.page-3,tp-maxB+1)),eP=Math.min(tp,sP+maxB-1);
    for(let i=sP;i<=eP;i++)pages+=`<button class="page-btn ${i===this.page?'active':''}" onclick="App.goPage(${i})">${i}</button>`;

    document.getElementById('content').innerHTML=`
      <div class="table-wrap">
        <div class="table-toolbar">
          <span style="font-size:14px;color:var(--text2);font-weight:600">${TABLE_META[table].label}</span>
          <span class="record-count">${this.filterText?total+' filtrati / ':''} ${allRows.length} totali</span>
          <button class="btn btn-ghost" style="font-size:13px" onclick="App.exportCSV('${table}')">↓ CSV</button>
        </div>
        <div class="table-scroll"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>
        <div class="pagination">
          <span class="page-info">${start+1}–${Math.min(start+this.pageSize,total)} di ${total}</span>
          <button class="page-btn" onclick="App.goPage(1)" ${this.page===1?'disabled':''}>«</button>
          <button class="page-btn" onclick="App.goPage(${this.page-1})" ${this.page===1?'disabled':''}>‹</button>
          ${pages}
          <button class="page-btn" onclick="App.goPage(${this.page+1})" ${this.page===tp?'disabled':''}>›</button>
          <button class="page-btn" onclick="App.goPage(${tp})" ${this.page===tp?'disabled':''}>»</button>
        </div>
      </div>`;
  },

  sortBy(col){ if(this.sortCol===col)this.sortDir*=-1;else{this.sortCol=col;this.sortDir=1;} this.renderTable(this.currentTable); },
  goPage(p){ const tp=Math.max(1,Math.ceil(this.filteredRows.length/this.pageSize)); this.page=Math.max(1,Math.min(p,tp)); this.renderTable(this.currentTable); },

  // ── FORM ──────────────────────────────────────────────────────────────────────
  openAdd(){ this._openForm(this.currentTable,null,null); },
  openEdit(t,idx){ this._openForm(t,Store.getRows(t)[idx],idx); },

  _openForm(table,row,idx){
    document.getElementById('modal-title').textContent=(idx!==null?'Modifica':'Nuovo')+' — '+TABLE_META[table].label;
    const allCols=Store.getCols(table);
    const sections=FORM_SECTIONS[table]||[{title:'Campi',cols:allCols.filter(c=>!SKIP_COLS.has(c))}];

    let html='';
    for(const sec of sections){
      const visibleCols=sec.cols.filter(c=>allCols.includes(c)||FIELD_META[c]);
      if(!visibleCols.length)continue;
      html+=`<div class="form-section"><div class="form-section-title">${sec.title}</div><div class="form-grid">`;
      for(const col of visibleCols){
        const meta=FIELD_META[col];
        const isWide=meta?.type==='radio'||meta?.type==='checkbox'||col.toLowerCase().includes('note')||col.toLowerCase().includes('indirizzo');
        html+=`<div class="form-group ${isWide?'full':''}"><label class="field-label">${esc(col)}</label>${buildField(col,row?row[col]:'')}</div>`;
      }
      html+='</div></div>';
    }

    // also add any extra cols not in sections
    const sectionCols=new Set(sections.flatMap(s=>s.cols));
    const extraCols=allCols.filter(c=>!sectionCols.has(c)&&!SKIP_COLS.has(c));
    if(extraCols.length){
      html+='<div class="form-section"><div class="form-section-title">📁 Altri Campi</div><div class="form-grid">';
      for(const col of extraCols){
        html+=`<div class="form-group"><label class="field-label">${esc(col)}</label>${buildField(col,row?row[col]:'')}</div>`;
      }
      html+='</div></div>';
    }

    document.getElementById('modal-body').innerHTML=html;
    const allFormCols=[...sections.flatMap(s=>s.cols),...extraCols].filter(c=>allCols.includes(c)||FIELD_META[c]);
    const colsJson=JSON.stringify(allFormCols);
    document.getElementById('modal-footer').innerHTML=`
      <button class="btn btn-ghost" onclick="App.closeModal()">Annulla</button>
      <button class="btn btn-primary" onclick="App.saveForm('${table}',${colsJson},${idx!==null?idx:'null'})">
        ${idx!==null?'✓ Salva modifiche':'+ Aggiungi'}
      </button>`;
    this.openModal();
  },

  saveForm(table,cols,idx){
    const row={};
    cols.forEach(c=>{ row[c]=readField(c); });
    if(idx!==null){Store.updateRow(table,idx,row);toast('Record aggiornato');}
    else{Store.addRow(table,row);toast('Record aggiunto');}
    this.closeModal();
    const b=document.getElementById('badge-'+table); if(b)b.textContent=Store.getRows(table).length;
    this.renderTable(table);
  },

  confirmDelete(table,idx){
    const row=Store.getRows(table)[idx];
    const name=Object.values(row).find(v=>v&&v!=='')||'questo record';
    document.getElementById('confirm-title').textContent='Elimina record';
    document.getElementById('confirm-msg').textContent=`Sei sicuro di voler eliminare "${String(name).slice(0,60)}"? L'operazione non può essere annullata.`;
    document.getElementById('confirm-ok').onclick=()=>{
      Store.deleteRow(table,idx);toast('Record eliminato','error');
      const b=document.getElementById('badge-'+table);if(b)b.textContent=Store.getRows(table).length;
      this.closeConfirm();this.renderTable(table);
    };
    document.getElementById('confirm-overlay').classList.add('open');
  },

  // ── USERS ──────────────────────────────────────────────────────────────────
  renderUsers(){
    const users=Auth.getUsers();
    document.getElementById('content').innerHTML=`
      <div class="table-wrap">
        <div class="table-scroll"><table>
          <thead><tr><th>Username</th><th>Nome</th><th>Ruolo</th><th>Azioni</th></tr></thead>
          <tbody>${users.map((u,i)=>`<tr>
            <td>${esc(u.username)}</td><td>${esc(u.nome)}</td>
            <td><span class="pill ${u.role==='admin'?'pill-red':u.role==='editor'?'pill-blue':'pill-gray'}">${esc(u.role)}</span></td>
            <td><div class="td-actions"><button class="icon-btn" onclick="App.openEditUser(${i})">✎</button><button class="icon-btn danger" onclick="App.confirmDeleteUser(${i})">✕</button></div></td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>`;
  },

  openAddUser(){ this._openUserForm(null,null); },
  openEditUser(idx){ this._openUserForm(Auth.getUsers()[idx],idx); },
  _openUserForm(u,idx){
    document.getElementById('modal-title').textContent=u?'Modifica Utente':'Nuovo Utente';
    document.getElementById('modal-body').innerHTML=`
      <div class="form-grid" style="padding:0">
        <div class="form-group"><label class="field-label">Username</label><input type="text" id="u_username" value="${esc(u?.username||'')}"/></div>
        <div class="form-group"><label class="field-label">Nome</label><input type="text" id="u_nome" value="${esc(u?.nome||'')}"/></div>
        <div class="form-group"><label class="field-label">Password</label><input type="password" id="u_password" placeholder="${u?'Lascia vuoto per non cambiare':'Nuova password'}"/></div>
        <div class="form-group"><label class="field-label">Ruolo</label>
          <select id="u_role"><option value="viewer" ${u?.role==='viewer'?'selected':''}>viewer – solo lettura</option><option value="editor" ${u?.role==='editor'?'selected':''}>editor – modifica dati</option><option value="admin" ${u?.role==='admin'?'selected':''}>admin – accesso completo</option></select>
        </div>
      </div>`;
    document.getElementById('modal-footer').innerHTML=`<button class="btn btn-ghost" onclick="App.closeModal()">Annulla</button><button class="btn btn-primary" onclick="App.saveUser(${idx!==null?idx:'null'})">Salva</button>`;
    this.openModal();
  },
  saveUser(idx){
    const username=document.getElementById('u_username').value.trim();
    const nome=document.getElementById('u_nome').value.trim();
    const password=document.getElementById('u_password').value;
    const role=document.getElementById('u_role').value;
    if(!username||!nome){toast('Compila tutti i campi','error');return;}
    const users=Auth.getUsers();
    if(idx===null){if(!password){toast('Inserisci una password','error');return;}users.push({username,nome,password,role});}
    else{users[idx]={username,nome,role,password:password||users[idx].password};}
    Auth.saveUsers(users);toast('Utente salvato');this.closeModal();this.renderUsers();
  },
  confirmDeleteUser(idx){
    const u=Auth.getUsers()[idx];
    document.getElementById('confirm-title').textContent='Elimina Utente';
    document.getElementById('confirm-msg').textContent=`Eliminare l'utente "${u.username}"?`;
    document.getElementById('confirm-ok').onclick=()=>{const users=Auth.getUsers();users.splice(idx,1);Auth.saveUsers(users);toast('Utente eliminato','error');this.closeConfirm();this.renderUsers();};
    document.getElementById('confirm-overlay').classList.add('open');
  },

  // ── CSV ────────────────────────────────────────────────────────────────────
  exportCSV(table){
    const rows=this.filteredRows.length?this.filteredRows:Store.getRows(table);
    const cols=Store.getCols(table).filter(c=>c&&c!=='_id');
    const lines=[cols.map(c=>'"'+c+'"').join(',')];
    rows.forEach(r=>lines.push(cols.map(c=>'"'+(String(r[c]||'').replace(/"/g,'""'))+'"').join(',')));
    const blob=new Blob(['\uFEFF'+lines.join('\n')],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=table+'_'+new Date().toISOString().slice(0,10)+'.csv';a.click();
    toast('Export CSV completato');
  },

  // ── MODAL ──────────────────────────────────────────────────────────────────
  openModal(){ document.getElementById('modal-overlay').classList.add('open'); },
  closeModal(e){ if(e&&e.target!==document.getElementById('modal-overlay'))return; document.getElementById('modal-overlay').classList.remove('open'); },
  closeConfirm(e){ if(e&&e.target!==document.getElementById('confirm-overlay'))return; document.getElementById('confirm-overlay').classList.remove('open'); },
  handleKey(e){
    if(e.key==='Escape'){this.closeModal();this.closeConfirm();}
    if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){const btn=document.getElementById('modal-footer')?.querySelector('.btn-primary');if(btn)btn.click();}
  }
};

// ─── BOOT ─────────────────────────────────────────────────────────────────────
window.addEventListener('keydown',e=>App.handleKey(e));
['login-user','login-pass'].forEach(id=>document.getElementById(id)?.addEventListener('keydown',e=>{if(e.key==='Enter')App.login();}));
try{ Store.load(); }catch(e){ console.error('Errore dati:',e); }
document.getElementById('loading').classList.add('hidden');
const _u=Auth.current();
if(_u){ document.getElementById('login-screen').style.display='none'; App.initApp(_u); }
else{ document.getElementById('login-screen').style.display='flex'; }
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
