// 思想年代 · 服务入口
//   node server/index.mjs [--port 5174]
// 提供权威目录、校验、版本化保存、三路合并与独立预览；
// 生产环境同时托管 dist/ 构建产物。

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ERAS, TRADITIONS, PEOPLE, QUESTIONS, RELATIONS,
  ERA_MAP, PEOPLE_MAP,
} from './catalog.mjs';
import { validateState, threeWayMerge, applyOps } from './validate.mjs';
import { renderPreview } from './preview.mjs';
import { store, publicGallery } from './store.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT || process.argv.find((a) => a.startsWith('--port='))?.split('=')[1] || 5174);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2_000_000) { reject(new Error('payload too large')); req.destroy(); return; }
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

// 从版本快照键中还原关系对象
function parseRelKey(key) {
  const [rest, kind] = key.split('⟦');
  const [from, to] = rest.split('→');
  return { from, to, kind: kind.replace('⟧', '') };
}

// 按策略对三路合并的冲突点做裁决
function resolveConflicts(merged, conflicts, serverState, clientState, strategy) {
  const unresolved = [];
  for (const c of conflicts) {
    if (strategy === 'manual') { unresolved.push(c); continue; }
    if (c.field === 'title') {
      if (strategy === 'client') merged.title = clientState.title;
      else if (strategy === 'server') merged.title = serverState.title;
      else unresolved.push(c);
      continue;
    }
    if (c.field === 'eras') {
      const inClient = clientState.eras?.includes(c.item);
      if (strategy === 'client') {
        if (!inClient) merged.eras = merged.eras.filter((id) => id !== c.item);
        else if (!merged.eras.includes(c.item)) merged.eras.push(c.item);
      } else if (strategy === 'server') {
        // 默认值即服务端
      } else unresolved.push(c);
      continue;
    }
    if (c.field === 'relations') {
      const rel = parseRelKey(c.item);
      const clientKeeps = clientState.relations?.some(
        (r) => `${r.from}→${r.to}⟦${r.kind}⟧` === c.item);
      if (strategy === 'client') {
        if (clientKeeps && !merged.relations.some((r) => `${r.from}→${r.to}⟦${r.kind}⟧` === c.item)) merged.relations.push(rel);
        if (!clientKeeps) merged.relations = merged.relations.filter((r) => `${r.from}→${r.to}⟦${r.kind}⟧` !== c.item);
      } else if (strategy === 'server') {
        // 默认即服务端
      } else unresolved.push(c);
      continue;
    }
    if (c.field === 'placements') {
      if (strategy === 'client') {
        if (clientState.placements?.[c.item]) merged.placements[c.item] = clientState.placements[c.item];
        else delete merged.placements[c.item];
      } else if (strategy === 'server') {
        // 默认即服务端
      } else unresolved.push(c);
      continue;
    }
    unresolved.push(c);
  }
  return unresolved;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname } = url;
  try {
    // ---------- API ----------
    if (pathname === '/api/catalog' && req.method === 'GET') {
      return json(res, 200, {
        eras: ERAS, traditions: TRADITIONS, people: PEOPLE,
        questions: QUESTIONS, relations: RELATIONS,
      });
    }

    if (pathname === '/api/validate' && req.method === 'POST') {
      const body = await readBody(req);
      return json(res, 200, validateState(body.state ?? {}));
    }

    if (pathname === '/api/preview' && req.method === 'POST') {
      const body = await readBody(req);
      // 预览是独立环节：测试/演示可显式制造「保存成功、预览失败」
      if (body._forcePreviewError || url.searchParams.get('fail') === '1') {
        res.writeHead(503, { 'content-type': 'application/json; charset=utf-8', 'retry-after': '2' });
        return res.end(JSON.stringify({ error: 'preview_renderer_unavailable', message: '展墙渲染器暂时离线，你的版本已安全保存。' }));
      }
      const state = body.state ?? {};
      const report = validateState(state);
      const preview = renderPreview(state, {
        version: body.version ?? 0,
        versionId: body.versionId ?? 'draft',
        at: new Date().toISOString(),
      });
      return json(res, 200, { preview, valid: report.valid, issues: report.issues });
    }

    if (pathname === '/api/galleries' && req.method === 'POST') {
      const body = await readBody(req);
      let seed = null;
      if (body.seedOps) {
        seed = applyOps({ title: body.title || '我的思想年代', eras: [], placements: {}, relations: [] }, body.seedOps);
      } else if (body.title) {
        seed = { title: String(body.title).slice(0, 80), eras: [], placements: {}, relations: [] };
      }
      const gallery = store.createGallery(seed);
      return json(res, 201, publicGallery(gallery));
    }

    const galleryMatch = pathname.match(/^\/api\/galleries\/([A-Za-z0-9-]+)(?:\/(.*))?$/);
    if (galleryMatch) {
      const galleryId = galleryMatch[1];
      const action = galleryMatch[2] ?? '';

      if (action === '' && req.method === 'GET') {
        const gallery = store.getGallery(galleryId);
        if (!gallery) return json(res, 404, { error: 'gallery_not_found' });
        return json(res, 200, publicGallery(gallery));
      }

      const versionMatch = action.match(/^versions\/(\d+)$/);
      if (versionMatch && req.method === 'GET') {
        const gallery = store.getGallery(galleryId);
        if (!gallery) return json(res, 404, { error: 'gallery_not_found' });
        const v = gallery.versions[Number(versionMatch[1])];
        if (!v) return json(res, 404, { error: 'version_not_found' });
        return json(res, 200, { version: v.version, versionId: v.versionId, at: v.at, state: v.state });
      }

      if (action === 'commit' && req.method === 'POST') {
        const body = await readBody(req);
        const gallery = store.getGallery(galleryId);
        if (!gallery) return json(res, 404, { error: 'gallery_not_found' });
        const requestedBase = Number(body.baseVersion);

        // 先在候选状态上做硬校验：error 级别的年代/关系问题不能成为正式版本。
        // 警告（借展、注记）允许保存，并写进展览的策展注记。
        const candidate = applyOps(gallery.state, Array.isArray(body.ops) ? body.ops : []);
        const candidateReport = validateState(candidate);
        if (gallery.head !== requestedBase && !candidateReport.valid) {
          // 既冲突又硬伤：优先返回冲突，合并后再校验
        }
        if (!candidateReport.valid) {
          return json(res, 422, {
            error: 'validation_rejected',
            message: '档案馆拒绝了这次布展：存在年代或关系上的硬伤。策展注记级别的问题可以保存，硬伤必须修正。',
            validation: { valid: false, issues: candidateReport.issues, canonical: candidateReport.canonical, stats: candidateReport.stats },
            serverHead: gallery.head,
            current: publicGallery(gallery),
          });
        }
        if (gallery.head !== requestedBase) {
          return json(res, 409, {
            error: 'version_conflict',
            message: `你的改动基于第 ${requestedBase} 版，而墙上已是第 ${gallery.head} 版。请合并后再提交。`,
            current: publicGallery(gallery),
            serverHead: gallery.head,
            requestedBase,
          });
        }

        const result = await store.commit({
          galleryId,
          baseVersion: requestedBase,
          ops: Array.isArray(body.ops) ? body.ops : [],
          clientId: body.clientId,
          message: body.message,
          previewExpectation: body.previewExpectation,
        });
        if (result.status === 'missing') return json(res, 404, { error: 'gallery_not_found' });
        if (result.status === 'conflict') {
          return json(res, 409, {
            error: 'version_conflict',
            message: `你的改动基于第 ${result.requestedBase} 版，而墙上已是第 ${result.serverHead} 版。请合并后再提交。`,
            current: result.current,
            serverHead: result.serverHead,
            requestedBase: result.requestedBase,
          });
        }
        // 保存与预览解耦：commit 本身永不因渲染失败而失败
        let preview = null;
        let previewError = null;
        if (body.withPreview !== false) {
          try {
            preview = renderPreview(result.current.state, {
              version: result.committedVersion, versionId: result.versionId, at: result.at,
            });
          } catch (err) {
            previewError = { code: 'preview_render_failed', message: String(err?.message ?? err) };
          }
        }
        return json(res, 200, {
          ok: true,
          committedVersion: result.committedVersion,
          versionId: result.versionId,
          at: result.at,
          current: result.current,
          preview,
          previewError,
        });
      }

      if (action === 'merge' && req.method === 'POST') {
        const body = await readBody(req);
        const gallery = store.getGallery(galleryId);
        if (!gallery) return json(res, 404, { error: 'gallery_not_found' });
        const baseVersion = Number(body.baseVersion);
        const baseSnapshot = gallery.versions[baseVersion];
        if (!baseSnapshot) return json(res, 409, { error: 'base_version_missing', serverHead: gallery.head });
        const { state: merged, conflicts } = threeWayMerge(
          baseSnapshot.state, gallery.state, body.clientState ?? {},
        );
        const strategy = ['server', 'client', 'manual'].includes(body.strategy) ? body.strategy : 'manual';
        const unresolved = resolveConflicts(merged, conflicts, gallery.state, body.clientState ?? {}, strategy);
        const validation = validateState(merged);

        if (strategy === 'manual' || unresolved.length > 0 || !validation.valid) {
          // 不落版本：把冲突与建议返回给策展人逐项裁决
          return json(res, 200, {
            merged: false,
            strategy,
            conflicts,
            unresolved,
            proposedState: merged,
            validation: { valid: validation.valid, issues: validation.issues },
            serverHead: gallery.head,
          });
        }
        const result = await store.mergeCommit({
          galleryId, baseVersion, mergedState: merged,
          clientId: body.clientId, conflicts, strategy,
        });
        const preview = renderPreview(result.current.state, {
          version: result.committedVersion, versionId: result.versionId, at: result.at,
        });
        return json(res, 200, {
          merged: true,
          committedVersion: result.committedVersion,
          versionId: result.versionId,
          at: result.at,
          current: result.current,
          preview,
          conflictsResolved: conflicts,
        });
      }

      if (action === 'preview' && req.method === 'POST') {
        const body = await readBody(req);
        const gallery = store.getGallery(galleryId);
        if (!gallery) return json(res, 404, { error: 'gallery_not_found' });
        const state = body.state ?? gallery.state;
        const preview = renderPreview(state, {
          version: gallery.head, versionId: gallery.versions[gallery.head].versionId,
          at: new Date().toISOString(),
        });
        return json(res, 200, { preview });
      }
    }

    // ---------- 静态资源（生产模式） ----------
    if (req.method === 'GET' && !pathname.startsWith('/api/')) {
      if (existsSync(DIST_DIR)) {
        const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
        let filePath = join(DIST_DIR, safePath);
        if (!filePath.startsWith(DIST_DIR)) filePath = join(DIST_DIR, 'index.html');
        try {
          const s = await stat(filePath);
          if (s.isDirectory()) filePath = join(filePath, 'index.html');
          const content = await readFile(filePath);
          res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
          return res.end(content);
        } catch {
          const index = await readFile(join(DIST_DIR, 'index.html'));
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          return res.end(index);
        }
      }
      return json(res, 404, { error: 'frontend_not_built', hint: '运行 npm run build，或使用 vite dev（/api 已配置代理）' });
    }

    return json(res, 404, { error: 'not_found' });
  } catch (err) {
    if (err?.message === 'invalid json') return json(res, 400, { error: 'invalid_json' });
    if (err?.message === 'payload too large') return json(res, 413, { error: 'payload_too_large' });
    console.error('[century]', err);
    return json(res, 500, { error: 'internal_error' });
  }
});

server.listen(PORT, () => {
  console.log(`\n  我的思想年代 · A Personal Century`);
  console.log(`  API:  http://localhost:${PORT}/api/catalog`);
  if (existsSync(DIST_DIR)) console.log(`  展览: http://localhost:${PORT}/century`);
  else console.log(`  (前端未构建：npm run build 后在此打开，或 npm run dev 使用代理)\n`);
});
