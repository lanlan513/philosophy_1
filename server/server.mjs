// 我的思想年代 · 服务端（零依赖 Node）
// 职责：目录下发、版本化保存（乐观并发控制）、服务端校验、三方合并、车道布局、服务端预览兜底、静态托管。
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog } from './catalog.mjs';
import { validateNodes, computeLayout, threeWayMerge, buildPreview } from './domain.mjs';
import { getTimeline, listVersions, baseSnapshot, checkIdempotency, commitVersion } from './store.mjs';

const PORT = process.env.PORT || 8080;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, '..', 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', ...headers });
  res.end(payload);
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw Object.assign(new Error('payload too large'), { status: 413 });
  }
  return raw ? JSON.parse(raw) : {};
}

function withLayout(t) {
  return { id: t.id, version: t.version, updatedAt: t.updatedAt, nodes: t.nodes, layout: computeLayout(t.nodes) };
}

async function handlePut(req, res, id) {
  let body;
  try { body = await readBody(req); } catch (e) { return send(res, e.status ?? 400, { error: 'BAD_REQUEST', message: e.message }); }
  const { baseVersion, nodes, clientId, idempotencyKey, strategy } = body;
  if (!Array.isArray(nodes)) return send(res, 400, { error: 'BAD_REQUEST', message: 'nodes 必须是数组' });
  if (typeof baseVersion !== 'number') return send(res, 400, { error: 'BAD_REQUEST', message: '缺少 baseVersion' });

  const t = await getTimeline(id);

  // 幂等重放：同一 idempotencyKey 的重复提交直接返回首次结果，不产生新版本
  const replay = checkIdempotency(t, idempotencyKey);
  if (replay) return send(res, replay.status, { ...replay.body, idempotentReplay: true });

  let finalNodes = nodes;
  let merged = null;

  if (baseVersion !== t.version) {
    if (strategy !== 'rebase') {
      // 乐观并发控制：拒绝旧版本覆盖，返回服务器现状供客户端决策
      return send(res, 409, { error: 'VERSION_CONFLICT', message: `服务器版本为 ${t.version}，你的修改基于 ${baseVersion}`, ...withLayout(t) });
    }
    const base = baseSnapshot(t, baseVersion);
    if (!base) {
      return send(res, 409, { error: 'BASE_UNKNOWN', message: '基线版本过旧，无法自动合并，请重新加载', ...withLayout(t) });
    }
    const result = threeWayMerge(base, t.nodes, nodes);
    finalNodes = result.merged;
    merged = { conflicts: result.conflicts, fromVersion: baseVersion, toVersion: t.version };
  }

  const { errors, warnings } = validateNodes(finalNodes);
  if (errors.length) {
    return send(res, 422, { error: 'VALIDATION_FAILED', issues: errors, warnings, currentVersion: t.version });
  }

  const committed = await commitVersion(t, { nodes: finalNodes, clientId, idempotencyKey, merged });
  return send(res, committed.status, { ...committed.body, layout: computeLayout(finalNodes), warnings });
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  if (req.method === 'GET' && url.pathname === '/api/catalog') return send(res, 200, catalog);
  if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true });

  if (parts[1] === 'timelines' && parts[2]) {
    const id = parts[2];
    if (req.method === 'GET' && parts.length === 3) return send(res, 200, withLayout(await getTimeline(id)));
    if (req.method === 'PUT' && parts.length === 3) return handlePut(req, res, id);
    if (req.method === 'GET' && parts[3] === 'versions') return send(res, 200, { versions: await listVersions(id) });
    if (req.method === 'GET' && parts[3] === 'preview') {
      const t = await getTimeline(id);
      return send(res, 200, { version: t.version, ...buildPreview(t.nodes) });
    }
  }
  return send(res, 404, { error: 'NOT_FOUND' });
}

async function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(DIST, p));
  if (!file.startsWith(DIST)) return send(res, 403, 'forbidden');
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    // SPA 回退
    try {
      const data = await readFile(path.join(DIST, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(data);
    } catch {
      send(res, 404, '前端尚未构建：请先运行 npm run build，或使用 npm run dev（Vite 已代理 /api）');
    }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return await serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'INTERNAL', message: String(e.message ?? e) });
  }
});

server.listen(PORT, () => console.log(`思想年代服务端已启动: http://localhost:${PORT}`));
