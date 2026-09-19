// 思想年代 · 存储层
// 每个策展档案（gallery）维护一条只增不改的版本链：任何正式保存都追加一个版本，
// 旧版本永不覆盖。并发写通过每馆互斥队列串行化；保存本身不依赖预览渲染。

import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { applyOps, emptyState } from './validate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.CENTURY_DATA_DIR || join(__dirname, '..', '.century-data');

function nowISO() { return new Date().toISOString(); }

function freshGallery() {
  return {
    id: randomUUID(),
    createdAt: nowISO(),
    head: 0,
    // 当前正式状态（= 所有正式版本依次应用后的结果），并直接冗余以便读取
    state: emptyState(),
    versions: [],
  };
}

const locks = new Map(); // galleryId -> Promise chain

function withLock(galleryId, task) {
  const tail = locks.get(galleryId) ?? Promise.resolve();
  const next = tail.then(() => task()).catch((err) => { throw err; });
  // 无论成败都释放链尾
  const released = next.then(() => {}, () => {});
  locks.set(galleryId, released);
  return next;
}

const pathFor = (galleryId) => join(DATA_DIR, `${galleryId}.json`);

function load(galleryId) {
  const path = pathFor(galleryId);
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return raw;
}

function persist(gallery) {
  mkdirSync(DATA_DIR, { recursive: true });
  const path = pathFor(gallery.id);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(gallery, null, 2));
  renameSync(tmp, path); // 原子替换，避免半写文件
}

export const store = {
  createGallery(seedState) {
    const gallery = freshGallery();
    gallery.state = seedState ? { ...emptyState(), ...seedState } : emptyState();
    const v0 = {
      version: 0,
      versionId: randomUUID(),
      at: nowISO(),
      message: '建馆',
      client: null,
      baseVersion: null,
      state: JSON.parse(JSON.stringify(gallery.state)),
      source: { kind: 'init' },
    };
    gallery.versions.push(v0);
    persist(gallery);
    return gallery;
  },

  getGallery(galleryId) {
    return load(galleryId);
  },

  // 正式提交：baseVersion 乐观并发。返回 {status, ...}
  commit({ galleryId, baseVersion, ops, clientId, message, previewExpectation }) {
    return withLock(galleryId, () => {
      let gallery = load(galleryId);
      if (!gallery) {
        return { status: 'missing' };
      }
      if (gallery.head !== baseVersion) {
        // 旧版本覆盖：拒绝，并把分叉所需的两端交给客户端
        return {
          status: 'conflict',
          current: publicGallery(gallery),
          requestedBase: baseVersion,
          serverHead: gallery.head,
        };
      }
      const nextState = applyOps(gallery.state, ops ?? []);
      gallery.head += 1;
      gallery.state = nextState;
      const version = {
        version: gallery.head,
        versionId: randomUUID(),
        at: nowISO(),
        message: String(message ?? '').slice(0, 140) || `第 ${gallery.head} 次布展`,
        client: clientId ? String(clientId).slice(0, 80) : 'anonymous',
        baseVersion,
        state: JSON.parse(JSON.stringify(nextState)),
        source: { kind: 'client-ops', ops: (ops ?? []).map(sanitizeOp) },
        previewExpectation: previewExpectation ? String(previewExpectation).slice(0, 200) : null,
      };
      gallery.versions.push(version);
      persist(gallery);
      return {
        status: 'committed',
        current: publicGallery(gallery),
        committedVersion: gallery.head,
        versionId: version.versionId,
        at: version.at,
      };
    });
  },

  // 服务端裁决的合并提交：直接保存三路合并后的状态
  mergeCommit({ galleryId, baseVersion, mergedState, clientId, conflicts, strategy }) {
    return withLock(galleryId, () => {
      const gallery = load(galleryId);
      if (!gallery) return { status: 'missing' };
      if (gallery.head === baseVersion) {
        // 等待用户裁决期间无人写入，直接提交即可
        gallery.head += 1;
      } else {
        gallery.head += 1; // 仍基于当前 head 追加，版本链不分支
      }
      gallery.state = mergedState;
      const version = {
        version: gallery.head,
        versionId: randomUUID(),
        at: nowISO(),
        message: `离线/并发合并（策略：${strategy}，冲突 ${conflicts.length} 处）`,
        client: clientId ? String(clientId).slice(0, 80) : 'anonymous',
        baseVersion,
        state: JSON.parse(JSON.stringify(mergedState)),
        source: { kind: 'server-merge', conflicts, strategy },
      };
      gallery.versions.push(version);
      persist(gallery);
      return {
        status: 'committed',
        current: publicGallery(gallery),
        committedVersion: gallery.head,
        versionId: version.versionId,
        at: version.at,
        unresolvedConflicts: conflicts,
      };
    });
  },
};

function sanitizeOp(op) {
  const allowed = {};
  for (const key of ['op', 'eraId', 'refId', 'order', 'lane', 'from', 'to', 'kind', 'title']) {
    if (op && Object.prototype.hasOwnProperty.call(op, key)) allowed[key] = op[key];
  }
  return allowed;
}

// 对外视图：完整状态 + 版本元信息（版本中的完整 state 用于三路合并的分叉点）
export function publicGallery(gallery) {
  return {
    id: gallery.id,
    head: gallery.head,
    createdAt: gallery.createdAt,
    state: gallery.state,
    versions: gallery.versions.map((v) => ({
      version: v.version,
      versionId: v.versionId,
      at: v.at,
      message: v.message,
      client: v.client,
      baseVersion: v.baseVersion,
      source: v.source,
    })),
  };
}
