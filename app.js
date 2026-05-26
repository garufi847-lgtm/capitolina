'use strict';

// ─── AUTH ────────────────────────────────────────────────────────────────────
const DEFAULT_USERS = [
  { username: 'admin',   password: 'admin123',    role: 'admin',  nome: 'Amministratore' },
  { username: 'hr',      password: 'hr2024',      role: 'editor', nome: 'Ufficio HR' },
  { username: 'viewer',  password: 'viewer2024',  role: 'viewer', nome: 'Visualizzatore' },
];

const Auth = {
  getUsers() {
    const s = localStorage.getItem('gestionale_users');
    return s ? JSON.parse(s) : DEFAULT_USERS;
  },
  saveUsers(u) { localStorage.setItem('gestionale_users', JSON.stringify(u)); },
  login(username, password) {
    const u = this.getUsers().find(u => u.username === username && u.password === password);
    if (u) { sessionStorage.setItem('gestionale_session', JSON.stringify(u)); return u; }
    return null;
  },
  logout() { sessionStorage.removeItem('gestionale_session'); },
  current() { const s = sessionStorage.getItem('gestionale_session'); return s ? JSON.parse(s) : null; },
  canEdit() { const u = this.current(); return u && (u.role === 'admin' || u.role === 'editor'); },
  isAdmin() { const u = this.current(); return u && u.role === 'admin'; }
};

// ─── DATA STORE ──────────────────────────────────────────────────────────────
const Store = {
  data: {},
  load() {
    const tables = ['dipendenti','contratti','formazione','sorveglianza','aziende'];
    for (const t of tables) {
      const local = localStorage.getItem('gestionale_data_' + t);
      if (local) {
        try { this.data[t] = JSON.parse(local); } catch(e) { this.data[t] = EMBEDDED_DATA[t]; }
      } else {
        // Deep copy from embedded data
        this.data[t] = JSON.parse(JSON.stringify(EMBEDDED_DATA[t]));
        this.save(t);
      }
    }
  },
  save(t) { localStorage.setItem('gestionale_data_' + t, JSON.stringify(this.data[t])); },
  getRows(t) { return this.data[t]?.rows || []; },
  getCols(t)  { return this.data[t]?.columns || []; },
  addRow(t, row) {
    row._id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    this.data[t].rows.push(row);
    this.save(t);
  },
  updateRow(t, idx, row) {
    const id = this.data[t].rows[idx]?._id;
    this.data[t].rows[idx] = { ...row, _id: id };
    this.save(t);
  },
  deleteRow(t, idx) {
    this.data[t].rows.splice(idx, 1);
    this.save(t);
  },
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = 'toast-msg ' + type;
  el.innerHTML = '<span>' + (type==='success'?'✓':'✕') + '</span> ' + msg;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ─── TABLE CONFIG ─────────────────────────────────────────────────────────────
const TABLE_META = {
  dipendenti:   { label: 'Dipendenti',             primaryCols: ['Cognome','Nome','Cod. Fiscale','Data di Nascita','Luogo di Nascita','Nazionalità','Sesso'], statusCol: null },
  contratti:    { label: 'Contratti di Lavoro',    primaryCols: ['Cognome e Nome','Azienda','Data inizio','Data fine','Tipo contratto','Mansione','CCNL'],  statusCol: null },
  formazione:   { label: 'Formazione',             primaryCols: ['Cognome e Nome','Azienda','Tipo formazione','Data','Scadenza','Ore','Docente'],            statusCol: null },
  sorveglianza: { label: 'Sorveglianza Sanitaria', primaryCols: ['Cognome e Nome','Azienda','Data visita','Scadenza','Giudizio','Medico'],                  statusCol: 'Giudizio' },
  aziende:      { label: 'Anagrafica Aziende',     primaryCols: ['Ragione Sociale','P.IVA','Sede Legale','Telefono','Email'],                               statusCol: null },
};

const SKIP_COLS = new Set(['_id','Riepilogo Dipendente','Riepilogo Dati contrattuali',
  'Riepilogo Formazione','Riepilogo Sorveglianza Sanitaria','Allegati documenti permesso',
  'Allegati formazione (Attestati)','Allegati aggiornamento formazione','Attestato Idoneità ',
  'UNILAV ASSUNZIONE','UNILAV PROROGHE','UNILAV TRASFORMAZIONI','UNILAV CESSAZIONE',
  'Anagrafica Dipendente','Dati Associativi','Sezione stranieri','Dettagli permesso di soggiorno']);

function getDisplayCols(table) {
  const meta = TABLE_META[table];
  const all = Store.getCols(table);
  const primary = meta.primaryCols.filter(c => all.includes(c));
  return primary.length > 0 ? primary : all.filter(c => !SKIP_COLS.has(c)).slice(0, 7);
}

function statusPill(val) {
  if (!val) return '';
  const v = val.toLowerCase();
  if (v.includes('idon') && !v.includes('non')) return '<span class="pill pill-green">' + esc(val) + '</span>';
  if (v.includes('non idon') || v.includes('inidon'))  return '<span class="pill pill-red">'  + esc(val) + '</span>';
  if (v.includes('parzial') || v.includes('prescriz')) return '<span class="pill pill-yellow">'+ esc(val) + '</span>';
  return '<span class="pill pill-gray">' + esc(val) + '</span>';
}

// ─── APP ──────────────────────────────────────────────────────────────────────
const App = {
  currentView: 'dashboard',
  currentTable: null,
  page: 1, pageSize: 25,
  sortCol: null, sortDir: 1,
  filterText: '',
  filteredRows: [],

  login() {
    const u = document.getElementById('login-user').value.trim();
    const p = document.getElementById('login-pass').value;
    const user = Auth.login(u, p);
    const err = document.getElementById('login-error');
    if (user) {
      err.style.display = 'none';
      document.getElementById('login-screen').style.display = 'none';
      this.initApp(user);
    } else {
      err.textContent = 'Credenziali non valide.';
      err.style.display = 'block';
    }
  },

  logout() {
    Auth.logout();
    document.getElementById('app').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('login-user').value = '';
    document.getElementById('login-pass').value = '';
  },

  initApp(user) {
    document.getElementById('app').style.display = 'flex';
    document.getElementById('user-label').textContent = user.nome + ' · ' + user.role;
    ['dipendenti','contratti','formazione','sorveglianza','aziende'].forEach(t => {
      const b = document.getElementById('badge-' + t);
      if (b) b.textContent = Store.getRows(t).length;
    });
    if (Auth.isAdmin()) {
      document.getElementById('admin-section').style.display = '';
      document.getElementById('nav-utenti').style.display = '';
    }
    this.show('dashboard');
  },

  show(view) {
    this.currentView = view;
    this.page = 1;
    this.filterText = '';
    this.sortCol = null;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const nb = document.querySelector('[data-view="' + view + '"]');
    if (nb) nb.classList.add('active');
    document.getElementById('topbar-title').textContent =
      TABLE_META[view]?.label || (view === 'dashboard' ? 'Dashboard' : 'Gestione Utenti');
    const sw = document.getElementById('search-wrap');
    const ba = document.getElementById('btn-add');
    document.getElementById('search-input').value = '';

    if (view === 'dashboard') {
      sw.style.display = 'none'; ba.style.display = 'none';
      this.renderDashboard();
    } else if (view === 'utenti') {
      sw.style.display = 'none';
      ba.style.display = Auth.isAdmin() ? '' : 'none';
      ba.onclick = () => this.openAddUser();
      this.renderUsers();
    } else {
      this.currentTable = view;
      sw.style.display = '';
      ba.style.display = Auth.canEdit() ? '' : 'none';
      ba.onclick = () => this.openAdd();
      this.renderTable(view);
    }
  },

  search(val) {
    this.filterText = val.toLowerCase();
    this.page = 1;
    this.renderTable(this.currentTable);
  },

  // ─── DASHBOARD ─────────────────────────────────────────────────────────────
  renderDashboard() {
    const dip = Store.getRows('dipendenti');
    const con = Store.getRows('contratti');
    const for_ = Store.getRows('formazione');
    const sor = Store.getRows('sorveglianza');
    const az  = Store.getRows('aziende');

    const azCount = {};
    con.forEach(r => { const a = r['Azienda']||'N/D'; azCount[a]=(azCount[a]||0)+1; });
    const topAz = Object.entries(azCount).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const maxAz = topAz[0]?.[1]||1;

    const forTipo = {};
    for_.forEach(r => { const t = r['Tipo formazione']||'N/D'; forTipo[t]=(forTipo[t]||0)+1; });
    const topFor = Object.entries(forTipo).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const maxFor = topFor[0]?.[1]||1;

    const giudizi = {};
    sor.forEach(r => { const g = r['Giudizio']||'N/D'; giudizi[g]=(giudizi[g]||0)+1; });

    const oggi = new Date();
    const limite = new Date(); limite.setDate(oggi.getDate()+90);
    let scadenze = 0;
    sor.forEach(r => {
      const s = r['Scadenza']; if (!s) return;
      const pts = s.split(/[\/\-]/);
      if (pts.length===3) {
        const d = pts[0].length===4 ? new Date(pts[0]+'-'+pts[1]+'-'+pts[2])
                                    : new Date(pts[2]+'-'+pts[1]+'-'+pts[0]);
        if (!isNaN(d) && d>=oggi && d<=limite) scadenze++;
      }
    });

    document.getElementById('content').innerHTML =
      '<div class="stats-grid">' +
      statCard('blue','Dipendenti',dip.length,'anagrafica totale') +
      statCard('cyan','Contratti',con.length,'rapporti di lavoro') +
      statCard('green','Formazione',for_.length,'corsi registrati') +
      statCard('warn','Scadenze Sorveg.',scadenze,'entro 90 giorni') +
      statCard('red','Sorveglianza',sor.length,'visite registrate') +
      statCard('blue','Aziende',az.length,'in anagrafica') +
      '</div>' +
      '<div class="dash-grid">' +
      panel('📄 Contratti per Azienda', topAz.map(([a,n])=>barItem(a,n,maxAz,'var(--accent)')).join('')) +
      panel('🎓 Formazione per Tipo',   topFor.map(([t,n])=>barItem(t,n,maxFor,'var(--accent2)')).join('')) +
      panel('🏥 Giudizi Sorveglianza',  Object.entries(giudizi).sort((a,b)=>b[1]-a[1]).map(([g,n])=>`
        <div class="bar-item">
          <span class="bar-label">${statusPill(g)}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/sor.length*100)}%;background:var(--success)"></div></div>
          <span class="bar-count">${n}</span>
        </div>`).join('')) +
      panel('📊 Riepilogo', `<table style="width:100%;font-size:12px">` +
        [['Dipendenti totali',dip.length,''],['Contratti',con.length,''],
         ['Corsi formazione',for_.length,''],['Visite mediche',sor.length,''],
         ['⚠ Scadenze prossime (90gg)',scadenze,'color:var(--warn)']
        ].map(([l,v,s],i,a) => `<tr><td style="color:var(--text3);padding:6px 0;${i<a.length-1?'border-bottom:1px solid var(--border)':''}">${l}</td>
          <td style="text-align:right;font-family:var(--font-mono);font-weight:700;padding:6px 0;${s};${i<a.length-1?'border-bottom:1px solid var(--border)':''}">${v}</td></tr>`).join('') +
        '</table>') +
      '</div>';

    function statCard(color, label, value, sub) {
      return `<div class="stat-card ${color}"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div></div>`;
    }
    function barItem(label, n, max, color) {
      return `<div class="bar-item"><span class="bar-label" title="${esc(label)}">${esc(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/max*100)}%;background:${color}"></div></div><span class="bar-count">${n}</span></div>`;
    }
    function panel(title, body) {
      return `<div class="panel"><div class="panel-header">${title}</div><div class="panel-body">${body}</div></div>`;
    }
  },

  // ─── TABLE ─────────────────────────────────────────────────────────────────
  renderTable(table) {
    const allRows = Store.getRows(table);
    const cols = getDisplayCols(table);
    const meta = TABLE_META[table];
    const canEdit = Auth.canEdit();

    let rows = allRows;
    if (this.filterText) {
      const q = this.filterText;
      rows = allRows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)));
    }
    if (this.sortCol) {
      const sc = this.sortCol, sd = this.sortDir;
      rows = [...rows].sort((a,b) => {
        const va = String(a[sc]||'').toLowerCase(), vb = String(b[sc]||'').toLowerCase();
        return va < vb ? -sd : va > vb ? sd : 0;
      });
    }
    this.filteredRows = rows;

    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / this.pageSize));
    if (this.page > totalPages) this.page = totalPages;
    const start = (this.page-1)*this.pageSize;
    const pageRows = rows.slice(start, start+this.pageSize);

    const ths = cols.map(c => {
      const sorted = this.sortCol===c;
      return `<th class="${sorted?'sorted':''}" onclick="App.sortBy('${esc(c)}')">${esc(c)} <span class="sort-icon">${sorted?(this.sortDir===1?'↑':'↓'):'↕'}</span></th>`;
    }).join('') + (canEdit ? '<th style="width:80px">Azioni</th>' : '');

    const trs = pageRows.map((row) => {
      const origIdx = allRows.indexOf(row);
      const tds = cols.map(c => {
        const val = row[c] ?? '';
        if (meta.statusCol===c) return '<td>' + statusPill(val) + '</td>';
        return `<td title="${esc(val)}">${esc(val)}</td>`;
      }).join('');
      const actions = canEdit
        ? `<td><div class="td-actions"><button class="icon-btn" onclick="App.openEdit('${table}',${origIdx})">✎</button><button class="icon-btn danger" onclick="App.confirmDelete('${table}',${origIdx})">✕</button></div></td>`
        : '';
      return '<tr>' + tds + actions + '</tr>';
    }).join('') || '<tr><td colspan="99" style="text-align:center;color:var(--text2);padding:32px">Nessun risultato</td></tr>';

    let pages = '';
    const maxB=7, startP=Math.max(1,Math.min(this.page-3, totalPages-maxB+1)), endP=Math.min(totalPages,startP+maxB-1);
    for (let i=startP; i<=endP; i++) pages += `<button class="page-btn ${i===this.page?'active':''}" onclick="App.goPage(${i})">${i}</button>`;

    document.getElementById('content').innerHTML = `
      <div class="table-wrap">
        <div class="table-toolbar">
          <span class="record-count">${this.filterText?total+' risultati su ':''} ${allRows.length} record · pag. ${this.page}/${totalPages}</span>
          <button class="btn btn-ghost" style="font-size:11px;margin-left:auto" onclick="App.exportCSV('${table}')">↓ CSV</button>
        </div>
        <div class="table-scroll">
          <table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
        </div>
        <div class="pagination">
          <span class="page-info">Mostrati ${start+1}–${Math.min(start+this.pageSize,total)} di ${total}</span>
          <button class="page-btn" onclick="App.goPage(1)" ${this.page===1?'disabled':''}>«</button>
          <button class="page-btn" onclick="App.goPage(${this.page-1})" ${this.page===1?'disabled':''}>‹</button>
          ${pages}
          <button class="page-btn" onclick="App.goPage(${this.page+1})" ${this.page===totalPages?'disabled':''}>›</button>
          <button class="page-btn" onclick="App.goPage(${totalPages})" ${this.page===totalPages?'disabled':''}>»</button>
        </div>
      </div>`;
  },

  sortBy(col) {
    if (this.sortCol===col) this.sortDir*=-1; else { this.sortCol=col; this.sortDir=1; }
    this.renderTable(this.currentTable);
  },
  goPage(p) {
    const tp = Math.max(1, Math.ceil(this.filteredRows.length/this.pageSize));
    this.page = Math.max(1, Math.min(p, tp));
    this.renderTable(this.currentTable);
  },

  // ─── ADD / EDIT ────────────────────────────────────────────────────────────
  openAdd()          { this._openForm(this.currentTable, null, null); },
  openEdit(t, idx)   { this._openForm(t, Store.getRows(t)[idx], idx); },

  _openForm(table, row, idx) {
    const cols = Store.getCols(table).filter(c => !SKIP_COLS.has(c));
    document.getElementById('modal-title').textContent = idx!==null ? 'Modifica record' : 'Nuovo record';
    document.getElementById('modal-body').innerHTML =
      '<div class="form-grid">' +
      cols.map(c => {
        const fieldId = 'f_' + c.replace(/[^a-zA-Z0-9]/g,'_');
        const val = row ? esc(row[c]||'') : '';
        return `<div class="form-group"><label>${esc(c)}</label><input type="text" id="${fieldId}" value="${val}" placeholder="${esc(c)}"/></div>`;
      }).join('') +
      '</div>';
    const colsJson = JSON.stringify(cols);
    document.getElementById('modal-footer').innerHTML =
      `<button class="btn btn-ghost" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-primary" onclick="App.saveForm('${table}',${colsJson},${idx!==null?idx:'null'})">
         ${idx!==null ? 'Salva modifiche' : 'Aggiungi'}
       </button>`;
    this.openModal();
  },

  saveForm(table, cols, idx) {
    const row = {};
    cols.forEach(c => {
      const el = document.getElementById('f_' + c.replace(/[^a-zA-Z0-9]/g,'_'));
      if (el) row[c] = el.value;
    });
    if (idx!==null) { Store.updateRow(table, idx, row); toast('Record aggiornato'); }
    else            { Store.addRow(table, row);          toast('Record aggiunto'); }
    this.closeModal();
    const b = document.getElementById('badge-'+table);
    if (b) b.textContent = Store.getRows(table).length;
    this.renderTable(table);
  },

  confirmDelete(table, idx) {
    const row = Store.getRows(table)[idx];
    const name = Object.values(row).find(v => v && v !== '') || 'questo record';
    document.getElementById('confirm-title').textContent = 'Elimina record';
    document.getElementById('confirm-msg').textContent = `Confermi l'eliminazione di "${name}"?`;
    document.getElementById('confirm-ok').onclick = () => {
      Store.deleteRow(table, idx);
      toast('Record eliminato', 'error');
      const b = document.getElementById('badge-'+table);
      if (b) b.textContent = Store.getRows(table).length;
      this.closeConfirm();
      this.renderTable(table);
    };
    document.getElementById('confirm-overlay').classList.add('open');
  },

  // ─── USERS ─────────────────────────────────────────────────────────────────
  renderUsers() {
    const users = Auth.getUsers();
    document.getElementById('content').innerHTML = `
      <div class="table-wrap">
        <div class="table-scroll">
          <table>
            <thead><tr><th>Username</th><th>Nome</th><th>Ruolo</th><th>Azioni</th></tr></thead>
            <tbody>
              ${users.map((u,i) => `<tr>
                <td>${esc(u.username)}</td><td>${esc(u.nome)}</td>
                <td><span class="pill ${u.role==='admin'?'pill-red':u.role==='editor'?'pill-blue':'pill-gray'}">${esc(u.role)}</span></td>
                <td><div class="td-actions">
                  <button class="icon-btn" onclick="App.openEditUser(${i})">✎</button>
                  <button class="icon-btn danger" onclick="App.confirmDeleteUser(${i})">✕</button>
                </div></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  openAddUser()      { this._openUserForm(null, null); },
  openEditUser(idx)  { this._openUserForm(Auth.getUsers()[idx], idx); },

  _openUserForm(u, idx) {
    document.getElementById('modal-title').textContent = u ? 'Modifica Utente' : 'Nuovo Utente';
    document.getElementById('modal-body').innerHTML = `
      <div class="form-grid">
        <div class="form-group"><label>Username</label><input type="text" id="u_username" value="${esc(u?.username||'')}"/></div>
        <div class="form-group"><label>Nome</label><input type="text" id="u_nome" value="${esc(u?.nome||'')}"/></div>
        <div class="form-group"><label>Password</label><input type="password" id="u_password" placeholder="${u?'Lascia vuoto per non cambiare':'Password'}"/></div>
        <div class="form-group"><label>Ruolo</label>
          <select id="u_role">
            <option value="viewer" ${u?.role==='viewer'?'selected':''}>viewer – solo lettura</option>
            <option value="editor" ${u?.role==='editor'?'selected':''}>editor – modifica dati</option>
            <option value="admin"  ${u?.role==='admin' ?'selected':''}>admin – accesso completo</option>
          </select>
        </div>
      </div>`;
    document.getElementById('modal-footer').innerHTML =
      `<button class="btn btn-ghost" onclick="App.closeModal()">Annulla</button>
       <button class="btn btn-primary" onclick="App.saveUser(${idx!==null?idx:'null'})">Salva</button>`;
    this.openModal();
  },

  saveUser(idx) {
    const username = document.getElementById('u_username').value.trim();
    const nome     = document.getElementById('u_nome').value.trim();
    const password = document.getElementById('u_password').value;
    const role     = document.getElementById('u_role').value;
    if (!username || !nome) { toast('Compila tutti i campi','error'); return; }
    const users = Auth.getUsers();
    if (idx===null) {
      if (!password) { toast('Inserisci una password','error'); return; }
      users.push({ username, nome, password, role });
    } else {
      users[idx] = { username, nome, role, password: password||users[idx].password };
    }
    Auth.saveUsers(users);
    toast('Utente salvato');
    this.closeModal();
    this.renderUsers();
  },

  confirmDeleteUser(idx) {
    const u = Auth.getUsers()[idx];
    document.getElementById('confirm-title').textContent = 'Elimina Utente';
    document.getElementById('confirm-msg').textContent = `Eliminare l'utente "${u.username}"?`;
    document.getElementById('confirm-ok').onclick = () => {
      const users = Auth.getUsers(); users.splice(idx,1); Auth.saveUsers(users);
      toast('Utente eliminato','error'); this.closeConfirm(); this.renderUsers();
    };
    document.getElementById('confirm-overlay').classList.add('open');
  },

  // ─── CSV ───────────────────────────────────────────────────────────────────
  exportCSV(table) {
    const rows = this.filteredRows.length ? this.filteredRows : Store.getRows(table);
    const cols = Store.getCols(table).filter(c => c && c !== '_id');
    const lines = [cols.map(c => '"'+c+'"').join(',')];
    rows.forEach(r => lines.push(cols.map(c => '"'+(String(r[c]||'').replace(/"/g,'""'))+'"').join(',')));
    const blob = new Blob(['\uFEFF'+lines.join('\n')], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = table+'_'+new Date().toISOString().slice(0,10)+'.csv'; a.click();
    toast('Export CSV completato');
  },

  // ─── MODAL ─────────────────────────────────────────────────────────────────
  openModal()  { document.getElementById('modal-overlay').classList.add('open'); },
  closeModal(e){ if(e && e.target!==document.getElementById('modal-overlay')) return; document.getElementById('modal-overlay').classList.remove('open'); },
  closeConfirm(e){ if(e && e.target!==document.getElementById('confirm-overlay')) return; document.getElementById('confirm-overlay').classList.remove('open'); },
  handleKey(e) {
    if (e.key==='Escape') { this.closeModal(); this.closeConfirm(); }
    if ((e.ctrlKey||e.metaKey) && e.key==='Enter') {
      const btn = document.getElementById('modal-footer')?.querySelector('.btn-primary');
      if (btn) btn.click();
    }
  }
};

// ─── BOOT ────────────────────────────────────────────────────────────────────
window.addEventListener('keydown', e => App.handleKey(e));
['login-user','login-pass'].forEach(id =>
  document.getElementById(id)?.addEventListener('keydown', e => { if(e.key==='Enter') App.login(); })
);

try {
  Store.load();
} catch(e) {
  console.error('Errore caricamento dati:', e);
}

document.getElementById('loading').classList.add('hidden');

const user = Auth.current();
if (user) {
  document.getElementById('login-screen').style.display = 'none';
  App.initApp(user);
} else {
  document.getElementById('login-screen').style.display = 'flex';
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
