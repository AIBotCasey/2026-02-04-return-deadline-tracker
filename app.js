// Return Deadline Tracker — in-depth version
// Storage:
// - If opened under the Kanban server (/projects/<slug>/...), uses /api/projects/<slug>/data (SQLite-backed)
// - Otherwise falls back to localStorage

const LS_KEY = 'return-deadline-tracker:v2';

function projectSlugFromPath(){
  const parts = (location.pathname || '').split('/').filter(Boolean);
  const i = parts.indexOf('projects');
  return (i >= 0 && parts[i+1]) ? parts[i+1] : null;
}

const PROJECT = projectSlugFromPath();
const API = PROJECT ? `/api/projects/${encodeURIComponent(PROJECT)}/data` : null;

function uid(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }
function today(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
function fmtDate(d){ return d.toISOString().slice(0,10); }
function parseDate(s){ const d=new Date(s+'T00:00:00'); return isNaN(d)?null:d; }
function addDays(d, days){ const x=new Date(d); x.setDate(x.getDate()+days); return x; }
function daysBetween(a,b){ return Math.ceil((b-a)/86400000); }
function esc(s){ return String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function loadFromLocalStorage(){
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
  catch { return []; }
}
function saveToLocalStorage(items){
  localStorage.setItem(LS_KEY, JSON.stringify(items));
}

async function load(){
  if (API) {
    try {
      const res = await fetch(API, { cache: 'no-store' });
      const json = await res.json();
      if (json && json.ok) return Array.isArray(json.items) ? json.items : [];
    } catch (_) {}
  }
  return loadFromLocalStorage();
}

async function save(items){
  if (API) {
    try {
      const res = await fetch(API, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ items }) });
      const json = await res.json().catch(()=>({}));
      if (json && json.ok) return;
    } catch (_) {}
  }
  saveToLocalStorage(items);
}

const els = {
  form: document.querySelector('#form'),
  item: document.querySelector('#item'),
  store: document.querySelector('#store'),
  purchaseDate: document.querySelector('#purchaseDate'),
  windowDays: document.querySelector('#windowDays'),
  notes: document.querySelector('#notes'),
  list: document.querySelector('#list'),
  filter: document.querySelector('#filter'),
  sort: document.querySelector('#sort'),
  status: document.querySelector('#status'),
  clearAll: document.querySelector('#clearAll'),
  exportCsv: document.querySelector('#exportCsv'),
  importCsv: document.querySelector('#importCsv'),
  csvFile: document.querySelector('#csvFile'),
  showReturned: document.querySelector('#showReturned'),
  preset30: document.querySelector('#preset30'),
  preset60: document.querySelector('#preset60'),
  preset90: document.querySelector('#preset90'),
  summaryActive: document.querySelector('#summaryActive'),
  summaryDueSoon: document.querySelector('#summaryDueSoon'),
  summaryLate: document.querySelector('#summaryLate'),
};

els.purchaseDate.value = fmtDate(today());

let items = [];

function normalize(x){
  return {
    id: x.id || uid(),
    item: String(x.item || '').trim(),
    store: String(x.store || '').trim(),
    purchaseDate: x.purchaseDate || fmtDate(today()),
    windowDays: Number(x.windowDays || 30),
    notes: String(x.notes || '').trim(),
    status: (x.status === 'returned') ? 'returned' : 'active',
    createdAt: x.createdAt || new Date().toISOString(),
    returnedAt: x.returnedAt || null
  };
}

function compute(x){
  const pd = parseDate(x.purchaseDate) || today();
  const due = addDays(pd, Number(x.windowDays || 30));
  const left = daysBetween(today(), due);
  return { ...x, due, left };
}

function applyFilterAndSort(list){
  const f = (els.filter.value || '').trim().toLowerCase();
  const showReturned = !!els.showReturned.checked;
  let out = list
    .map(normalize)
    .filter(x => showReturned ? true : x.status !== 'returned')
    .filter(x => {
      if (!f) return true;
      const blob = `${x.item} ${x.store} ${x.notes}`.toLowerCase();
      return blob.includes(f);
    })
    .map(compute);

  const mode = els.sort.value;
  const cmp = {
    'due-asc': (a,b)=> a.due - b.due,
    'due-desc': (a,b)=> b.due - a.due,
    'purchase-desc': (a,b)=> (parseDate(b.purchaseDate)||0) - (parseDate(a.purchaseDate)||0),
    'purchase-asc': (a,b)=> (parseDate(a.purchaseDate)||0) - (parseDate(b.purchaseDate)||0),
    'store': (a,b)=> (a.store||'').localeCompare(b.store||''),
  }[mode] || ((a,b)=> a.due-b.due);

  out.sort(cmp);
  return out;
}

function renderSummary(list){
  const active = list.filter(x => x.status !== 'returned').map(compute);
  const dueSoon = active.filter(x => x.left >= 0 && x.left <= 3).length;
  const late = active.filter(x => x.left < 0).length;
  els.summaryActive.textContent = `Active: ${active.length}`;
  els.summaryDueSoon.textContent = `Due ≤ 3d: ${dueSoon}`;
  els.summaryLate.textContent = `Late: ${late}`;
}

function render(){
  renderSummary(items);

  const list = applyFilterAndSort(items);
  if (!list.length) {
    els.list.innerHTML = `<div class="muted">No items yet.</div>`;
    return;
  }

  els.list.innerHTML = list.map(x => {
    const badgeClass = x.left < 0 ? 'late' : (x.left <= 3 ? 'due' : '');
    const badgeText = x.left < 0 ? `${Math.abs(x.left)} day(s) late` : `${x.left} day(s) left`;
    const returned = x.status === 'returned';

    return `
      <div class="card" data-id="${esc(x.id)}">
        <div class="top">
          <div>
            <div class="title">${esc(x.item)}</div>
            <div class="muted">${esc(x.store || '—')} · purchased ${esc(x.purchaseDate)} · window ${esc(String(x.windowDays))} days</div>
          </div>
          <div style="text-align:right">
            <div class="badge ${badgeClass}">${returned ? 'Returned' : `Return by ${fmtDate(x.due)}`}</div>
            <div class="muted" style="margin-top:6px">${returned ? `on ${esc(x.returnedAt ? x.returnedAt.slice(0,10) : '')}` : badgeText}</div>
          </div>
        </div>
        ${x.notes ? `<div class="muted" style="margin-top:10px;white-space:pre-wrap">${esc(x.notes)}</div>` : ''}
        <div class="actions">
          ${returned ? `<button data-action="undo">Undo</button>` : `<button data-action="returned">Mark returned</button>`}
          <button data-action="edit">Edit</button>
          <button data-action="delete" class="danger">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

async function persist(){
  await save(items);
  els.status.textContent = `Saved · ${new Date().toLocaleTimeString()}`;
  setTimeout(()=> els.status.textContent='', 1200);
}

function setPreset(days){
  els.windowDays.value = String(days);
}

els.preset30.onclick = ()=> setPreset(30);
els.preset60.onclick = ()=> setPreset(60);
els.preset90.onclick = ()=> setPreset(90);

els.form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const x = normalize({
    id: uid(),
    item: els.item.value,
    store: els.store.value,
    purchaseDate: els.purchaseDate.value,
    windowDays: Number(els.windowDays.value || 30),
    notes: els.notes.value,
    status: 'active'
  });
  if (!x.item) return;
  items.push(x);
  await persist();
  els.item.value='';
  els.notes.value='';
  render();
});

els.list.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button');
  if (!btn) return;
  const card = e.target.closest('.card');
  if (!card) return;
  const id = card.dataset.id;
  const x = items.find(i => i.id === id);
  if (!x) return;

  const action = btn.dataset.action;

  if (action === 'delete') {
    if (!confirm('Delete this item?')) return;
    items = items.filter(i => i.id !== id);
    await persist();
    render();
    return;
  }

  if (action === 'returned') {
    x.status = 'returned';
    x.returnedAt = new Date().toISOString();
    await persist();
    render();
    return;
  }

  if (action === 'undo') {
    x.status = 'active';
    x.returnedAt = null;
    await persist();
    render();
    return;
  }

  if (action === 'edit') {
    const item = prompt('Item:', x.item); if (item === null) return;
    const store = prompt('Store:', x.store || ''); if (store === null) return;
    const purchaseDate = prompt('Purchase date (YYYY-MM-DD):', x.purchaseDate); if (purchaseDate === null) return;
    const windowDays = prompt('Return window (days):', String(x.windowDays || 30)); if (windowDays === null) return;
    const notes = prompt('Notes:', x.notes || ''); if (notes === null) return;

    x.item = item.trim();
    x.store = store.trim();
    x.purchaseDate = purchaseDate.trim() || x.purchaseDate;
    x.windowDays = Number(windowDays || x.windowDays || 30);
    x.notes = notes;

    await persist();
    render();
    return;
  }
});

els.filter.addEventListener('input', render);
els.sort.addEventListener('change', render);
els.showReturned.addEventListener('change', render);

els.clearAll.addEventListener('click', async ()=>{
  if (!confirm('Clear all items (including returned)?')) return;
  items = [];
  await persist();
  render();
});

function toCsvRows(list){
  return [['item','store','purchaseDate','windowDays','notes','status','returnedAt']].concat(
    list.map(x => [x.item, x.store||'', x.purchaseDate, String(x.windowDays||30), x.notes||'', x.status||'active', x.returnedAt||''])
  );
}

function rowsToCsv(rows){
  return rows.map(r => r.map(cell => {
    const s = String(cell ?? '');
    if (/[\n\r,\"]/g.test(s)) return '"' + s.replace(/\"/g,'""') + '"';
    return s;
  }).join(',')).join('\n');
}

els.exportCsv.addEventListener('click', ()=>{
  const csv = rowsToCsv(toCsvRows(items.map(normalize)));
  const blob = new Blob([csv], { type:'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'return-deadlines.csv';
  a.click();
  URL.revokeObjectURL(a.href);
});

els.importCsv.addEventListener('click', ()=>{
  els.csvFile.value = '';
  els.csvFile.click();
});

els.csvFile.addEventListener('change', async ()=>{
  const f = els.csvFile.files && els.csvFile.files[0];
  if (!f) return;
  const text = await f.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return;
  const header = parseCsvLine(lines[0]).map(h => h.trim());

  const idx = (name) => header.indexOf(name);
  const map = {
    item: idx('item'),
    store: idx('store'),
    purchaseDate: idx('purchaseDate'),
    windowDays: idx('windowDays'),
    notes: idx('notes'),
    status: idx('status'),
    returnedAt: idx('returnedAt')
  };

  const imported = [];
  for (let i=1;i<lines.length;i++) {
    const cols = parseCsvLine(lines[i]);
    if (!cols.length) continue;
    const rec = {
      id: uid(),
      item: cols[map.item] ?? '',
      store: cols[map.store] ?? '',
      purchaseDate: cols[map.purchaseDate] ?? fmtDate(today()),
      windowDays: Number(cols[map.windowDays] ?? 30),
      notes: cols[map.notes] ?? '',
      status: (cols[map.status] === 'returned') ? 'returned' : 'active',
      returnedAt: cols[map.returnedAt] || null,
      createdAt: new Date().toISOString(),
    };
    if (String(rec.item||'').trim()) imported.push(normalize(rec));
  }

  if (!imported.length) return;
  items = items.concat(imported);
  await persist();
  render();
});

function parseCsvLine(line){
  const out=[];
  let cur='';
  let inQ=false;
  for (let i=0;i<line.length;i++){
    const ch=line[i];
    if (inQ){
      if (ch==='"'){
        if (line[i+1]==='"'){ cur+='"'; i++; }
        else inQ=false;
      } else cur+=ch;
    } else {
      if (ch===','){ out.push(cur); cur=''; }
      else if (ch==='"') inQ=true;
      else cur+=ch;
    }
  }
  out.push(cur);
  return out;
}

async function boot(){
  items = (await load()).map(normalize);

  // one-time best-effort migration from older localStorage key
  try {
    const old = JSON.parse(localStorage.getItem('return-deadline-tracker:v1') || '[]');
    if (Array.isArray(old) && old.length && (!items || !items.length)) {
      items = old.map(normalize);
      await save(items);
    }
  } catch(_) {}

  await save(items);
  render();
}

boot();
