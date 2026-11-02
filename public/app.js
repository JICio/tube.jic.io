// tube.jic.io：长片目录。数据是静态 JSON（/data/catalog.json 目录、/data/taxonomy.json 主题树、/data/v/<id>.json 卡片），
// 页面在浏览器里组装：/ 列表、/a/<领域>、/t/<主题>、/search?q=、/v/<视频>。
const main = document.querySelector('#main');
const side = document.querySelector('#side');
const searchForm = document.querySelector('#search');
const q = document.querySelector('#q');
const AREA_ICON = {
  software: '💻', 'systems-security': '🛡️', 'ai-data': '🤖', 'math-theory': '📐', hardware: '🔧', 'computing-history-culture': '🕹️',
  'design-graphics-media': '🎨', 'business-economics': '📈', 'politics-history-society': '🏛️', 'physics-space': '🪐', 'life-sciences-health': '🧬',
  'earth-energy-environment': '🌍', 'engineering-making': '⚙️', games: '🎮', 'arts-entertainment': '🎬', 'ideas-education': '💡',
};
const TYPE_ZH = { talk: '演讲', lecture: '讲座', course: '课程', explainer: '讲解', documentary: '纪录片', tutorial: '教程', interview: '访谈', podcast: '播客', demo: '演示', news: '新闻', commentary: '评论', comedy: '喜剧', music: '音乐', other: '其他' };
const LEVEL_ZH = { general: '通识', intro: '入门', intermediate: '进阶', advanced: '高阶' };
const PAGE = 48;
let catalog = [], taxonomy = { areas: [] }, byId = new Map(), topicName = new Map(), areaName = new Map();
const state = { area: '', topic: '', type: '', dur: '', sort: 'hn', src: '', q: '', shown: PAGE };

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const fmtDur = (s) => { if (!s) return ''; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const fmtViews = (n) => !n ? '' : n >= 1e8 ? `${(n / 1e8).toFixed(1)} 亿次` : n >= 1e4 ? `${Math.round(n / 1e4)} 万次` : `${n} 次`;
const thumb = (id, big = false) => `https://i.ytimg.com/vi/${id}/${big ? 'hqdefault' : 'mqdefault'}.jpg`;
const shardOf = (id) => { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 512; };
const tName = (id) => topicName.get(id) || id;
const aName = (id) => areaName.get(id) || id;

async function boot() {
  const [c, t] = await Promise.all([fetch('/data/catalog.json').then((r) => r.json()), fetch('/data/taxonomy.json').then((r) => r.json())]);
  catalog = c; taxonomy = t;
  for (const v of catalog) byId.set(v.id, v);
  for (const a of taxonomy.areas) { areaName.set(a.id, a.zh || a.name); for (const tp of a.topics) topicName.set(tp.id, tp.zh || tp.name); }
  renderSide();
  route();
}

// ---- 左栏：16 个领域（也给全站导航手机底栏的「本站板块」读） ----
function renderSide() {
  side.replaceChildren();
  side.setAttribute('data-jic-sections', '');
  const counts = new Map();
  for (const v of catalog) counts.set(v.a, (counts.get(v.a) || 0) + 1);
  side.append(el('div', 'head', '领域'));
  const all = el('a', '', ''); all.href = '/'; all.dataset.nav = ''; all.append(el('i', '', '🏠'), el('b', '', '全部'), el('small', '', String(catalog.length))); side.append(all);
  for (const a of taxonomy.areas) {
    const link = el('a'); link.href = `/a/${a.id}`; link.dataset.nav = ''; link.dataset.area = a.id;
    link.append(el('i', '', AREA_ICON[a.id] || '▫️'), el('b', '', a.zh || a.name), el('small', '', String(counts.get(a.id) || 0)));
    side.append(link);
  }
  markSide();
}
function markSide() {
  side.querySelectorAll('a').forEach((a) => a.classList.toggle('on', state.area ? a.dataset.area === state.area : a.getAttribute('href') === '/' && !state.q));
}

// ---- 路由 ----
function route() {
  const path = location.pathname;
  const params = new URLSearchParams(location.search);
  state.q = ''; state.area = ''; state.topic = ''; state.shown = PAGE;
  let m;
  if ((m = path.match(/^\/v\/([A-Za-z0-9_-]{11})$/))) { renderVideo(m[1]); markSide(); return; }
  if ((m = path.match(/^\/a\/([a-z0-9-]+)$/))) state.area = m[1];
  else if ((m = path.match(/^\/t\/([a-z0-9-]+)$/))) { state.topic = m[1]; state.area = taxonomy.areas.find((a) => a.topics.some((t) => t.id === m[1]))?.id || ''; }
  else if (path === '/search') state.q = params.get('q') || '';
  q.value = state.q;
  renderList();
  markSide();
}
function go(url) { history.pushState(null, '', url); route(); window.scrollTo({ top: 0, behavior: 'instant' }); }
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-nav]');
  if (!a || e.metaKey || e.ctrlKey || a.target === '_blank') return;
  e.preventDefault(); go(a.getAttribute('href'));
});
window.addEventListener('popstate', route);
window.addEventListener('jicnav:navigate', (e) => { const href = e.detail?.href || ''; if (href.startsWith('/')) { e.preventDefault(); go(href); } });
searchForm.addEventListener('submit', (e) => { e.preventDefault(); go(`/search?q=${encodeURIComponent(q.value.trim())}`); });

// ---- 列表 ----
function filtered() {
  const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
  let list = catalog.filter((v) => (!state.area || v.a === state.area) && (!state.topic || v.tp.includes(state.topic))
    && (!state.type || v.ct === state.type) && (!state.src || v.src === state.src)
    && (state.dur !== 'long' || v.d >= 1200) && (state.dur !== 'xlong' || v.d >= 3600) && (state.dur !== 'short' || (v.d > 0 && v.d < 1200))
    && (!terms.length || terms.every((w) => `${v.t} ${v.tz} ${v.c} ${v.pt} ${v.tp.map(tName).join(' ')}`.toLowerCase().includes(w))));
  const key = { hn: (v) => -v.s, views: (v) => -v.v, year: (v) => -(v.y || 0), dur: (v) => -v.d }[state.sort];
  return list.sort((x, y) => key(x) - key(y) || y.s - x.s);
}
function renderList() {
  const list = filtered();
  main.replaceChildren();
  const head = el('div', 'listhead');
  const area = taxonomy.areas.find((a) => a.id === state.area);
  const topic = area?.topics.find((t) => t.id === state.topic);
  const title = state.q ? `搜索「${state.q}」` : topic ? (topic.zh || topic.name) : area ? (area.zh || area.name) : '全部长片';
  head.append(el('h1', '', title), el('span', 'n', `${list.length} 条`));
  if (topic?.desc && !state.q) head.append(el('p', '', topic.desc));
  else if (!state.area && !state.q) head.append(el('p', '', '两个来源：Hacker News 多年反复推荐的长视频（按被推荐的月份数排，一时爆红的不算），加上官方频道免费放出的完整纪录片和讲座（按播放量排）。'));
  main.append(head);
  if (area && !state.q) {
    const chips = el('div', 'chips');
    const allChip = el('a', `chip${state.topic ? '' : ' on'}`, '全部'); allChip.href = `/a/${area.id}`; allChip.dataset.nav = ''; chips.append(allChip);
    for (const t of area.topics) { const n = catalog.filter((v) => v.tp.includes(t.id) && v.a === area.id).length; if (!n) continue; const ch = el('a', `chip${state.topic === t.id ? ' on' : ''}`, `${t.zh || t.name} ${n}`); ch.href = `/t/${t.id}`; ch.dataset.nav = ''; chips.append(ch); }
    main.append(chips);
  }
  const bar = el('div', 'toolbar');
  bar.append(select('src', [['', '全部来源'], ['hn', 'Hacker News 推荐'], ['ch', '官方频道纪录片']], state.src), select('type', [['', '全部类型'], ...Object.entries(TYPE_ZH)], state.type), select('dur', [['', '全部时长'], ['long', '20 分钟以上'], ['xlong', '1 小时以上'], ['short', '20 分钟以内']], state.dur), select('sort', [['hn', '推荐度'], ['views', '播放量'], ['year', '最新'], ['dur', '最长']], state.sort));
  main.append(bar);
  if (!list.length) { main.append(el('p', 'empty', '没有找到。换个词，或者去掉筛选。')); return; }
  const grid = el('div', 'grid');
  const draw = () => { for (const v of list.slice(grid.children.length, state.shown)) grid.append(card(v)); more.hidden = grid.children.length >= list.length; more.textContent = `再看 ${Math.min(PAGE, list.length - grid.children.length)} 条（还有 ${list.length - grid.children.length} 条）`; };
  const more = el('button', 'more'); more.type = 'button'; more.addEventListener('click', () => { state.shown += PAGE; draw(); });
  main.append(grid, more); draw();
}
function select(key, options, current) {
  const s = el('select'); s.setAttribute('aria-label', key);
  for (const [v, label] of options) { const o = el('option', '', label); o.value = v; o.selected = v === current; s.append(o); }
  s.addEventListener('change', () => { state[key] = s.value; state.shown = PAGE; renderList(); });
  return s;
}
function card(v) {
  const a = el('a', 'card'); a.href = `/v/${v.id}`; a.dataset.nav = '';
  const th = el('div', 'thumb'); const img = el('img'); img.src = thumb(v.id); img.alt = ''; img.loading = 'lazy'; th.append(img);
  if (v.d) th.append(el('span', 'dur', fmtDur(v.d)));
  if (v.rm >= 3) th.append(el('span', 'hn', `HN · ${v.rm} 个月推荐`));
  else if (v.src === 'ch') th.append(el('span', 'hn ch', '官方频道'));
  a.append(th, el('h3', '', v.tz || v.t));
  if (v.tz) a.append(el('div', 'en', v.t));
  a.append(el('div', 'meta', [v.c, fmtViews(v.v), v.y ? `${v.y} 年` : '', TYPE_ZH[v.ct] || ''].filter(Boolean).join(' · ')));
  return a;
}

// ---- 视频页 ----
async function renderVideo(id) {
  main.replaceChildren(el('p', 'loading', '正在装入…'));
  const v = await fetch(`/data/c/${shardOf(id)}.json`).then((r) => (r.ok ? r.json() : null)).then((m) => m?.[id] || null).catch(() => null);
  if (!v) { main.replaceChildren(el('p', 'empty', '没有这条视频。')); return; }
  document.title = `${v.tz || v.title} · JIC 长片`;
  const wrap = el('div', 'video');
  const crumb = el('p', 'crumb');
  const c0 = v.categories[0];
  if (c0) { const a1 = el('a', '', aName(c0.area)); a1.href = `/a/${c0.area}`; a1.dataset.nav = ''; const a2 = el('a', '', tName(c0.id)); a2.href = `/t/${c0.id}`; a2.dataset.nav = ''; crumb.append(a1, ' › ', a2); }
  const player = el('div', 'player'); player.style.backgroundImage = `url(${JSON.stringify(thumb(v.id, true))})`;
  const play = el('button', 'play'); play.type = 'button'; play.setAttribute('aria-label', '播放'); play.append(el('span', '', '▶'));
  play.addEventListener('click', () => { const f = el('iframe'); f.src = `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&playsinline=1&rel=0&modestbranding=1`; f.title = v.title; f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true; f.referrerPolicy = 'strict-origin-when-cross-origin'; player.replaceChildren(f); });
  player.append(play);
  const meta = el('div', 'meta');
  for (const t of [v.channel, fmtDur(v.duration), fmtViews(v.views), v.uploaded ? `${v.uploaded.slice(0, 4)} 年` : '', TYPE_ZH[v.type] ? `${TYPE_ZH[v.type]} · ${LEVEL_ZH[v.level] || ''}` : '']) if (t) meta.append(el('span', '', t));
  if (v.hn) meta.append(el('span', 'hnpill', `Hacker News 在 ${v.hn.rec_months} 个月里推荐过 · ${v.hn.recommenders} 人 · ${v.hn.first_year}–${v.hn.last_year}`));
  else meta.append(el('span', 'hnpill', `${v.channel} 官方上传的完整长片`));
  const desc = el('div', 'desc');
  if (v.sz || v.summary) desc.append(el('p', '', v.sz || v.summary));
  if (v.wz || v.why) { const why = el('div', 'why'); why.append(el('b', '', 'HN 为什么推荐它：'), ' ', v.wz || v.why); desc.append(why); }
  if (v.sz) { const t = el('button', 'en-toggle', '看英文原文'); t.type = 'button'; const en = el('div'); en.hidden = true; en.append(el('p', '', v.summary), el('p', '', v.why)); t.addEventListener('click', () => { en.hidden = !en.hidden; t.textContent = en.hidden ? '看英文原文' : '收起英文'; }); desc.append(t, en); }
  if (v.quote?.text) { const bq = el('blockquote', '', `“${v.quote.text}”`); const l = el('a', '', `— Hacker News 评论，${v.quote.year || ''} ↗`); l.href = `https://news.ycombinator.com/item?id=${v.quote.hn_comment_id}`; l.target = '_blank'; l.rel = 'noopener'; bq.append(l); desc.append(bq); }
  const links = el('div', 'links');
  const yt = el('a', '', '在 YouTube 打开 ↗'); yt.href = v.url; yt.target = '_blank'; yt.rel = 'noopener';
  const ht = el('a', '', v.hn ? '在 HackerTube 看 HN 怎么说 ↗' : `${v.source.name} ↗`); ht.href = v.source.url; ht.target = '_blank'; ht.rel = 'noopener';
  links.append(yt, ht);
  for (const c of v.categories) { const t = el('a', '', `# ${tName(c.id)}`); t.href = `/t/${c.id}`; t.dataset.nav = ''; links.append(t); }
  wrap.append(crumb, player, el('h1', '', v.tz || v.title));
  if (v.tz) wrap.append(el('p', 'ent', v.title));
  wrap.append(meta, desc, links);
  const rel = (v.related || []).map((r) => byId.get(r)).filter(Boolean);
  if (rel.length) { wrap.append(el('h2', '', v.hn ? 'HN 的人还推荐' : `${v.channel} 的其他长片`)); const g = el('div', 'grid'); for (const r of rel.slice(0, 8)) g.append(card(r)); wrap.append(g); }
  wrap.append(el('h2', '', '讨论'));
  const thread = el('div', 'jic-thread'); thread.dataset.site = 'tube.jic.io'; thread.dataset.id = v.id; wrap.append(thread);
  main.replaceChildren(wrap);
  if (window.JicThread?.mount) JicThread.mount(thread);
}

boot().catch(() => { main.replaceChildren(el('p', 'empty', '目录装不进来，请稍后刷新。')); });
