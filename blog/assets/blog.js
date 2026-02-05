async function loadPosts(){
  const res = await fetch('./posts.json', { cache: 'no-store' });
  const json = await res.json();
  return Array.isArray(json.posts) ? json.posts : [];
}

function esc(s){
  return String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderList(posts){
  const el = document.querySelector('#posts');
  if(!posts.length){
    el.innerHTML = '<div class="card"><div class="meta">No posts yet.</div></div>';
    return;
  }
  el.innerHTML = posts.map(p => {
    return `
      <article class="post">
        <div class="row">
          <div>
            <div class="ptitle"><a href="${esc(p.href)}">${esc(p.title)}</a></div>
            <div class="meta">${esc(p.date)}${p.tags?.length ? ' · ' + p.tags.map(t=>'#'+esc(t)).join(' ') : ''}</div>
          </div>
        </div>
        ${p.excerpt ? `<div class="excerpt">${esc(p.excerpt)}</div>` : ''}
      </article>`;
  }).join('');
}

(async function boot(){
  const posts = (await loadPosts()).sort((a,b)=> (b.date||'').localeCompare(a.date||''));
  renderList(posts);
})();
