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
mkdirSync(join(OUT, 'v'), { recursive: true });

const lines = (f) => readFileSync(join(DATA, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const videos = lines('videos.jsonl');
const related = Object.fromEntries(lines('related.jsonl').map((r) => [r.vid, r.related.map((x) => x.vid)]));
const taxonomy = JSON.parse(readFileSync(join(DATA, 'taxonomy.json'), 'utf8'));
const meta = {};
if (existsSync(META)) for (const f of readdirSync(META)) if (f.endsWith('.json')) { try { const m = JSON.parse(readFileSync(join(META, f), 'utf8')); meta[m.id] = m; } catch {} }
const zh = {};
if (existsSync(ZH)) for (const f of readdirSync(ZH)) if (f.endsWith('.json')) { try { zh[f.slice(0, -5)] = JSON.parse(readFileSync(join(ZH, f), 'utf8')); } catch {} }
const taxZh = existsSync(join(ZH, '_taxonomy.json')) ? JSON.parse(readFileSync(join(ZH, '_taxonomy.json'), 'utf8')) : {};

// 领域 / 主题
const areas = taxonomy.areas.map((a) => ({
  id: a.id, name: a.name, zh: taxZh[a.id] || '',
  topics: a.categories.map((c) => ({ id: c.id, name: c.name, zh: taxZh[c.id] || '', desc: c.description })),
}));
writeFileSync(join(OUT, 'taxonomy.json'), JSON.stringify({ areas }));

const catalog = [];
let withMeta = 0, withZh = 0;
for (const v of videos) {
  const m = meta[v.vid] || {};
  const z = zh[v.vid] || {};
  if (m.duration) withMeta++;
  if (z.sz) withZh++;
  const year = m.upload_date ? Number(String(m.upload_date).slice(0, 4)) : null;
  catalog.push({
    id: v.vid, t: v.title, tz: z.tz || '', c: v.channel, d: m.duration || 0, v: m.view_count || 0, y: year,
    s: v.score, ct: v.content_type, lv: v.level, sl: v.shelf_life,
    a: v.categories[0]?.area || '', tp: v.categories.map((c) => c.id), pt: v.primary_topic || '',
    hy: v.hn.first_year, rm: v.hn.rec_months,
  });
  writeFileSync(join(OUT, 'v', `${v.vid}.json`), JSON.stringify({
    id: v.vid, url: v.url, title: v.title, tz: z.tz || '', channel: v.channel, channelId: m.channel_id || '',
    duration: m.duration || 0, views: m.view_count || 0, likes: m.like_count || 0, uploaded: m.upload_date || '', lang: m.language || '',
    summary: v.summary, sz: z.sz || '', why: v.why_hn, wz: z.wz || '',
    type: v.content_type, level: v.level, shelf: v.shelf_life, topic: v.primary_topic, tags: v.tags,
    categories: v.categories, quote: v.quote, hn: v.hn, score: v.score,
    related: (related[v.vid] || []).slice(0, 12),
    source: { name: 'HackerTube', url: `https://hackertube.org/video/${v.vid}` },
  }));
}
writeFileSync(join(OUT, 'catalog.json'), JSON.stringify(catalog));
writeFileSync(join(OUT, 'stats.json'), JSON.stringify({ videos: catalog.length, withMeta, withZh, built: new Date().toISOString() }));
console.log(`catalog ${catalog.length} · 有时长 ${withMeta} · 有译文 ${withZh}`);
