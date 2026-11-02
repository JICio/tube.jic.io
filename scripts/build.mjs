#!/usr/bin/env node
// 把 HackerTube 数据包 + yt-dlp 元数据 + 中文译文 → 站点用的静态 JSON。可重复跑。
//   node scripts/build.mjs <hackertube-data 目录> <meta 目录>
// 产出：
//   public/data/catalog.json   目录用的紧凑列表（每条约 200 字节）
//   public/data/taxonomy.json  16 个领域 / 150 个主题（含中文名，有的话）
//   public/data/v/<id>.json    每条视频的完整卡片（摘要、为何值得看、HN 原话、相关视频、元数据）
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const [,, DATA = '../scratch/hackertube-data', META = '../scratch/meta'] = process.argv;
const OUT = new URL('../public/data/', import.meta.url).pathname;
const ZH = new URL('../data/zh/', import.meta.url).pathname;   // 译文：data/zh/<id>.json {tz,sz,wz}
mkdirSync(join(OUT, 'c'), { recursive: true });
// 卡片按 id 哈希分 512 片：public/data/c/<n>.json = { id: card }。不用 id 前缀，因为 macOS 文件系统不分大小写，Nc 和 NC 会撞。
const shards = {};
const shardOf = (id) => { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 512; };
const putCard = (card) => { (shards[shardOf(card.id)] ||= {})[card.id] = card; };

const lines = (f) => readFileSync(join(DATA, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const videos = lines('videos.jsonl');
const related = Object.fromEntries(lines('related.jsonl').map((r) => [r.vid, r.related.map((x) => x.vid)]));
const taxonomy = JSON.parse(readFileSync(join(DATA, 'taxonomy.json'), 'utf8'));
const meta = {};
if (existsSync(META)) for (const f of readdirSync(META)) if (f.endsWith('.json')) { try { const m = JSON.parse(readFileSync(join(META, f), 'utf8')); meta[m.id] = m; } catch {} }
const zh = {};
if (existsSync(ZH)) for (const f of readdirSync(ZH)) if (f.endsWith('.json')) { try { zh[f.slice(0, -5)] = JSON.parse(readFileSync(join(ZH, f), 'utf8')); } catch {} }
const CH = new URL('../data/channels.jsonl', import.meta.url).pathname;   // 官方频道长片：{id,title,channel,handle,duration,views,kind}
const channels = existsSync(CH) ? readFileSync(CH, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const taxZh = existsSync(join(ZH, '_taxonomy.json')) ? JSON.parse(readFileSync(join(ZH, '_taxonomy.json'), 'utf8')) : {};

// 领域 / 主题
const areas = taxonomy.areas.map((a) => ({
  id: a.id, name: a.name, zh: taxZh[a.id] || '',
  topics: a.categories.map((c) => ({ id: c.id, name: c.name, zh: taxZh[c.id] || '', desc: c.description })),
}));
writeFileSync(join(OUT, 'taxonomy.json'), JSON.stringify({ areas }));
const topicArea = Object.fromEntries(areas.flatMap((a) => a.topics.map((t) => [t.id, a.id])));

const catalog = [];
let withMeta = 0, withZh = 0;
for (const v of videos) {
  const m = meta[v.vid] || {};
  const z = {};
  if (m.duration) withMeta++;
  const year = m.upload_date ? Number(String(m.upload_date).slice(0, 4)) : null;
  catalog.push({
    id: v.vid, t: v.title, tz: z.tz || '', c: v.channel, d: m.duration || 0, v: m.view_count || 0, y: year,
    s: v.score, ct: v.content_type, lv: v.level, sl: v.shelf_life,
    a: v.categories[0]?.area || '', tp: v.categories.map((c) => c.id), pt: v.primary_topic || '',
    hy: v.hn.first_year, rm: v.hn.rec_months, src: 'hn',
  });
  putCard({
    id: v.vid, src: 'hn', url: v.url, title: v.title, tz: z.tz || '', channel: v.channel, channelId: m.channel_id || '',
    duration: m.duration || 0, views: m.view_count || 0, likes: m.like_count || 0, uploaded: m.upload_date || '', lang: m.language || '',
    summary: v.summary, sz: z.sz || '', why: v.why_hn, wz: z.wz || '',
    type: v.content_type, level: v.level, shelf: v.shelf_life, topic: v.primary_topic, tags: v.tags,
    categories: v.categories, quote: v.quote, hn: v.hn, score: v.score,
    related: (related[v.vid] || []).slice(0, 12),
    source: { name: 'HackerTube', url: `https://hackertube.org/video/${v.vid}` },
  });
}

// 官方频道长片：HackerTube 里已有的跳过；主题来自 data/zh/<id>.json 的 topic（Workers AI 归类）
const hnIds = new Set(videos.map((v) => v.vid));
const byChannel = {};
for (const c of channels) if (!hnIds.has(c.id)) (byChannel[c.handle] ||= []).push(c);
let chCount = 0, chZh = 0;
for (const list of Object.values(byChannel)) {
  list.sort((x, y) => y.views - x.views);
  for (const c of list) {
    const z = zh[c.id] || {};
    const topic = topicArea[z.topic] ? z.topic : '';
    const area = topicArea[topic] || '';
    const score = Math.round(Math.log10(c.views + 1) * 15) / 10;   // 100 万播放 ≈ 9，和 HN 分数同量级
    chCount++;
    catalog.push({ id: c.id, t: c.title, tz: z.tz || '', c: c.channel, d: c.duration, v: c.views, y: null, s: score, ct: c.kind, lv: 'general', sl: 'evergreen', a: area, tp: topic ? [topic] : [], pt: '', hy: null, rm: 0, src: 'ch' });
    putCard({
      id: c.id, src: 'ch', url: `https://www.youtube.com/watch?v=${c.id}`, title: c.title, tz: z.tz || '', channel: c.channel, channelId: '',
      duration: c.duration, views: c.views, likes: 0, uploaded: '', lang: '',
      summary: '', sz: '', why: '', wz: '', type: c.kind, level: 'general', shelf: 'evergreen', topic: '', tags: [],
      categories: topic ? [{ id: topic, area }] : [], quote: null, hn: null, score,
      related: list.filter((o) => o.id !== c.id).slice(0, 12).map((o) => o.id),
      source: { name: `${c.channel} 官方频道`, url: `https://www.youtube.com/@${c.handle}/videos` },
    });
  }
}
for (const [k, m] of Object.entries(shards)) writeFileSync(join(OUT, 'c', `${k}.json`), JSON.stringify(m));
writeFileSync(join(OUT, 'catalog.json'), JSON.stringify(catalog));
writeFileSync(join(OUT, 'stats.json'), JSON.stringify({ videos: catalog.length, hackertube: videos.length, channels: chCount, withMeta, withZh: withZh + chZh, built: new Date().toISOString() }));
console.log(`catalog ${catalog.length} · HackerTube ${videos.length}（有时长 ${withMeta}，有译文 ${withZh}）· 官方频道 ${chCount}（有译文 ${chZh}）`);
