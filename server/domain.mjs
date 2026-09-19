// 领域逻辑：校验、布局、三方合并。所有时间逻辑的最终裁决都在这里（服务端）。
import { catalog, refOf } from './catalog.mjs';

export const DOMAIN = { min: -850, max: 2030 };
// 一个画框标签在时间轴上大约占据的年份半径（用于防重叠车道分配）
const LABEL_HALF_YEARS = 16;

function canon(n) {
  // 只比较语义字段，忽略客户端可能带入的易变字段
  return JSON.stringify({ r: n.refId, k: n.kind, y: Math.round(n.year), p: n.parentId ?? null, n: n.note ?? '' });
}

/**
 * 校验一组节点。返回 { errors, warnings }，errors 非空则拒绝保存。
 * 规则：
 *  - 引用必须存在于目录；同一目录项只能出现一次
 *  - 时代节点锚点必须落在时代跨度内
 *  - 哲学家锚点必须落在其生卒年之间（人物年代）
 *  - 挂到时代下的哲学家：生平须与时代相交（错误）；传统须与时代相交（警告）
 *  - 挂到哲学家下的问题：锚点须在人物生平内（错误）；主题与传统相交（警告）
 *  - 父子关系：时代不可有父节点；问题只能挂在时代/哲学家下；不得成环
 */
export function validateNodes(nodes) {
  const errors = [];
  const warnings = [];
  const byId = new Map();
  const seenRefs = new Set();

  for (const n of nodes) {
    if (!n || typeof n.id !== 'string' || !n.id) {
      errors.push({ nodeId: n?.id ?? null, code: 'BAD_ID', message: '节点缺少合法 id' });
      continue;
    }
    if (byId.has(n.id)) errors.push({ nodeId: n.id, code: 'DUP_NODE', message: `节点 id 重复：${n.id}` });
    byId.set(n.id, n);

    if (!['era', 'philosopher', 'question'].includes(n.kind)) {
      errors.push({ nodeId: n.id, code: 'BAD_KIND', message: `未知节点类型：${n.kind}` });
      continue;
    }
    const ref = refOf(n.kind, n.refId);
    if (!ref) {
      errors.push({ nodeId: n.id, code: 'UNKNOWN_REF', message: `目录中不存在 ${n.kind}:${n.refId}` });
      continue;
    }
    if (seenRefs.has(n.refId)) {
      errors.push({ nodeId: n.id, code: 'DUP_REF', message: `「${ref.name ?? ref.text}」已在展墙上，同一展品只能出现一次` });
    }
    seenRefs.add(n.refId);

    if (typeof n.year !== 'number' || !Number.isFinite(n.year)) {
      errors.push({ nodeId: n.id, code: 'BAD_YEAR', message: '锚点年份缺失或非法' });
      continue;
    }
    if (n.year < DOMAIN.min || n.year > DOMAIN.max) {
      errors.push({ nodeId: n.id, code: 'YEAR_DOMAIN', message: `年份 ${n.year} 超出时间轴范围` });
    }

    if (n.kind === 'era') {
      if (n.parentId) errors.push({ nodeId: n.id, code: 'ERA_PARENT', message: '时代节点不能挂在其他节点之下' });
      if (n.year < ref.start || n.year > ref.end) {
        errors.push({ nodeId: n.id, code: 'ERA_ANCHOR', message: `「${ref.name}」的锚点须位于 ${ref.start}–${ref.end} 之间` });
      }
    }

    if (n.kind === 'philosopher') {
      if (n.year < ref.birth || n.year > ref.death) {
        errors.push({ nodeId: n.id, code: 'LIFESPAN', message: `${ref.name} 的锚点 ${n.year} 不在其生平 ${ref.birth}–${ref.death} 之内` });
      }
    }
  }

  // 关系校验（需要完整的 byId）
  for (const n of byId.values()) {
    if (!n.parentId) continue;
    const parent = byId.get(n.parentId);
    if (!parent) {
      errors.push({ nodeId: n.id, code: 'PARENT_MISSING', message: '父节点不存在（可能已被移除）' });
      continue;
    }
    if (parent.kind === 'question') {
      errors.push({ nodeId: n.id, code: 'PARENT_KIND', message: '问题节点不能再挂载子节点' });
      continue;
    }
    // 成环检测
    let cur = parent;
    const guard = new Set([n.id]);
    while (cur) {
      if (guard.has(cur.id)) { errors.push({ nodeId: n.id, code: 'CYCLE', message: '节点关系成环' }); break; }
      guard.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : null;
    }

    const ref = refOf(n.kind, n.refId);
    const pref = refOf(parent.kind, parent.refId);
    if (!ref || !pref) continue;

    if (n.kind === 'philosopher' && parent.kind === 'era') {
      const intersects = ref.birth <= pref.end && ref.death >= pref.start;
      if (!intersects) {
        errors.push({ nodeId: n.id, code: 'ERA_LIFESPAN', message: `${ref.name}（${ref.birth}–${ref.death}）的生平与「${pref.name}」不相交` });
      }
      const shared = ref.traditions.filter((t) => pref.traditions.includes(t));
      if (intersects && shared.length === 0) {
        warnings.push({ nodeId: n.id, code: 'TRADITION', message: `${ref.name} 的传统（${ref.traditions.join('、')}）与「${pref.name}」不太相符` });
      }
    }

    if (n.kind === 'question') {
      if (parent.kind === 'philosopher') {
        if (n.year < pref.birth || n.year > pref.death) {
          errors.push({ nodeId: n.id, code: 'Q_LIFESPAN', message: `问题的锚点 ${n.year} 不在 ${pref.name} 的生平之内` });
        }
        const shared = ref.themes.filter((t) => pref.traditions.includes(t));
        if (shared.length === 0) {
          warnings.push({ nodeId: n.id, code: 'Q_THEME', message: `「${ref.text}」与 ${pref.name} 的思想传统关联较弱` });
        }
      }
      if (parent.kind === 'era' && (n.year < pref.start || n.year > pref.end)) {
        errors.push({ nodeId: n.id, code: 'Q_ERA', message: `问题的锚点 ${n.year} 不在「${pref.name}」的跨度内` });
      }
    }
  }

  return { errors, warnings };
}

/**
 * 防重叠布局：为每个非标尺节点分配车道（lane）。
 * 服务端计算并下发，客户端只负责渲染——客户端不能单独决定最终空间逻辑。
 */
export function computeLayout(nodes) {
  const frames = nodes
    .filter((n) => n.kind !== 'era')
    .map((n) => ({ id: n.id, year: n.year }))
    .sort((a, b) => a.year - b.year || (a.id < b.id ? -1 : 1));
  const laneEnds = [];
  const lanes = {};
  for (const f of frames) {
    let lane = 0;
    while (laneEnds[lane] !== undefined && f.year - LABEL_HALF_YEARS < laneEnds[lane]) lane++;
    laneEnds[lane] = f.year + LABEL_HALF_YEARS;
    lanes[f.id] = lane;
  }
  return { lanes, laneCount: laneEnds.length };
}

/** 三方合并：base（共同祖先）、current（服务器现状）、incoming（客户端离线/过期版本） */
export function threeWayMerge(base, current, incoming) {
  const toMap = (arr) => new Map(arr.map((n) => [n.id, n]));
  const b = toMap(base), c = toMap(current), i = toMap(incoming);
  const ids = new Set([...b.keys(), ...c.keys(), ...i.keys()]);
  const merged = [];
  const conflicts = [];

  for (const id of ids) {
    const bn = b.get(id), cn = c.get(id), inn = i.get(id);
    if (inn && !bn) { merged.push(inn); continue; }                 // 客户端新增
    if (!inn && bn) {                                               // 客户端删除
      if (cn && canon(cn) !== canon(bn)) {                          // 服务端同时改过 → 保留服务端
        conflicts.push({ id, resolution: 'kept-server' });
        merged.push(cn);
      } // 否则确认删除
      continue;
    }
    if (!inn && !bn && cn) { merged.push(cn); continue; }           // 服务端新增，客户端未见
    if (inn && bn) {
      if (!cn) {                                                    // 服务端已删除
        if (canon(inn) !== canon(bn)) { conflicts.push({ id, resolution: 'kept-client' }); merged.push(inn); }
        continue;
      }
      const clientChanged = canon(inn) !== canon(bn);
      const serverChanged = canon(cn) !== canon(bn);
      if (clientChanged && serverChanged && canon(inn) !== canon(cn)) {
        conflicts.push({ id, resolution: 'kept-client' });
        merged.push(inn);                                           // 离线方的最新意图优先，但记录冲突
      } else if (clientChanged) merged.push(inn);
      else merged.push(cn);
    }
  }
  return { merged, conflicts };
}

/** 服务端预览：把节点组织成可阅读的展览文本（客户端预览失败时的兜底） */
export function buildPreview(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const eraNodes = nodes.filter((n) => n.kind === 'era').sort((a, b) => refOf('era', a.refId).start - refOf('era', b.refId).start);
  const used = new Set();
  const sections = [];

  for (const e of eraNodes) {
    const era = refOf('era', e.refId);
    const children = nodes
      .filter((n) => n.parentId === e.id)
      .sort((a, b) => a.year - b.year);
    const items = children.map((n) => describeNode(n, byId)).filter(Boolean);
    children.forEach((n) => { used.add(n.id); markSubtree(n, byId, used); });
    used.add(e.id);
    sections.push({ heading: `${era.name}（${era.start}–${era.end}）`, items });
  }

  const orphans = nodes.filter((n) => !used.has(n.id) && !n.parentId && n.kind !== 'era')
    .sort((a, b) => a.year - b.year);
  if (orphans.length) {
    sections.push({ heading: '未归入时代', items: orphans.map((n) => describeNode(n, byId)).filter(Boolean) });
  }
  return { generatedAt: new Date().toISOString(), sections };
}

function markSubtree(node, byId, used) {
  for (const n of byId.values()) {
    if (n.parentId === node.id) { used.add(n.id); markSubtree(n, byId, used); }
  }
}

function describeNode(n, byId) {
  const ref = refOf(n.kind, n.refId);
  if (!ref) return null;
  if (n.kind === 'philosopher') {
    const qs = [...byId.values()].filter((c) => c.parentId === n.id && c.kind === 'question')
      .map((c) => refOf('question', c.refId)?.text).filter(Boolean);
    return {
      title: `${ref.name}（${ref.birth}–${ref.death}）`,
      body: ref.summary + (qs.length ? ` 悬问：${qs.join('；')}` : ''),
      year: n.year,
    };
  }
  if (n.kind === 'question') return { title: `「${ref.text}」`, body: '', year: n.year };
  return null;
}
