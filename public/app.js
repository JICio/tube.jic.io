// tube.jic.io：长片目录。数据是静态 JSON（/data/catalog.json 目录、/data/taxonomy.json 主题树、/data/c/<分片>.json 卡片），
// 页面在浏览器里组装：/ 列表、/a/<领域>、/t/<主题>、/search?q=、/v/<视频>。
// 界面文案以简体中文为键，t('…') 查当前语言（/i18n.js，和 b.jic.io 同一套 8 种语言）。视频标题、摘要是英文原文，不翻。
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
// 下面这些类型 / 难度名在代码里经变量传给 t()，抽文案的脚本看不到，列在这里给 scripts/i18n.mjs 抽：
// t('演讲') t('讲座') t('课程') t('讲解') t('纪录片') t('教程') t('访谈') t('播客') t('演示') t('新闻') t('评论') t('喜剧') t('音乐') t('其他') t('通识') t('入门') t('进阶') t('高阶')
const PAGE = 48;
let catalog = [], taxonomy = { areas: [] }, byId = new Map(), topicById = new Map(), areaById = new Map();
const state = { area: '', topic: '', type: '', dur: '', sort: 'hn', src: '', q: '', shown: PAGE };

const lang = () => (window.JIC_I18N?.lang || 'en');
const isZh = () => lang().startsWith('zh');
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const fill = (s, ...args) => args.reduce((acc, a, i) => acc.split(`{${i}}`).join(String(a)), s);
const fmtDur = (s) => { if (!s) return ''; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const fmtViews = (n) => {
  if (!n) return '';
  if (isZh()) return n >= 1e8 ? fill(t('{0} 亿次播放'), (n / 1e8).toFixed(1)) : n >= 1e4 ? fill(t('{0} 万次播放'), Math.round(n / 1e4)) : fill(t('{0} 次播放'), n);
  let num; try { num = new Intl.NumberFormat(lang(), { notation: 'compact', maximumFractionDigits: 1 }).format(n); } catch { num = String(n); }
  return fill(t('{0} 次播放'), num);
};
const thumb = (id, big = false) => `https://i.ytimg.com/vi/${id}/${big ? 'hqdefault' : 'mqdefault'}.jpg`;
// 领域 / 主题名：中文界面用中文名（繁体由 t() 转），其他语言用英文原名
const L = (o) => (o ? (isZh() && o.zh ? t(o.zh) : o.name) : '');
const tName = (id) => L(topicById.get(id)) || id;
const aName = (id) => L(areaById.get(id)) || id;
const shardOf = (id) => { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 512; };

async function boot() {
  const [c, tx] = await Promise.all([fetch('/data/catalog.json').then((r) => r.json()), fetch('/data/taxonomy.json').then((r) => r.json()), window.JIC_I18N?.ready]);
  catalog = c; taxonomy = tx;
  for (const v of catalog) byId.set(v.id, v);
  for (const a of taxonomy.areas) { areaById.set(a.id, a); for (const tp of a.topics) topicById.set(tp.id, tp); }
  renderSide();
  route();
  window.addEventListener('jic:lang', () => { renderSide(); route(); });
}

// ---- 左栏：16 个领域（也给全站导航手机底栏的「本站板块」读） ----
function renderSide() {
  side.replaceChildren();
  side.setAttribute('data-jic-sections', '');
  const counts = new Map();
  for (const v of catalog) counts.set(v.a, (counts.get(v.a) || 0) + 1);
  side.append(el('div', 'head', t('领域')));
  const all = el('a', '', ''); all.href = '/'; all.dataset.nav = ''; all.append(el('i', '', '🏠'), el('b', '', t('全部')), el('small', '', String(catalog.length))); side.append(all);
  for (const a of taxonomy.areas) {
    const link = el('a'); link.href = `/a/${a.id}`; link.dataset.nav = ''; link.dataset.area = a.id;
    link.append(el('i', '', AREA_ICON[a.id] || '▫️'), el('b', '', L(a)), el('small', '', String(counts.get(a.id) || 0)));
    side.append(link);
  }
  markSide();
}
function markSide() {
  side.querySelectorAll('a').forEach((a) => a.classList.toggle('on', state.area ? a.dataset.area === state.area : a.getAttribute('href') === '/' && !state.q));
  // 手机：左栏是横向一排，把当前领域滚到可见处
  const on = side.querySelector('a.on'); if (on && side.scrollWidth > side.clientWidth) side.scrollLeft = on.offsetLeft - (side.clientWidth - on.offsetWidth) / 2;
}

// ---- 路由 ----
function route() {
  const path = location.pathname;
  const params = new URLSearchParams(location.search);
  state.q = ''; state.area = ''; state.topic = ''; state.shown = PAGE;
  let m;
  if ((m = path.match(/^\/v\/([A-Za-z0-9_-]{11})$/))) { renderVideo(m[1]); markSide(); return; }
  if ((m = path.match(/^\/a\/([a-z0-9-]+)$/))) state.area = m[1];
  else if ((m = path.match(/^\/t\/([a-z0-9-]+)$/))) { state.topic = m[1]; state.area = taxonomy.areas.find((a) => a.topics.some((tp) => tp.id === m[1]))?.id || ''; }
  else if (path === '/search') state.q = params.get('q') || '';
  q.value = state.q;
  document.title = `${t('JIC 长片')} · tube.jic.io`;
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
searchForm.addEventListener('submit', (e) => { e.preventDefault(); q.blur(); go(`/search?q=${encodeURIComponent(q.value.trim())}`); });

// ---- 列表 ----
function filtered() {
  const terms = state.q.toLowerCase().split(/\s+/).filter(Boolean);
  let list = catalog.filter((v) => (!state.area || v.a === state.area) && (!state.topic || v.tp.includes(state.topic))
    && (!state.type || v.ct === state.type) && (!state.src || v.src === state.src)
    && (state.dur !== 'long' || v.d >= 1200) && (state.dur !== 'xlong' || v.d >= 3600) && (state.dur !== 'short' || (v.d > 0 && v.d < 1200))
    && (!terms.length || terms.every((w) => `${v.t} ${v.c} ${v.pt} ${v.tp.map((id) => `${id} ${tName(id)}`).join(' ')}`.toLowerCase().includes(w))));
  const key = { hn: (v) => -v.s, views: (v) => -v.v, year: (v) => -(v.y || 0), dur: (v) => -v.d }[state.sort];
  return list.sort((x, y) => key(x) - key(y) || y.s - x.s);
}
function renderList() {
  const list = filtered();
  main.replaceChildren();
  const head = el('div', 'listhead');
  const area = areaById.get(state.area);
  const topic = topicById.get(state.topic);
  const title = state.q ? fill(t('搜索「{0}」'), state.q) : topic ? L(topic) : area ? L(area) : t('全部长片');
  head.append(el('h1', '', title), el('span', 'n', fill(t('{0} 条'), list.length.toLocaleString(lang()))));
  if (topic?.desc && !state.q) head.append(el('p', '', topic.desc));
  else if (!state.area && !state.q) head.append(el('p', '', t('两个来源：Hacker News 多年反复推荐的长视频（按被推荐的月份数排，一时爆红的不算），加上官方频道免费放出的完整纪录片和讲座（按播放量排）。')));
  main.append(head);
  if (area && !state.q) {
    const chips = el('div', 'chips');
    const allChip = el('a', `chip${state.topic ? '' : ' on'}`, t('全部')); allChip.href = `/a/${area.id}`; allChip.dataset.nav = ''; chips.append(allChip);
    for (const tp of area.topics) { const n = catalog.filter((v) => v.tp.includes(tp.id) && v.a === area.id).length; if (!n) continue; const ch = el('a', `chip${state.topic === tp.id ? ' on' : ''}`, `${L(tp)} ${n}`); ch.href = `/t/${tp.id}`; ch.dataset.nav = ''; chips.append(ch); }
    main.append(chips);
    const on = chips.querySelector('.chip.on'); if (on) requestAnimationFrame(() => { if (chips.scrollWidth > chips.clientWidth) chips.scrollLeft = on.offsetLeft - (chips.clientWidth - on.offsetWidth) / 2; });
  }
  const bar = el('div', 'toolbar');
  bar.append(
    select('src', [['', t('全部来源')], ['hn', t('Hacker News 推荐')], ['ch', t('官方频道纪录片')]], state.src),
    select('type', [['', t('全部类型')], ...Object.entries(TYPE_ZH).map(([k, v]) => [k, t(v)])], state.type),
    select('dur', [['', t('全部时长')], ['long', t('20 分钟以上')], ['xlong', t('1 小时以上')], ['short', t('20 分钟以内')]], state.dur),
    select('sort', [['hn', t('推荐度')], ['views', t('播放量')], ['year', t('最新')], ['dur', t('最长')]], state.sort),
  );
  main.append(bar);
  if (!list.length) { main.append(el('p', 'empty', t('没有找到。换个词，或者去掉筛选。'))); return; }
  const grid = el('div', 'grid');
  const draw = () => { for (const v of list.slice(grid.children.length, state.shown)) grid.append(card(v)); more.hidden = grid.children.length >= list.length; more.textContent = fill(t('再看 {0} 条（还有 {1} 条）'), Math.min(PAGE, list.length - grid.children.length), list.length - grid.children.length); };
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
  if (v.rm >= 3) th.append(el('span', 'hn', fill(t('HN · {0} 个月推荐'), v.rm)));
  else if (v.src === 'ch') th.append(el('span', 'hn ch', t('官方频道')));
  a.append(th, el('h3', '', v.t));
  a.append(el('div', 'meta', [v.c, fmtViews(v.v), v.y ? fill(t('{0} 年'), v.y) : '', TYPE_ZH[v.ct] ? t(TYPE_ZH[v.ct]) : ''].filter(Boolean).join(' · ')));
  return a;
}

// ---- 视频页 ----
async function renderVideo(id) {
  main.replaceChildren(el('p', 'loading', t('正在装入…')));
  const v = await fetch(`/data/c/${shardOf(id)}.json`).then((r) => (r.ok ? r.json() : null)).then((m) => m?.[id] || null).catch(() => null);
  if (!v) { main.replaceChildren(el('p', 'empty', t('没有这条视频。'))); return; }
  document.title = `${v.title} · ${t('JIC 长片')}`;
  const wrap = el('div', 'video');
  const crumb = el('p', 'crumb');
  const c0 = v.categories[0];
  if (c0) { const a1 = el('a', '', aName(c0.area)); a1.href = `/a/${c0.area}`; a1.dataset.nav = ''; const a2 = el('a', '', tName(c0.id)); a2.href = `/t/${c0.id}`; a2.dataset.nav = ''; crumb.append(a1, ' › ', a2); }
  const player = el('div', 'player'); player.style.backgroundImage = `url(${JSON.stringify(thumb(v.id, true))})`;
  const play = el('button', 'play'); play.type = 'button'; play.setAttribute('aria-label', t('播放')); play.append(el('span', '', '▶'));
  play.addEventListener('click', () => { const f = el('iframe'); f.src = `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&playsinline=1&rel=0&modestbranding=1`; f.title = v.title; f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true; f.referrerPolicy = 'strict-origin-when-cross-origin'; player.replaceChildren(f); });
  player.append(play);
  const meta = el('div', 'meta');
  for (const s of [v.channel, fmtDur(v.duration), fmtViews(v.views), v.uploaded ? fill(t('{0} 年'), v.uploaded.slice(0, 4)) : '', TYPE_ZH[v.type] ? `${t(TYPE_ZH[v.type])} · ${t(LEVEL_ZH[v.level] || '通识')}` : '']) if (s) meta.append(el('span', '', s));
  if (v.hn) meta.append(el('span', 'hnpill', fill(t('Hacker News 在 {0} 个月里推荐过 · {1} 人 · {2}–{3}'), v.hn.rec_months, v.hn.recommenders, v.hn.first_year, v.hn.last_year)));
  else meta.append(el('span', 'hnpill', fill(t('{0} 官方上传的完整长片'), v.channel)));
  const desc = el('div', 'desc');
  if (v.summary) desc.append(el('p', '', v.summary));
  if (v.why) { const why = el('div', 'why'); why.append(el('b', '', t('HN 为什么推荐它：')), ' ', v.why); desc.append(why); }
  if (v.quote?.text) { const bq = el('blockquote', '', `“${v.quote.text}”`); const l = el('a', '', `— ${fill(t('Hacker News 评论，{0}'), v.quote.year || '')} ↗`); l.href = `https://news.ycombinator.com/item?id=${v.quote.hn_comment_id}`; l.target = '_blank'; l.rel = 'noopener'; bq.append(l); desc.append(bq); }
  const links = el('div', 'links');
  const yt = el('a', '', `${t('在 YouTube 打开')} ↗`); yt.href = v.url; yt.target = '_blank'; yt.rel = 'noopener';
  const ht = el('a', '', `${v.hn ? t('在 HackerTube 看 HN 怎么说') : fill(t('{0} 官方频道'), v.channel)} ↗`); ht.href = v.source.url; ht.target = '_blank'; ht.rel = 'noopener';
  links.append(yt, ht);
  for (const c of v.categories) { const tp = el('a', '', `# ${tName(c.id)}`); tp.href = `/t/${c.id}`; tp.dataset.nav = ''; links.append(tp); }
  wrap.append(crumb, player, el('h1', '', v.title), meta, desc, links);
  const rel = (v.related || []).map((r) => byId.get(r)).filter(Boolean);
  if (rel.length) { wrap.append(el('h2', '', v.hn ? t('HN 的人还推荐') : fill(t('{0} 的其他长片'), v.channel))); const g = el('div', 'grid'); for (const r of rel.slice(0, 8)) g.append(card(r)); wrap.append(g); }
  wrap.append(el('h2', '', t('讨论')));
  const thread = el('div', 'jic-thread'); thread.dataset.site = 'tube.jic.io'; thread.dataset.id = v.id; wrap.append(thread);
  main.replaceChildren(wrap);
  if (window.JicThread?.mount) JicThread.mount(thread);
}

boot().catch(() => { main.replaceChildren(el('p', 'empty', t('目录装不进来，请稍后刷新。'))); });
