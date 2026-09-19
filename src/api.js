// 极简 API 客户端：永不抛出网络异常，调用方按 status 分支处理
async function request(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...opts,
  });
  let body = null;
  try { body = await res.json(); } catch { /* 非 JSON 响应 */ }
  return { status: res.status, body };
}

export const api = {
  catalog: () => request('/api/catalog'),
  timeline: (id) => request(`/api/timelines/${encodeURIComponent(id)}`),
  versions: (id) => request(`/api/timelines/${encodeURIComponent(id)}/versions`),
  serverPreview: (id) => request(`/api/timelines/${encodeURIComponent(id)}/preview`),
  save: (id, payload) => request(`/api/timelines/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) }),
};

export function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
