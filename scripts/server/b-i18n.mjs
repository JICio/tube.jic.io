// 在 u.jic.io 服务器上跑(scripts/i18n.mjs 会把它和任务文件 scp 过去):
// 用 u.jic.io 现成的翻译管线 translate.js(Gemini 轮换 → Claude → MyMemory,全网共用磁盘缓存)翻一批文本段。
// 输入 {jobs: {lang: [段...]}};输出 {lang: {段: 译文}}。只读写 argv 指定的文件,不改服务器上的任何代码。
import './local-env.js';
import { translateMany } from './translate.js';
import { readFileSync, writeFileSync } from 'node:fs';
const { jobs } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = {};
for (const [lang, segs] of Object.entries(jobs)) {
  out[lang] = {};
  for (let i = 0; i < segs.length; i += 30) {
    try { for (const [k, v] of await translateMany(segs.slice(i, i + 30), lang)) out[lang][k] = v; }
    catch (e) { console.error(lang, i, e?.message || e); }
  }
  console.error(lang, Object.keys(out[lang]).length + '/' + segs.length);
  writeFileSync(process.argv[3], JSON.stringify(out));
}
writeFileSync(process.argv[3], JSON.stringify(out));
