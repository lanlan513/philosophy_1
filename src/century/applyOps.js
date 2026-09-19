// 客户端 op 镜像：为了拖拽时的即时反馈，本地先应用一次变更；
// 但这只是「预判」，最终时间逻辑以服务端 /api/validate 与 commit 的裁决为准。
// 与 server/validate.mjs 的 applyOps 保持同一套语义。

export function emptyState() {
  return { title: '未命名的思想年代', eras: [], placements: {}, relations: [] };
}

export function applyOps(base, ops, catalog) {
  const eraIds = new Set(catalog.eras.map((e) => e.id));
  const people = new Map(catalog.people.map((p) => [p.id, p]));
  const questions = new Map(catalog.questions.map((q) => [q.id, q]));
  const kinds = new Set(['师承', '承继', '对话', '论敌', '评注', '再发现', '传播', '敬重', '惊醒', '反叛', '回响', '激发', '心传']);

  const state = {
    title: base.title ?? '未命名的思想年代',
    eras: [...(base.eras ?? [])],
    placements: Object.fromEntries(Object.entries(base.placements ?? {}).map(([k, v]) => [k, { ...v }])),
    relations: (base.relations ?? []).map((r) => ({ ...r })),
  };

  for (const op of ops ?? []) {
    switch (op.op) {
      case 'title':
        if (op.title) state.title = String(op.title).slice(0, 80);
        break;
      case 'addEra':
        if (eraIds.has(op.eraId) && !state.eras.includes(op.eraId)) state.eras.push(op.eraId);
        break;
      case 'removeEra':
        state.eras = state.eras.filter((id) => id !== op.eraId);
        for (const [refId, p] of Object.entries(state.placements)) {
          if (p.eraId === op.eraId) delete state.placements[refId];
        }
        break;
      case 'place': {
        const isPerson = people.has(op.refId);
        const isQuestion = questions.has(op.refId);
        if ((!isPerson && !isQuestion) || !state.eras.includes(op.eraId)) break;
        state.placements[op.refId] = {
          eraId: op.eraId,
          order: Number.isFinite(op.order) ? Math.round(op.order) : maxOrder(state, op.eraId),
          lane: isPerson ? 'person' : 'question',
        };
        break;
      }
      case 'unplace':
        delete state.placements[op.refId];
        break;
      case 'addRelation': {
        if (!people.has(op.from) || !people.has(op.to) || op.from === op.to || !kinds.has(op.kind)) break;
        const key = relKeyOf(op.from, op.to, op.kind);
        if (!state.relations.some((r) => relKeyOf(r.from, r.to, r.kind) === key)) {
          state.relations.push({ from: op.from, to: op.to, kind: op.kind });
        }
        break;
      }
      case 'removeRelation':
        state.relations = state.relations.filter(
          (r) => !(r.from === op.from && r.to === op.to && r.kind === op.kind),
        );
        break;
      default:
        break;
    }
  }
  return state;
}

function maxOrder(state, eraId) {
  const orders = Object.values(state.placements)
    .filter((p) => p.eraId === eraId)
    .map((p) => p.order ?? -1);
  return orders.length ? Math.max(...orders) + 1 : 0;
}

export function relKeyOf(from, to, kind) { return `${from}→${to}⟦${kind}⟧`; }
export function relKey(r) { return relKeyOf(r.from, r.to, r.kind); }

// 展厅内重排：把 refId 移动到 targetRefId 之前（target 为 null 则移到末尾）。
// 返回新的 placements（顺序号在每个展厅内重新连续编号，杜绝同序重叠）。
export function moveItem(state, refId, targetEraId, targetRefId) {
  const placements = structuredClone(state.placements);
  const lane = placements[refId]?.lane;
  if (!lane) return placements;
  placements[refId] = { ...placements[refId], eraId: targetEraId };

  const group = Object.entries(placements)
    .filter(([, p]) => p.eraId === targetEraId && p.lane === lane)
    .map(([id]) => id)
    .filter((id) => id !== refId);

  let index = group.length;
  if (targetRefId && group.includes(targetRefId)) index = group.indexOf(targetRefId);
  group.splice(index, 0, refId);
  for (const [i, id] of group.entries()) {
    placements[id] = { ...placements[id], eraId: targetEraId, order: i };
  }
  // 跨展厅移动后，原展厅也要重新连续编号
  for (const eraId of new Set(Object.values(placements).map((p) => p.eraId))) {
    if (eraId === targetEraId) continue;
    for (const laneName of ['person', 'question']) {
      const ids = Object.entries(placements)
        .filter(([, p]) => p.eraId === eraId && p.lane === laneName)
        .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0))
        .map(([id]) => id);
      ids.forEach((id, i) => { placements[id] = { ...placements[id], order: i }; });
    }
  }
  return placements;
}

// 展厅内上移/下移一格（键盘与触屏的可达替代）
export function nudgeItem(state, refId, delta) {
  const current = state.placements[refId];
  if (!current) return state.placements;
  const ids = Object.entries(state.placements)
    .filter(([, p]) => p.eraId === current.eraId && p.lane === current.lane)
    .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0))
    .map(([id]) => id);
  const i = ids.indexOf(refId);
  const j = i + delta;
  if (j < 0 || j >= ids.length) return state.placements;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  const next = structuredClone(state.placements);
  ids.forEach((id, order) => { next[id] = { ...next[id], order }; });
  return next;
}

export function formatYear(y) {
  return y < 0 ? `前${-y}` : `${y}`;
}

export function homeEraForPerson(person, eras) {
  const mid = (person.born + person.died) / 2;
  let home = null;
  for (const e of eras) if (mid >= e.from && mid <= e.to) home = e.id;
  if (!home) {
    let best = null;
    let bestDist = Infinity;
    for (const e of eras) {
      const d = mid < e.from ? e.from - mid : mid > e.to ? mid - e.to : 0;
      if (d < bestDist) { bestDist = d; best = e.id; }
    }
    home = best;
  }
  const loans = eras.filter((e) => e.id !== home && person.died >= e.from && person.born <= e.to).map((e) => e.id);
  return { home, loans };
}
