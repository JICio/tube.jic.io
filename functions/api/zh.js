// POST /api/zh —— 批量把英文卡片译成中文（Workers AI）。只给本地构建脚本用：要带 X-Admin，和 ZH_ADMIN（.dev.vars）一致。
// body: { items: [{ id, title, summary, why }] }（≤ 20 条）→ { items: [{ id, tz, sz, wz }] }
const MODEL = '@cf/openai/gpt-oss-120b';
const FALLBACK = '@cf/qwen/qwen3-30b-a3b-fp8';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.ZH_ADMIN || request.headers.get('X-Admin') !== env.ZH_ADMIN) return Response.json({ error: 'forbidden' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items.slice(0, 20) : [];
  if (!items.length) return Response.json({ error: 'items required' }, { status: 400 });
  const prompt = `你是 JIC 的编辑。把下面每条 YouTube 视频卡片译成简体中文，给中国读者看。
规则：标题译得自然、短，专有名词（人名、产品名、会议名）保留英文或用通行译名；summary 译成 2 到 3 句说明；why 译成 1 句，说清"为什么 Hacker News 的人反复推荐它"。
不加解释，不加引号。只输出 JSON 数组，每项 {"id":"…","tz":"中文标题","sz":"中文摘要","wz":"为何值得看"}。
输入：
${JSON.stringify(items)}`;
  const run = async (model) => {
    const r = await env.AI.run(model, { messages: [{ role: 'user', content: prompt }], max_tokens: 6000, temperature: 0.2 });
    const text = typeof r === 'string' ? r : (r.response ?? r.output_text ?? r.choices?.[0]?.message?.content ?? JSON.stringify(r));
    const m = String(text).match(/\[[\s\S]*\]/);
    if (!m) throw new Error('no json');
    const out = JSON.parse(m[0]);
    if (!Array.isArray(out)) throw new Error('not array');
    return out.filter((x) => x && x.id && (x.tz || x.sz));
  };
  try {
    let out;
    try { out = await run(MODEL); } catch { out = await run(FALLBACK); }
    return Response.json({ items: out });
  } catch (error) {
    return Response.json({ error: String(error?.message || error) }, { status: 502 });
  }
}
