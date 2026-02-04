// Local JSON persistence via the Kanban server (same-origin when opened from the Projects tab)
// Falls back to localStorage if the server is unreachable, but will prefer file-backed storage.

const LS_KEY = 'return-deadline-tracker:v1';

function projectSlugFromPath(){
  // expected: /projects/<slug>/index.html
  const parts = (location.pathname || '').split('/').filter(Boolean);
  const i = parts.indexOf('projects');
  return (i >= 0 && parts[i+1]) ? parts[i+1] : '2026-02-04-return-deadline-tracker';
}

const PROJECT = projectSlugFromPath();
const API = `/api/projects/${encodeURIComponent(PROJECT)}/data`;

function loadFromLocalStorage(){
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
  catch { return []; }
}
function saveToLocalStorage(items){
  localStorage.setItem(LS_KEY, JSON.stringify(items));
}

async function load(){
  try {
    const res = await fetch(API, { cache: 'no-store' });
    const json = await res.json();
    if (json && json.ok) return Array.isArray(json.items) ? json.items : [];
  } catch (_) {}
  return loadFromLocalStorage();
}

async function save(items){
  // best-effort write to server; fallback to localStorage
  try {
    const res = await fetch(API, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ items }) });
    const json = await res.json().catch(()=>({}));
    if (json && json.ok) return;
  } catch (_) {}
  saveToLocalStorage(items);
}

function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
function today(){
  const d = new Date();
  d.setHours(0,0,0,0);
  return d;
}
function parseDate(s){
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d)) return null;
  return d;
}
function fmtDate(d){
  return d.toISOString().slice(0,10);
}
function addDays(d, days){
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
function daysBetween(a, b){
  const ms = b - a;
  return Math.ceil(ms / 86400000);
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
  status: document.querySelector('#status'),
  clearAll: document.querySelector('#clearAll'),
  exportCsv: document.querySelector('#exportCsv')
};

els.purchaseDate.value = fmtDate(today());

let items = [];

function render(){
  const f = (els.filter.value || '').trim().toLowerCase();
  const t0 = today();

  const filtered = items
    .filter(x => {
      if (!f) return true;
      const blob = `${x.item} ${x.store||''} ${x.notes||''}`.toLowerCase();
      return blob.includes(f);
    })
    .map(x => {
      const pd = parseDate(x.purchaseDate);
      const due = addDays(pd, Number(x.windowDays || 30));
      const left = daysBetween(t0, due);
      return { ...x, due, left };
    })
    .sort((a,b)=> a.due - b.due);

  els.list.innerHTML = '';

  if (filtered.length === 0){
    els.list.innerHTML = `<div class="muted">No items yet.</div>`;
    return;
  }

  for (const x of filtered){
    const badgeClass = x.left < 0 ? 'late' : (x.left <= 3 ? 'due' : '');
    const badgeText = x.left < 0 ? `${Math.abs(x.left)} day(s) late` : `${x.left} day(s) left`;

    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <div class="top">
        <div>
          <div class="title">${escapeHtml(x.item)}</div>
          <div class="muted">${escapeHtml(x.store || '—')} · purchased ${escapeHtml(x.purchaseDate)} · window ${escapeHtml(String(x.windowDays))} days</div>
        </div>
        <div style="text-align:right">
          <div class="badge ${badgeClass}">Return by ${fmtDate(x.due)}</div>
          <div class="muted" style="margin-top:6px">${badgeText}</div>
        </div>
      </div>
      ${x.notes ? `<div class="muted" style="margin-top:10px;white-space:pre-wrap">${escapeHtml(x.notes)}</div>` : ''}
      <div class="actions">
        <button data-action="delete" data-id="${x.id}">Delete</button>
      </div>
    `;
    els.list.appendChild(div);
  }
}

function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

els.form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const item = els.item.value.trim();
  const store = els.store.value.trim();
  const purchaseDate = els.purchaseDate.value;
  const windowDays = Number(els.windowDays.value || 30);
  const notes = els.notes.value.trim();

  if (!item) return;
  if (!purchaseDate) return;
  if (!windowDays || windowDays < 1) return;

  items.push({ id: uid(), item, store, purchaseDate, windowDays, notes, createdAt: new Date().toISOString() });
  await save(items);

  els.item.value='';
  els.store.value='';
  els.notes.value='';
  els.status.textContent = 'Saved';
  setTimeout(()=> els.status.textContent='', 1200);
  render();
});

els.list.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === 'delete'){
    items = items.filter(x => x.id !== id);
    await save(items);
    render();
  }
});

els.filter.addEventListener('input', render);

els.clearAll.addEventListener('click', async ()=>{
  if (!confirm('Clear all items?')) return;
  items = [];
  await save(items);
  render();
});

els.exportCsv.addEventListener('click', ()=>{
  const rows = [['item','store','purchaseDate','windowDays','notes']].concat(
    items.map(x => [x.item, x.store||'', x.purchaseDate, String(x.windowDays||30), x.notes||''])
  );
  const csv = rows.map(r => r.map(cell => {
    const s = String(cell ?? '');
    if (/[\n\r,\"]/g.test(s)) return '"' + s.replace(/\"/g,'""') + '"';
    return s;
  }).join(',')).join('\n');

  const blob = new Blob([csv], { type:'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'return-deadlines.csv';
  a.click();
  URL.revokeObjectURL(a.href);
});

async function boot(){
  items = await load();

  // one-time best-effort migration from localStorage into file-backed storage
  const ls = loadFromLocalStorage();
  if (Array.isArray(ls) && ls.length && (!items || !items.length)) {
    items = ls;
    await save(items);
  }

  render();
}

boot();
