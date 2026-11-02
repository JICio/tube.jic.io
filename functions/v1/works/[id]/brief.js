// GET /v1/works/<id>/brief —— f.jic.io 论坛建讨论串时回查（作品接论坛规格 v0.2）。
// tube 的条目是精选目录，没有作者、不走 24 小时规则：owner 为 null，live 永远 true。
export async function onRequestGet(context) {
  const id = String(context.params.id || '');
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' };
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers });
  let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const res = await context.env.ASSETS.fetch(new URL(`/data/c/${h % 512}.json`, context.request.url));
  const v = res.ok ? (await res.json())[id] : null;
  if (!v) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers });
  const createdAt = /^\d{8}$/.test(v.uploaded) ? `${v.uploaded.slice(0, 4)}-${v.uploaded.slice(4, 6)}-${v.uploaded.slice(6, 8)}T00:00:00Z` : null;
  return new Response(JSON.stringify({
    id: v.id, title: v.tz || v.title, url: `https://tube.jic.io/v/${v.id}`, owner: null, live: true, createdAt,
    thumb: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
  }), { headers });
}
