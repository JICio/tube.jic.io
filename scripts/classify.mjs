#!/usr/bin/env node
// 官方频道视频：译标题 + 归主题。读 data/channels.jsonl，POST 本地 /api/zh（mode=classify），写 data/zh/<id>.json {tz, topic}。已做的跳过。
//   ZH_ADMIN=xxx node scripts/classify.mjs [某个.jsonl，默认 data/channels.jsonl] [起点 0] [条数]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
const SRC = args[0] && args[0].endsWith('.jsonl') ? args.shift() : new URL('../data/channels.jsonl', import.meta.url).pathname;
const [START = '0', COUNT = '999999'] = args;
const ZH = new URL('../data/zh/', import.meta.url).pathname;
mkdirSync(ZH, { recursive: true });
const API = process.env.ZH_API || 'http://127.0.0.1:8791/api/zh';
const ADMIN = process.env.ZH_ADMIN || '';
if (!ADMIN) { console.error('缺 ZH_ADMIN'); process.exit(1); }
const rows = readFileSync(SRC, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  .slice(Number(START), Number(START) + Number(COUNT));
const todo = rows.filter((v) => !existsSync(join(ZH, `${v.id}.json`)));
console.log(`待归类 ${todo.length} / ${rows.length}`);
let ok = 0, fail = 0;
for (let i = 0; i < todo.length; i += 20) {
  const batch = todo.slice(i, i + 20).map((v) => ({ id: v.id, title: v.title, channel: v.channel }));
  let r = null;
  for (let attempt = 0; attempt < 3 && !r?.items; attempt++) {
    r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin': ADMIN }, body: JSON.stringify({ mode: 'classify', items: batch }) }).then((x) => x.json()).catch(() => null);
    if (!r?.items) await new Promise((res) => setTimeout(res, 3000));
  }
  for (const it of r?.items || []) { writeFileSync(join(ZH, `${it.id}.json`), JSON.stringify({ tz: it.tz || '', topic: it.topic || '' })); ok++; }
  fail += batch.length - (r?.items?.length || 0);
  if ((i / 20) % 10 === 0) console.log(`进度 ${Math.min(i + 20, todo.length)}/${todo.length} ok ${ok} fail ${fail}`);
}
console.log(`完成 ok ${ok} fail ${fail}`);
