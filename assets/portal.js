// 作品一覧を data/works.json から作る(作品を足すときは JSON に1件追加するだけ)
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function card(w) {
  const li = document.createElement('li');
  li.className = 'work';
  li.style.setProperty('--accent', w.accent || '#DCE3EA');
  li.innerHTML = `
    <a class="work-link" href="${esc(w.href)}">
      <div class="thumb">
        <img src="${esc(w.thumb)}" alt="${esc(w.title)}の画面" loading="lazy" width="960" height="540">
        <span class="ver">${esc(w.version)}</span>
      </div>
      <div class="body">
        <p class="work-en">${esc(w.en)}</p>
        <h2>${esc(w.title)}</h2>
        <p class="desc">${esc(w.description)}</p>
        <ul class="features">${(w.features || []).map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
        <p class="controls">${esc(w.controls)}</p>
        <span class="open">開く<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5L13 10l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></span>
      </div>
    </a>`;
  return li;
}

async function main() {
  try {
    const res = await fetch('./data/works.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`作品の一覧を読み込めませんでした(HTTP ${res.status})`);
    const data = await res.json();
    if (data.site) {
      $('site-title').textContent = data.site.title;
      $('site-en').textContent = data.site.en;
      $('site-lead').textContent = data.site.lead;
      document.title = data.site.title;
    }
    const list = $('works');
    list.innerHTML = '';
    for (const w of data.works) list.appendChild(card(w));
  } catch (e) {
    $('works').innerHTML = '';
    const err = $('error');
    err.textContent = `${e.message}。https のサーバーで開いているか確認してください(file:// では読み込めません)。`;
    err.hidden = false;
  }
}
main();
