// 持久化：JSON 文件 + 原子写入。版本历史用于三方合并与回溯。
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const FILE = path.join(DATA_DIR, 'store.json');
const HISTORY_LIMIT = 50;

let state = null; // { timelines: { [id]: { id, version, nodes, updatedAt, history: [], idempotency: {} } } }

async function load() {
  if (state) return state;
  try {
    state = JSON.parse(await readFile(FILE, 'utf8'));
  } catch {
    state = { timelines: {} };
  }
  return state;
}

let writeQueue = Promise.resolve();
async function persist() {
  // 串行化写入，tmp + rename 保证原子性
  const snapshot = JSON.stringify(state, null, 2);
  writeQueue = writeQueue.then(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    await writeFile(tmp, snapshot);
    await rename(tmp, FILE);
  });
  return writeQueue;
}

export async function getTimeline(id) {
  await load();
  if (!state.timelines[id]) {
    state.timelines[id] = { id, version: 0, nodes: [], updatedAt: new Date().toISOString(), history: [], idempotency: {} };
    await persist();
  }
  return state.timelines[id];
}

export async function listVersions(id) {
  const t = await getTimeline(id);
  return t.history.map((h) => ({ version: h.version, savedAt: h.savedAt, clientId: h.clientId, nodeCount: h.nodes.length }));
}

export function baseSnapshot(t, version) {
  if (version === t.version) return t.nodes;
  const h = t.history.find((x) => x.version === version);
  return h ? h.nodes : null;
}

export function checkIdempotency(t, key) {
  return key ? t.idempotency[key] ?? null : null;
}

/**
 * 提交新版本。调用方需已完成校验与合并。
 * 返回 { ok, status, body }。
 */
export async function commitVersion(t, { nodes, clientId, idempotencyKey, merged }) {
  t.history.push({ version: t.version, nodes: t.nodes, savedAt: t.updatedAt, clientId: t.lastClientId ?? null });
  if (t.history.length > HISTORY_LIMIT) t.history.splice(0, t.history.length - HISTORY_LIMIT);
  t.version += 1;
  t.nodes = nodes;
  t.updatedAt = new Date().toISOString();
  t.lastClientId = clientId ?? null;
  const body = { version: t.version, nodes: t.nodes, updatedAt: t.updatedAt, ...(merged ? { merged } : {}) };
  if (idempotencyKey) {
    t.idempotency[idempotencyKey] = { status: 200, body };
    const keys = Object.keys(t.idempotency);
    if (keys.length > 100) keys.slice(0, keys.length - 100).forEach((k) => delete t.idempotency[k]);
  }
  await persist();
  return { status: 200, body };
}

export async function saveIdempotentResponse(t, key, status, body) {
  if (!key) return;
  t.idempotency[key] = { status, body };
  await persist();
}
