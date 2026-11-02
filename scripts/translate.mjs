#!/usr/bin/env node
// 批量翻译：读 HackerTube 卡片，分批 POST 本地 dev 服务的 /api/zh（Workers AI），译文写到 data/zh/<id>.json。可重复跑，已译的跳过。
//   ZH_ADMIN=xxx node scripts/translate.mjs <hackertube-data 目录> [起点 0] [条数]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [,, DATA = '../scratch/hackertube-data', START = '0', COUNT = '999999'] = process.argv;
const ZH = new URL('../data/zh/', import.meta.url).pathname;
mkdirSync(ZH, { recursive: true });
const API = process.env.ZH_API || 'http://127.0.0.1:8791/api/zh';
const ADMIN = process.env.ZH_ADMIN || '';
if (!ADMIN) { console.error('缺 ZH_ADMIN'); process.exit(1); }

const videos = readFileSync(join(DATA, 'videos.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  .slice(Number(START), Number(START) + Number(COUNT));
const todo = videos.filter((v) => !existsSync(join(ZH, `${v.vid}.json`)));
console.log(`待译 ${todo.length} / ${videos.length}`);

// 主题树的中文名只译一次
const taxFile = join(ZH, '_taxonomy.json');
if (!existsSync(taxFile)) {
  const tax = JSON.parse(readFileSync(join(DATA, 'taxonomy.json'), 'utf8'));
  const names = [];
  for (const a of tax.areas) { names.push({ id: a.id, title: a.name, summary: '', why: '' }); for (const c of a.categories) names.push({ id: c.id, title: c.name, summary: c.description.slice(0, 160), why: '' }); }
  const out = {};
  for (let i = 0; i < names.length; i += 20) {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin': ADMIN }, body: JSON.stringify({ items: names.slice(i, i + 20) }) }).then((x) => x.json());
    for (const it of r.items || []) out[it.id] = it.tz;
  }
  writeFileSync(taxFile, JSON.stringify(out, null, 1));
  console.log(`主题树译完 ${Object.keys(out).length}`);
}

let ok = 0, fail = 0;
for (let i = 0; i < todo.length; i += 15) {
  const batch = todo.slice(i, i + 15).map((v) => ({ id: v.vid, title: v.title, summary: v.summary, why: v.why_hn }));
  let r = null;
  for (let attempt = 0; attempt < 3 && !r?.items; attempt++) {
    r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin': ADMIN }, body: JSON.stringify({ items: batch }) }).then((x) => x.json()).catch(() => null);
    if (!r?.items) await new Promise((res) => setTimeout(res, 3000));
  }
  for (const it of r?.items || []) { writeFileSync(join(ZH, `${it.id}.json`), JSON.stringify({ tz: it.tz || '', sz: it.sz || '', wz: it.wz || '' })); ok++; }
  fail += batch.length - (r?.items?.length || 0);
  if ((i / 15) % 10 === 0) console.log(`进度 ${Math.min(i + 15, todo.length)}/${todo.length} ok ${ok} fail ${fail}`);
}
console.log(`完成 ok ${ok} fail ${fail}`);
