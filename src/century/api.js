// 思想年代 · API 客户端
// 所有时间裁决都发生在服务端；本地只缓存目录（只读典册）与离线快照。

const API_PREFIX = '/api';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `http_${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request(path, options = {}) {
  const res = await fetch(`${API_PREFIX}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...options,
    ...(options.body ? { body: typeof options.body === 'string' ? options.body : JSON.stringify(options.body) } : {}),
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(res.status, body);
  return body;
}

export const api = {
  catalog: () => request('/catalog'),
  validateState: (state) => request('/validate', { method: 'POST', body: { state } }),
  preview: (state, version, versionId, { fail = false } = {}) =>
    request(`/preview${fail ? '?fail=1' : ''}`, { method: 'POST', body: { state, version, versionId } }),

  createGallery: (title, seedOps) => request('/galleries', { method: 'POST', body: { title, seedOps } }),
  getGallery: (id) => request(`/galleries/${id}`),
  getVersion: (id, version) => request(`/galleries/${id}/versions/${version}`),
  commit: (id, payload) => request(`/galleries/${id}/commit`, { method: 'POST', body: payload }),
  merge: (id, payload) => request(`/galleries/${id}/merge`, { method: 'POST', body: payload }),
  galleryPreview: (id, state) => request(`/galleries/${id}/preview`, { method: 'POST', body: { state } }),
};

export async function waitForServer(maxMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`${API_PREFIX}/catalog`, { cache: 'no-store' });
      if (res.ok) return true;
    } catch { /* 离线中 */ }
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}
