#!/usr/bin/env node
// b.jic.io 界面多语言:抽文案 → 缺的交给 u.jic.io 翻译管线 → 术语按 glossary 锁定 → 写回 public/locales/<lang>.json
//   node scripts/i18n.mjs            补齐所有语言并报告覆盖率
//   node scripts/i18n.mjs --check    只报告,不翻(缺条目时退出码 1)
// 文案来源:public/app.js 里的 t('…')、index.html 的 data-i18n、functions/ 里返回给用户的报错(bad('…') / error: '…')。
// 术语先于翻译:段落里的术语先替换成目标语言的固定译法再送去翻,模型会原样保留;繁体另外用 s2t 兜底。
import { readFileSync, writeFileSync, readdirSync, statSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { repair, valid } from './i18n-guard.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOC = join(ROOT, 'public/locales');
const LANGS = ['en', 'zh-Hant', 'fr', 'es', 'ja', 'ko', 'hi'];
const HOST = process.env.U_HOST || 'ubuntu@3.23.17.82';
const UDIR = '/home/ubuntu/jic-lab/u';
const CJK = /[\u4e00-\u9fff]/;
const check = process.argv.includes('--check');

const unq = (s) => s.replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');
function walk(d, acc = []) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p, acc); else if (p.endsWith('.js')) acc.push(p); } return acc; }
export function extractKeys() {
  const keys = new Set();
  const app = readFileSync(join(ROOT, 'public/app.js'), 'utf8');
  for (const m of app.matchAll(/\bt\('((?:[^'\\]|\\.)*)'\)/g)) keys.add(unq(m[1]));
  const html = readFileSync(join(ROOT, 'public/index.html'), 'utf8');
  for (const m of html.matchAll(/data-i18n(?:-html|-placeholder)?="([^"]+)"/g)) keys.add(m[1].replace(/&quot;/g, '"'));
  for (const f of walk(join(ROOT, 'functions'))) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/\bbad\('((?:[^'\\]|\\.)*)'/g)) keys.add(unq(m[1]));
    for (const m of s.matchAll(/\berror: '((?:[^'\\]|\\.)*)'/g)) keys.add(unq(m[1]));
  }
  return [...keys].filter(k => CJK.test(k));
}
// key 按 HTML 标签切段;每段只送「核心」去翻:首尾的标点、引号、属性尾巴(如 `">`)原样留在外面。
// 核心里的 LOVE / JIC / ISBN / 网址 / 域名 / 数字换成占位符 ⟦n⟧,术语换成目标语言的固定译法 —— 术语先于翻译。
const edge = (s) => { const m = String(s).match(/^([^\p{L}\p{N}\p{M}]*)([\s\S]*?)([^\p{L}\p{N}\p{M}]*)$/u); return { pre: m[1], core: m[2], post: m[3] }; };
const PROTECT = /https?:\/\/\S+|[a-z0-9-]+\.jic\.io|\bLOVE\b|\bJIC\b|\bISBN\b|\d+(?:\.\d+)?%?/g;
const glossary = JSON.parse(readFileSync(join(LOC, 'glossary.json'), 'utf8'));
const terms = Object.keys(glossary).filter(k => !k.startsWith('_') && k !== 'LOVE').sort((a, b) => b.length - a.length);
function prep(core, lang) {
  const keep = [];
  let s = core.replace(PROTECT, (m) => { keep.push(m); return '⟦' + (keep.length - 1) + '⟧'; });
  // 术语直接写成目标语言的固定译法嵌在原文里(不用占位符):模型会保留这个词,同时自己把语法接顺
  const sp = ['ja', 'ko', 'zh-Hant'].includes(lang) ? '' : ' ';
  if (lang !== 'zh-Hant') for (const k of terms) { const v = glossary[k][lang]; if (v && s.includes(k)) s = s.split(k).join(sp + v + sp).replace(/ {2,}/g, ' '); }
  s = s.trim();
  return { src: s, keep };
}
const restore = (t, keep) => { let ok = true; const out = t.replace(/⟦(\d+)⟧/g, (_, i) => keep[i] ?? (ok = false, '')); return keep.every((_, i) => t.includes('⟦' + i + '⟧')) && ok ? out : null; };
const cores = (key) => key.split(/(<[^>]+>)/).filter(p => p && !p.startsWith('<') && CJK.test(p)).map(p => edge(p).core).filter(Boolean);
function rebuild(key, lang, map) {
  let ok = true;
  const out = key.split(/(<[^>]+>)/).map(p => {
    if (!p || p.startsWith('<') || !CJK.test(p)) return p;
    const { pre, core, post } = edge(p);
    const { src, keep } = prep(core, lang);
    let t = glossary[core] && glossary[core][lang] ? glossary[core][lang] : (map[src] != null ? restore(map[src], keep) : null);
    // 术语必须留在译文里(大小写不计);模型把它吞了就不收,退回英文
    if (t && lang !== 'zh-Hant' && terms.some(k => core.includes(k) && glossary[k][lang] && !t.toLowerCase().includes(glossary[k][lang].toLowerCase()))) t = null;
    if (!t) { ok = false; return p; }
    return pre + t.trim() + post;
  }).join('');
  if (!ok) return null;
  const r = repair(key, out);
  return valid(key, r) ? r : null;
}

const keys = extractKeys();
const dicts = Object.fromEntries(LANGS.map(l => { try { return [l, JSON.parse(readFileSync(join(LOC, l + '.json'), 'utf8'))]; } catch { return [l, {}]; } }));
const missing = Object.fromEntries(LANGS.map(l => [l, keys.filter(k => !(k in dicts[l]))]));
const report = () => LANGS.map(l => `${l} ${keys.length - keys.filter(k => !(k in dicts[l])).length}/${keys.length}`).join('  ');
if (check || LANGS.every(l => !missing[l].length)) { console.log(report()); process.exit(check && LANGS.some(l => missing[l].length) ? 1 : 0); }

// 发给服务器:每种语言要翻的段(术语已锁定)
const jobs = {};
for (const l of LANGS) jobs[l] = [...new Set(missing[l].flatMap(cores).filter(c => !(glossary[c] && glossary[c][l])).map(c => prep(c, l).src))];
const tmp = mkdtempSync(join(tmpdir(), 'tube-i18n-'));
writeFileSync(join(tmp, 'job.json'), JSON.stringify({ jobs }));
const remote = `/tmp/tube-i18n-${process.pid}`;
execFileSync('ssh', [HOST, `mkdir -p ${remote}`]);
execFileSync('scp', ['-q', join(tmp, 'job.json'), join(ROOT, 'scripts/server/b-i18n.mjs'), `${HOST}:${remote}/`]);
execFileSync('ssh', [HOST, `cp ${remote}/b-i18n.mjs ${UDIR}/.b-i18n.mjs && cd ${UDIR} && node .b-i18n.mjs ${remote}/job.json ${remote}/out.json; rm -f ${UDIR}/.b-i18n.mjs`], { stdio: ['ignore', 'inherit', 'inherit'], timeout: 30 * 60 * 1000 });
execFileSync('scp', ['-q', `${HOST}:${remote}/out.json`, join(tmp, 'out.json')]);
execFileSync('ssh', [HOST, `rm -rf ${remote}`]);
const got = JSON.parse(readFileSync(join(tmp, 'out.json'), 'utf8'));
for (const l of LANGS) {
  const map = got[l] || {};
  for (const k of missing[l]) { const v = rebuild(k, l, map); if (v) dicts[l][k] = v; }
  const sorted = Object.fromEntries(Object.keys(dicts[l]).sort().map(k => [k, dicts[l][k]]));
  writeFileSync(join(LOC, l + '.json'), JSON.stringify(sorted, null, 1) + '\n');
}
console.log(report());
