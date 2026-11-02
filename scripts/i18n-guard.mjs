// 译文守门:界面文案里夹着 HTML 片段和属性尾巴(比如 `">登录</a>`),机器翻译常把引号吃掉、把标签转义、把 LOVE 译成「爱」。
// 这里做两件事:repair —— 能机械修的修(补回首尾的标点/引号、反转义);valid —— 结构不一致的一律不收(退回英文/简繁转换)。
const ENT = { '&quot;': '"', '&gt;': '>', '&lt;': '<', '&amp;': '&', '&#39;': "'" };
const skeleton = (s) => (String(s).match(/<[^>]+>|"|⟦\d+⟧|\bLOVE\b|\bJIC\b|\bISBN\b|https?:\/\/\S+|[a-z0-9-]+\.jic\.io|\d+(?:\.\d+)?%?|\{\d+\}/g) || []);
const edge = (s) => { const m = String(s).match(/^([^\p{L}\p{N}\p{M}]*)([\s\S]*?)([^\p{L}\p{N}\p{M}]*)$/u); return { pre: m[1], core: m[2], post: m[3] }; };

export function repair(key, val) {
  let v = String(val);
  if (!/&(quot|gt|lt|amp|#39);/.test(key)) v = v.replace(/&(quot|gt|lt|amp|#39);/g, (e) => ENT[e]);
  // 按标签切开逐段对齐首尾标点
  const kp = key.split(/(<[^>]+>)/), vp = v.split(/(<[^>]+>)/);
  if (kp.length !== vp.length) return v;
  return kp.map((k, i) => {
    if (k.startsWith('<')) return vp[i];
    const a = edge(k), b = edge(vp[i]);
    if (!a.core) return k;
    return a.pre + b.core + a.post;
  }).join('');
}

export function valid(key, val) {
  if (!val || typeof val !== 'string') return false;
  const a = skeleton(key), b = skeleton(val);
  if (a.length !== b.length || a.some((x, i) => x !== b[i])) return false;
  return true;
}
