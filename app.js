'use strict';

// ─── AUTH ────────────────────────────────────────────────────────────────────
const DEFAULT_USERS = [
  { username: 'admin',    password: 'admin123',   role: 'admin',  nome: 'Amministratore' },
  { username: 'hr',       password: 'hr2024',     role: 'editor', nome: 'Ufficio HR' },
  { username: 'viewer',   password: 'viewer2024', role: 'viewer', nome: 'Visualizzatore' },
];

const Auth = {
  getUsers() {
    const s = localStorage.getItem('gestionale_users');
    return s ? JSON.parse(s) : DEFAULT_USERS;
  },
  saveUsers(users) { localStorage.setItem('gestionale_users', JSON.stringify(users)); },
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
  async load() {
    const tables = ['dipendenti','contratti','formazione','sorveglianza','aziende'];
    for (const t of tables) {
      const local = localStorage.getItem(`gestionale_data_${t}`);
      if (local) {
        this.data[t] = JSON.parse(local);
      } else {
        const r = await fetch(`data/${t}.json`);
        this.data[t] = await r.json();
        this.save(t);
      }
    }
  },
  save(table) {
    localStorage.setItem(`gestionale_data_${table}`, JSON.stringify(this.data[table]));
  },
  getRows(table) { return this.data[table]?.rows || []; },
  getCols(table) { return this.data[table]?.columns || []; },
  addRow(table, row) {
    row._id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    this.data[table].rows.push(row);
    this.save(table);
  },
  updateRow(table, idx, row) {
    const id = this.data[table].rows[idx]._id;
    this.data[table].rows[idx] = { ...row, _id: id };
    this.save(table);
  },
  deleteRow(table, idx) {
    this.data[table].rows.splice(idx, 1);
    this.save(table);
  },
  resetTable(table) {
    localStorage.removeItem(`gestionale_data_${table}`);
  }
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast-msg ${type}`;
  el.innerHTML = `<span>${type === 'success' ? '✓' : '✕'}</span> ${msg}`;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ─── TABLE CONFIG (which columns to show as primary, badge logic) ─────────────
const TABLE_META = {
  dipendenti: {
    label: 'Dipendenti',
    primaryCols: ['Cognome', 'Nome', 'Cod. Fiscale', 'Data di Nascita', 'Luogo di Nascita', 'Nazionalità', 'Sesso'],
    statusCol: null,
  },
  contratti: {
    label: 'Contratti di Lavoro',
    primaryCols: ['Cognome e Nome', 'Azienda', 'Data inizio', 'Data fine', 'Tipo contratto', 'Mansione', 'CCNL'],
    statusCol: null,
  },
  formazione: {
    label: 'Formazione',
    primaryCols: ['Cognome e Nome', 'Azienda', 'Tipo formazione', 'Data', 'Scadenza', 'Ore', 'Docente'],
    statusCol: null,
  },
  sorveglianza: {
    label: 'Sorveglianza Sanitaria',
    primaryCols: ['Cognome e Nome', 'Azienda', 'Data visita', 'Scadenza', 'Giudizio', 'Medico'],
    statusCol: 'Giudizio',
  },
  aziende: {
    label: 'Anagrafica Aziende',
    primaryCols: ['Ragione Sociale', 'P.IVA', 'Sede Legale', 'Telefono', 'Email'],
    statusCol: null,
  },
};

function getDisplayCols(table) {
  const meta = TABLE_META[table];
  const all = Store.getCols(table);
  const primary = meta.primaryCols.filter(c => all.includes(c));
  if (primary.length > 0) return primary;
  return all.slice(0, 7);
}

function statusPill(val) {
  if (!val) return '';
  const v = val.toLowerCase();
  if (v.includes('idon') && !v.includes('non')) return `<span class="pill pill-green">${esc(val)}</span>`;
  if (v.includes('non idon') || v.includes('inidon')) return `<span class="pill pill-red">${esc(val)}</span>`;
  if (v.includes('parzial') || v.includes('prescriz')) return `<span class="pill pill-yellow">${esc(val)}</span>`;
  return `<span class="pill pill-gray">${esc(val)}</span>`;
}

// ─── APP ─────────────────────────────────────────────────────────────────────
const App = {
  currentView: 'dashboard',
  currentTable: null,
  page: 1,
  pageSize: 25,
  sortCol: null,
  sortDir: 1,
  filterText: '',
  filteredRows: [],

  login() {
    const u = document.getElementById('login-user').value.trim();
    const p = document.getElementById('login-pass').value;
    const user = Auth.login(u, p);
    if (user) {
      document.getElementById('login-screen').style.display = 'none';
      this.initApp(user);
    } else {
      const err = document.getElementById('login-error');
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
    document.getElementById('user-label').textContent = `${user.nome} · ${user.role}`;
    // Badges
    ['dipendenti','contratti','formazione','sorveglianza','aziende'].forEach(t => {
      const b = document.getElementById(`badge-${t}`);
      if (b) b.textContent = Store.getRows(t).length;
    });
    // Admin nav
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
    document.querySelector(`[data-view="${view}"]`)?.classList.add('active');
    const title = document.getElementById('topbar-title');
    const searchWrap = document.getElementById('search-wrap');
    const btnAdd = document.getElementById('btn-add');
    document.getElementById('search-input').value = '';

    if (view === 'dashboard') {
      title.textContent = 'Dashboard';
      searchWrap.style.display = 'none';
      btnAdd.style.display = 'none';
      this.renderDashboard();
    } else if (view === 'utenti') {
      title.textContent = 'Gestione Utenti';
      searchWrap.style.display = 'none';
      btnAdd.style.display = Auth.isAdmin() ? '' : 'none';
      document.getElementById('btn-add').onclick = () => this.openAddUser();
      this.renderUsers();
    } else {
      this.currentTable = view;
      title.textContent = TABLE_META[view]?.label || view;
      searchWrap.style.display = '';
      btnAdd.style.display = Auth.canEdit() ? '' : 'none';
      document.getElementById('btn-add').onclick = () => this.openAdd();
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
    const az = Store.getRows('aziende');

    // Count by azienda in contratti
    const azCount = {};
    con.forEach(r => {
      const a = r['Azienda'] || 'N/D';
      azCount[a] = (azCount[a] || 0) + 1;
    });
    const topAz = Object.entries(azCount).sort((a,b) => b[1]-a[1]).slice(0,8);
    const maxAz = topAz[0]?.[1] || 1;

    // Formazione per tipo
    const forTipo = {};
    for_.forEach(r => {
      const t = r['Tipo formazione'] || 'N/D';
      forTipo[t] = (forTipo[t] || 0) + 1;
    });
    const topFor = Object.entries(forTipo).sort((a,b) => b[1]-a[1]).slice(0,8);
    const maxFor = topFor[0]?.[1] || 1;

    // Sorveglianza giudizi
    const giudizi = {};
    sor.forEach(r => {
      const g = r['Giudizio'] || 'N/D';
      giudizi[g] = (giudizi[g] || 0) + 1;
    });

    // Scadenze prossime sorveglianza (entro 90gg)
    const oggi = new Date();
    const limite = new Date(); limite.setDate(oggi.getDate() + 90);
    let scadenze = 0;
    sor.forEach(r => {
      const s = r['Scadenza'];
      if (s) {
        const parts = s.split(/[\/\-]/);
        let d;
        if (parts.length === 3) {
          if (parts[0].length === 4) d = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
          else d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
          if (d >= oggi && d <= limite) scadenze++;
        }
      }
    });

    document.getElementById('content').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card blue">
        <div class="stat-label">Dipendenti</div>
        <div class="stat-value">${dip.length}</div>
        <div class="stat-sub">anagrafica totale</div>
      </div>
      <div class="stat-card cyan">
        <div class="stat-label">Contratti</div>
        <div class="stat-value">${con.length}</div>
        <div class="stat-sub">rapporti di lavoro</div>
      </div>
      <div class="stat-card green">
        <div class="stat-label">Formazione</div>
        <div class="stat-value">${for_.length}</div>
        <div class="stat-sub">corsi registrati</div>
      </div>
      <div class="stat-card warn">
        <div class="stat-label">Scadenze Sorveglianza</div>
        <div class="stat-value">${scadenze}</div>
        <div class="stat-sub">entro 90 giorni</div>
      </div>
      <div class="stat-card red">
        <div class="stat-label">Sorveglianza</div>
        <div class="stat-value">${sor.length}</div>
        <div class="stat-sub">visite registrate</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-label">Aziende</div>
        <div class="stat-value">${az.length}</div>
        <div class="stat-sub">in anagrafica</div>
      </div>
    </div>
    <div class="dash-grid">
      <div class="panel">
        <div class="panel-header">📄 Contratti per Azienda</div>
        <div class="panel-body">
          ${topAz.map(([a,n]) => `
            <div class="bar-item">
              <span class="bar-label" title="${esc(a)}">${esc(a)}</span>
              <div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/maxAz*100)}%"></div></div>
              <span class="bar-count">${n}</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header">🎓 Formazione per Tipo</div>
        <div class="panel-body">
          ${topFor.map(([t,n]) => `
            <div class="bar-item">
              <span class="bar-label" title="${esc(t)}">${esc(t)}</span>
              <div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/maxFor*100)};background:var(--accent2)"></div></div>
              <span class="bar-count">${n}</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header">🏥 Giudizi Sorveglianza</div>
        <div class="panel-body">
          ${Object.entries(giudizi).sort((a,b)=>b[1]-a[1]).map(([g,n]) => `
            <div class="bar-item">
              <span class="bar-label">${statusPill(g)}</span>
              <div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/sor.length*100)}%;background:var(--success)"></div></div>
              <span class="bar-count">${n}</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="panel">
        <div class="panel-header">📊 Riepilogo Generale</div>
        <div class="panel-body">
          <table style="width:100%;font-size:12px">
            <tr><td style="color:var(--text3);padding:6px 0;border-bottom:1px solid var(--border)">Dipendenti totali</td><td style="text-align:right;font-family:var(--font-mono);font-weight:700;padding:6px 0;border-bottom:1px solid var(--border)">${dip.length}</td></tr>
            <tr><td style="color:var(--text3);padding:6px 0;border-bottom:1px solid var(--border)">Contratti attivi</td><td style="text-align:right;font-family:var(--font-mono);font-weight:700;padding:6px 0;border-bottom:1px solid var(--border)">${con.length}</td></tr>
            <tr><td style="color:var(--text3);padding:6px 0;border-bottom:1px solid var(--border)">Corsi formazione</td><td style="text-align:right;font-family:var(--font-mono);font-weight:700;padding:6px 0;border-bottom:1px solid var(--border)">${for_.length}</td></tr>
            <tr><td style="color:var(--text3);padding:6px 0;border-bottom:1px solid var(--border)">Visite mediche</td><td style="text-align:right;font-family:var(--font-mono);font-weight:700;padding:6px 0;border-bottom:1px solid var(--border)">${sor.length}</td></tr>
            <tr><td style="color:var(--text3);padding:6px 0">⚠ Scadenze prossime (90gg)</td><td style="text-align:right;font-family:var(--font-mono);font-weight:700;padding:6px 0;color:var(--warn)">${scadenze}</td></tr>
          </table>
        </div>
      </div>
    </div>`;
  },

  // ─── TABLE VIEW ────────────────────────────────────────────────────────────
  renderTable(table) {
    const allRows = Store.getRows(table);
    const cols = getDisplayCols(table);
    const allCols = Store.getCols(table);
    const meta = TABLE_META[table];

    // Filter
    let rows = allRows;
    if (this.filterText) {
      rows = allRows.filter(r =>
        Object.values(r).some(v => String(v).toLowerCase().includes(this.filterText))
      );
    }

    // Sort
    if (this.sortCol) {
      rows = [...rows].sort((a,b) => {
        const va = String(a[this.sortCol]||'').toLowerCase();
        const vb = String(b[this.sortCol]||'').toLowerCase();
        return va < vb ? -this.sortDir : va > vb ? this.sortDir : 0;
      });
    }

    this.filteredRows = rows;
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / this.pageSize));
    if (this.page > totalPages) this.page = totalPages;
    const start = (this.page - 1) * this.pageSize;
    const pageRows = rows.slice(start, start + this.pageSize);

    const canEdit = Auth.canEdit();

    const headers = cols.map(c => {
      const sorted = this.sortCol === c;
      const icon = sorted ? (this.sortDir === 1 ? '↑' : '↓') : '↕';
      return `<th class="${sorted?'sorted':''}" onclick="App.sortBy('${esc(c)}')">${esc(c)} <span class="sort-icon">${icon}</span></th>`;
    }).join('');

    const bodyRows = pageRows.map((row, pi) => {
      const realIdx = start + pi;
      const origIdx = allRows.indexOf(row);
      const tds = cols.map((c, ci) => {
        let val = row[c] ?? '';
        if (meta.statusCol === c) return `<td>${statusPill(val)}</td>`;
        return `<td title="${esc(val)}">${esc(val)}</td>`;
      }).join('');
      const actions = canEdit ? `
        <td>
          <div class="td-actions">
            <button class="icon-btn" title="Modifica" onclick="App.openEdit('${table}',${origIdx})">✎</button>
            <button class="icon-btn danger" title="Elimina" onclick="App.confirmDelete('${table}',${origIdx})">✕</button>
          </div>
        </td>` : '';
      return `<tr>${tds}${actions}</tr>`;
    }).join('');

    // Pagination
    let pages = '';
    const maxBtns = 7;
    let startP = Math.max(1, this.page - 3);
    let endP = Math.min(totalPages, startP + maxBtns - 1);
    if (endP - startP < maxBtns - 1) startP = Math.max(1, endP - maxBtns + 1);
    for (let i = startP; i <= endP; i++) {
      pages += `<button class="page-btn ${i===this.page?'active':''}" onclick="App.goPage(${i})">${i}</button>`;
    }

    document.getElementById('content').innerHTML = `
    <div class="table-wrap">
      <div class="table-toolbar">
        <span class="record-count">${this.filterText ? `${total} risultati su ` : ''}${allRows.length} record · pagina ${this.page}/${totalPages}</span>
        ${canEdit ? `<button class="btn btn-ghost" style="font-size:11px" onclick="App.exportCSV('${table}')">↓ CSV</button>` : ''}
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr>${headers}${canEdit ? '<th>Azioni</th>' : ''}</tr></thead>
          <tbody>${bodyRows || '<tr><td colspan="99" style="text-align:center;color:var(--text2);padding:32px">Nessun risultato</td></tr>'}</tbody>
        </table>
      </div>
      <div class="pagination">
        <span class="page-info">Mostrati ${start+1}–${Math.min(start+this.pageSize, total)} di ${total}</span>
        <button class="page-btn" onclick="App.goPage(1)" ${this.page===1?'disabled':''}>«</button>
        <button class="page-btn" onclick="App.goPage(${this.page-1})" ${this.page===1?'disabled':''}>‹</button>
        ${pages}
        <button class="page-btn" onclick="App.goPage(${this.page+1})" ${this.page===totalPages?'disabled':''}>›</button>
        <button class="page-btn" onclick="App.goPage(${totalPages})" ${this.page===totalPages?'disabled':''}>»</button>
      </div>
    </div>`;
  },

  sortBy(col) {
    if (this.sortCol === col) this.sortDir *= -1;
    else { this.sortCol = col; this.sortDir = 1; }
    this.renderTable(this.currentTable);
  },

  goPage(p) {
    const total = this.filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(total / this.pageSize));
    this.page = Math.max(1, Math.min(p, totalPages));
    this.renderTable(this.currentTable);
  },

  // ─── ADD / EDIT ────────────────────────────────────────────────────────────
  openAdd() {
    const table = this.currentTable;
    const cols = Store.getCols(table).filter(c => c && c !== '_id');
    this._openForm(table, cols, null, null);
  },

  openEdit(table, idx) {
    const cols = Store.getCols(table).filter(c => c && c !== '_id');
    const row = Store.getRows(table)[idx];
    this._openForm(table, cols, row, idx);
  },

  _openForm(table, cols, row, idx) {
    const isEdit = row !== null;
    document.getElementById('modal-title').textContent = isEdit ? `Modifica record` : `Nuovo record`;

    const skip = new Set(['_id','Riepilogo Dipendente','Riepilogo Dati contrattuali',
      'Riepilogo Formazione','Riepilogo Sorveglianza Sanitaria',
      'Allegati documenti permesso','Allegati formazione (Attestati)',
      'Allegati aggiornamento formazione','Attestato Idoneità ',
      'UNILAV ASSUNZIONE','UNILAV PROROGHE','UNILAV TRASFORMAZIONI','UNILAV CESSAZIONE',
      'Anagrafica Dipendente','Dati Associativi','Sezione stranieri',
      'Dettagli permesso di soggiorno']);

    const useCols = cols.filter(c => !skip.has(c));

    document.getElementById('modal-body').innerHTML = `
      <div class="form-grid">
        ${useCols.map(c => `
          <div class="form-group ${c.length > 30 ? 'full' : ''}">
            <label>${esc(c)}</label>
            <input type="text" id="field_${esc(c.replace(/\s+/g,'_'))}" value="${esc(row ? row[c]||'' : '')}" placeholder="${esc(c)}"/>
          </div>`).join('')}
      </div>`;

    document.getElementById('modal-footer').innerHTML = `
      <button class="btn btn-ghost" onclick="App.closeModal()">Annulla</button>
      <button class="btn btn-primary" onclick="App.saveForm('${table}', ${JSON.stringify(useCols)}, ${idx !== null ? idx : 'null'})">
        ${isEdit ? 'Salva modifiche' : 'Aggiungi'}
      </button>`;

    this.openModal();
  },

  saveForm(table, cols, idx) {
    const row = {};
    cols.forEach(c => {
      const el = document.getElementById('field_' + c.replace(/\s+/g,'_'));
      if (el) row[c] = el.value;
    });
    if (idx !== null) {
      Store.updateRow(table, idx, row);
      toast('Record aggiornato');
    } else {
      Store.addRow(table, row);
      toast('Record aggiunto');
    }
    this.closeModal();
    document.getElementById(`badge-${table}`).textContent = Store.getRows(table).length;
    this.renderTable(table);
  },

  confirmDelete(table, idx) {
    const row = Store.getRows(table)[idx];
    const first = Object.values(row).find(v => v && v !== '') || 'questo record';
    document.getElementById('confirm-title').textContent = 'Elimina record';
    document.getElementById('confirm-msg').textContent = `Confermi l'eliminazione di "${first}"? L'operazione non può essere annullata.`;
    document.getElementById('confirm-ok').onclick = () => {
      Store.deleteRow(table, idx);
      toast('Record eliminato', 'error');
      document.getElementById(`badge-${table}`).textContent = Store.getRows(table).length;
      this.closeConfirm();
      this.renderTable(table);
    };
    document.getElementById('confirm-overlay').classList.add('open');
  },

  // ─── USERS ─────────────────────────────────────────────────────────────────
  renderUsers() {
    const users = Auth.getUsers();
    const rows = users.map((u, i) => `
      <tr>
        <td>${esc(u.username)}</td>
        <td>${esc(u.nome)}</td>
        <td><span class="pill ${u.role==='admin'?'pill-red':u.role==='editor'?'pill-blue':'pill-gray'}">${esc(u.role)}</span></td>
        <td>
          <div class="td-actions">
            <button class="icon-btn" onclick="App.openEditUser(${i})">✎</button>
            <button class="icon-btn danger" onclick="App.confirmDeleteUser(${i})">✕</button>
          </div>
        </td>
      </tr>`).join('');

    document.getElementById('content').innerHTML = `
    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead><tr><th>Username</th><th>Nome</th><th>Ruolo</th><th>Azioni</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  },

  openAddUser() { this._openUserForm(null, null); },
  openEditUser(idx) {
    const u = Auth.getUsers()[idx];
    this._openUserForm(u, idx);
  },

  _openUserForm(u, idx) {
    document.getElementById('modal-title').textContent = u ? 'Modifica Utente' : 'Nuovo Utente';
    document.getElementById('modal-body').innerHTML = `
      <div class="form-grid">
        <div class="form-group"><label>Username</label><input type="text" id="u_username" value="${esc(u?.username||'')}"/></div>
        <div class="form-group"><label>Nome</label><input type="text" id="u_nome" value="${esc(u?.nome||'')}"/></div>
        <div class="form-group"><label>Password</label><input type="password" id="u_password" placeholder="${u ? 'Lascia vuoto per non cambiare' : 'Password'}"/></div>
        <div class="form-group"><label>Ruolo</label>
          <select id="u_role">
            <option value="viewer" ${u?.role==='viewer'?'selected':''}>viewer – solo lettura</option>
            <option value="editor" ${u?.role==='editor'?'selected':''}>editor – modifica dati</option>
            <option value="admin" ${u?.role==='admin'?'selected':''}>admin – accesso completo</option>
          </select>
        </div>
      </div>`;
    document.getElementById('modal-footer').innerHTML = `
      <button class="btn btn-ghost" onclick="App.closeModal()">Annulla</button>
      <button class="btn btn-primary" onclick="App.saveUser(${idx !== null ? idx : 'null'})">Salva</button>`;
    this.openModal();
  },

  saveUser(idx) {
    const username = document.getElementById('u_username').value.trim();
    const nome = document.getElementById('u_nome').value.trim();
    const password = document.getElementById('u_password').value;
    const role = document.getElementById('u_role').value;
    if (!username || !nome) { toast('Compila tutti i campi', 'error'); return; }
    const users = Auth.getUsers();
    if (idx === null) {
      if (!password) { toast('Inserisci una password', 'error'); return; }
      users.push({ username, nome, password, role });
    } else {
      users[idx] = { username, nome, role, password: password || users[idx].password };
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
      const users = Auth.getUsers();
      users.splice(idx, 1);
      Auth.saveUsers(users);
      toast('Utente eliminato', 'error');
      this.closeConfirm();
      this.renderUsers();
    };
    document.getElementById('confirm-overlay').classList.add('open');
  },

  // ─── EXPORT ────────────────────────────────────────────────────────────────
  exportCSV(table) {
    const rows = this.filteredRows.length ? this.filteredRows : Store.getRows(table);
    const cols = Store.getCols(table).filter(c => c && c !== '_id');
    const lines = [cols.map(c => `"${c}"`).join(',')];
    rows.forEach(r => {
      lines.push(cols.map(c => `"${String(r[c]||'').replace(/"/g,'""')}"`).join(','));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${table}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    toast(`Export CSV completato`);
  },

  // ─── MODAL ─────────────────────────────────────────────────────────────────
  openModal() { document.getElementById('modal-overlay').classList.add('open'); },
  closeModal(e) {
    if (e && e.target !== document.getElementById('modal-overlay')) return;
    document.getElementById('modal-overlay').classList.remove('open');
  },
  closeConfirm(e) {
    if (e && e.target !== document.getElementById('confirm-overlay')) return;
    document.getElementById('confirm-overlay').classList.remove('open');
  },

  // ─── KEYBOARD ──────────────────────────────────────────────────────────────
  handleKey(e) {
    if (e.key === 'Escape') {
      this.closeModal();
      this.closeConfirm();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      const modal = document.getElementById('modal-overlay');
      if (modal.classList.contains('open')) {
        const btn = document.getElementById('modal-footer')?.querySelector('.btn-primary');
        btn?.click();
      }
    }
  }
};

// ─── INIT ─────────────────────────────────────────────────────────────────────
window.addEventListener('keydown', e => App.handleKey(e));

// Login on enter
['login-user','login-pass'].forEach(id => {
  document.getElementById(id)?.addEventListener('keydown', e => {
    if (e.key === 'Enter') App.login();
  });
});

(async () => {
  await Store.load();
  document.getElementById('loading').classList.add('hidden');
  const user = Auth.current();
  if (user) {
    document.getElementById('login-screen').style.display = 'none';
    App.initApp(user);
  } else {
    document.getElementById('login-screen').style.display = 'flex';
  }
})();

// PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
