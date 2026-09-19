// 思想年代 · 服务端校验引擎
// 原则：时间逻辑只能由这里裁决。客户端可以任意摆放，但「谁属于哪个时代、
// 谁先谁后、关系是否成立」一律以典册（catalog）为准重新计算。
//
// issue 严重级别：
//   error   —— 违反硬事实，本次编排不能成为正式版本
//   warning —— 允许保存，但会作为「策展注记」写进版本与展览预览

import {
  ERAS, ERA_MAP, PEOPLE_MAP, QUESTION_MAP, RELATION_MAP,
  TRADITIONS, homeEraForPerson, traditionName, formatYear,
} from './catalog.mjs';

const RELATION_KINDS = new Set(['师承', '承继', '对话', '论敌', '评注', '再发现', '传播', '敬重', '惊醒', '反叛', '回响', '激发', '心传']);

function issue(code, severity, about, message, fix) {
  return { code, severity, about, message, fix };
}

// 把变更序列应用到基准状态（纯函数，供保存与三路合并复用）
export function applyOps(base, ops) {
  const state = cloneState(base);
  for (const raw of ops) {
    const op = raw && typeof raw === 'object' ? raw : {};
    switch (op.op) {
      case 'title':
        state.title = String(op.title ?? '').slice(0, 80) || state.title;
        break;
      case 'addEra': {
        if (!ERA_MAP.has(op.eraId)) break;
        if (!state.eras.includes(op.eraId)) state.eras.push(op.eraId);
        break;
      }
      case 'removeEra': {
        state.eras = state.eras.filter((id) => id !== op.eraId);
        // 展厅撤下：墙上的画回到库房，而不是被删除
        for (const [refId, p] of Object.entries(state.placements)) {
          if (p.eraId === op.eraId) delete state.placements[refId];
        }
        break;
      }
      case 'place': {
        const person = PEOPLE_MAP.get(op.refId);
        const question = QUESTION_MAP.get(op.refId);
        if (!person && !question) break;
        if (!state.eras.includes(op.eraId)) break; // 不能挂进不存在的展厅
        state.placements[op.refId] = {
          eraId: op.eraId,
          order: Number.isFinite(op.order) ? Math.round(op.order) : 0,
          lane: op.lane === 'question' ? 'question' : person ? 'person' : 'question',
        };
        break;
      }
      case 'unplace':
        delete state.placements[op.refId];
        break;
      case 'addRelation': {
        if (!PEOPLE_MAP.has(op.from) || !PEOPLE_MAP.has(op.to) || op.from === op.to) break;
        if (!RELATION_KINDS.has(op.kind)) break;
        const key = relKey(op.from, op.to, op.kind);
        if (!state.relations.some((r) => relKey(r.from, r.to, r.kind) === key)) {
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

export function emptyState() {
  return { title: '未命名的思想年代', eras: [], placements: {}, relations: [] };
}

function cloneState(s) {
  return {
    title: s.title ?? '未命名的思想年代',
    eras: [...(s.eras ?? [])],
    placements: Object.fromEntries(Object.entries(s.placements ?? {}).map(([k, v]) => [k, { ...v }])),
    relations: (s.relations ?? []).map((r) => ({ ...r })),
  };
}

function relKey(from, to, kind) { return `${from}→${to}⟦${kind}⟧`; }

// 主校验入口：输入候选状态，输出 issues + 规范化时间线（canonical）
export function validateState(state) {
  const issues = [];
  const erasOnWall = [];
  for (const eraId of state.eras ?? []) {
    const era = ERA_MAP.get(eraId);
    if (!era) {
      issues.push(issue('era.unknown', 'error', eraId, `存在典册中没有的时代节点「${eraId}」。`, 'removeEra'));
      continue;
    }
    erasOnWall.push(era);
  }

  // 重复上墙
  const seenEra = new Set();
  for (const eraId of state.eras ?? []) {
    if (seenEra.has(eraId)) issues.push(issue('era.duplicate', 'warning', eraId, `「${ERA_MAP.get(eraId)?.name ?? eraId}」被重复挂上墙，已合并为一个展厅。`));
    seenEra.add(eraId);
  }

  // 时代顺序：以典册年代为准，用户的摆放顺序只影响「策展顺序」，不改写年份
  const eraOrder = new Map(erasOnWall.map((e, i) => [e.id, i]));
  const chronologically = [...erasOnWall].sort((a, b) => a.from - b.from);
  chronologically.forEach((era, chronoIndex) => {
    const userIndex = eraOrder.get(era.id);
    if (userIndex !== chronoIndex) {
      issues.push(issue('era.order', 'warning', era.id,
        `策展顺序把「${era.name}（${formatYear(era.from)}–${formatYear(era.to)}）」放在了年代更早的展厅之前；正式时间轴仍按年代排列，你的顺序另存为策展顺序。`));
    }
  });

  const placements = state.placements ?? {};
  const placedPeople = new Map(); // eraId -> [{ref, order}]
  const placedQuestions = new Map();

  for (const [refId, p] of Object.entries(placements)) {
    const person = PEOPLE_MAP.get(refId);
    const question = QUESTION_MAP.get(refId);
    if (!person && !question) {
      issues.push(issue('ref.unknown', 'error', refId, `节点「${refId}」不在典册之中，来源不可信。`, 'unplace'));
      continue;
    }
    const era = ERA_MAP.get(p.eraId);
    if (!era) {
      issues.push(issue('era.missing', 'error', refId,
        `「${person?.name ?? question?.label}」被挂入了一个不在墙上的展厅。`, 'unplace'));
      continue;
    }

    if (person) {
      // —— 年代硬校验 ——
      const overlaps = person.died >= era.from && person.born <= era.to;
      const { home, loans } = homeEraForPerson(person);
      if (!overlaps) {
        const homeEra = ERA_MAP.get(home);
        issues.push(issue('person.anachronism', 'error', refId,
          `「${person.name}（${formatYear(person.born)}–${formatYear(person.died)}）」的生命与「${era.name}（${formatYear(era.from)}–${formatYear(era.to)}）」没有任何重叠。其年代应属「${homeEra?.name ?? '—'}」。`,
          `place:${home}`));
      } else if (era.id !== home) {
        issues.push(issue('person.loan', 'warning', refId,
          `「${person.name}」以借展身份挂在「${era.name}」；他的主展厅是「${ERA_MAP.get(home)?.name}」${loans.length > 1 ? `，一生横跨 ${loans.length + 1} 个展厅` : ''}。`));
      }

      // —— 传统归属校验：与同展厅内多数传统不符时温和提示 ——
      if (!placedPeople.has(era.id)) placedPeople.set(era.id, []);
      placedPeople.get(era.id).push({ ref: person, order: p.order ?? 0 });
    } else {
      if (!placedQuestions.has(era.id)) placedQuestions.set(era.id, []);
      placedQuestions.get(era.id).push({ ref: question, order: p.order ?? 0 });
    }
  }

  // 每个展厅内：顺序重叠 + 典册定序
  const canonical = {};
  for (const era of erasOnWall) {
    const people = (placedPeople.get(era.id) ?? []).slice();
    const questions = (placedQuestions.get(era.id) ?? []).slice();

    // 同序节点：人物与问题分属两条悬挂带，各自独立编号检查
    const countOverlap = (items, label) => {
      const orderCount = new Map();
      for (const item of items) orderCount.set(item.order, (orderCount.get(item.order) ?? 0) + 1);
      for (const [, count] of orderCount) {
        if (count > 1) {
          issues.push(issue('order.overlap', 'warning', era.id,
            `「${era.name}」展厅的${label}带上有 ${count} 件作品挤在同一位置，已按${label === '人物' ? '生卒年代' : '典册次序'}自动错开，请确认策展顺序。`));
        }
      }
    };
    countOverlap(people, '人物');
    countOverlap(questions, '问题');

    const peopleSorted = people
      .map((entry, i) => ({ ...entry, userIndex: i }))
      .sort((a, b) => (a.order - b.order) || (a.ref.born - b.ref.born) || a.ref.id.localeCompare(b.ref.id));
    const questionsSorted = questions
      .sort((a, b) => (a.order - b.order) || a.ref.id.localeCompare(b.ref.id));

    canonical[era.id] = {
      people: peopleSorted.map((entry, canonIndex) => {
        const chronoFirst = [...peopleSorted].sort((a, b) => a.ref.born - b.ref.born)[0] === entry;
        const tradition = TRADITIONS[entry.ref.tradition];
        return {
          refId: entry.ref.id,
          name: entry.ref.name,
          years: `${formatYear(entry.ref.born)}–${formatYear(entry.ref.died)}`,
          born: entry.ref.born,
          tradition: traditionName(entry.ref.tradition),
          idea: entry.ref.idea,
          userOrder: entry.order,
          canonIndex,
          traditionFitsEra: tradition?.eras.includes(era.id) ?? false,
        };
      }),
      questions: questionsSorted.map((entry) => ({ refId: entry.ref.id, label: entry.ref.label, hint: entry.ref.hint })),
    };

    // 传统与展厅不符
    for (const row of canonical[era.id].people) {
      if (!row.traditionFitsEra) {
        issues.push(issue('tradition.mismatch', 'warning', row.refId,
          `「${row.name}」所属的${row.tradition}传统并非「${era.name}」的主流传统——也许这正是你想制造的对话？`));
      }
    }
  }

  // —— 关系校验 ——
  const relSeen = new Set();
  for (const r of state.relations ?? []) {
    const a = PEOPLE_MAP.get(r.from);
    const b = PEOPLE_MAP.get(r.to);
    if (!a || !b) {
      issues.push(issue('relation.unknown', 'error', `${r.from}→${r.to}`, '关系连接了典册之外的人物。', 'removeRelation'));
      continue;
    }
    const key = relKey(r.from, r.to, r.kind);
    if (relSeen.has(key)) {
      issues.push(issue('relation.duplicate', 'warning', key, `「${a.name}」与「${b.name}」的${r.kind}关系重复，已合并。`));
      continue;
    }
    relSeen.add(key);

    // 师承必须从先生者指向后学者；跨世纪的精神承继请用「心传/回响」
    if (r.kind === '师承' && a.born >= b.born) {
      issues.push(issue('relation.direction', 'error', key,
        `师承关系方向有误：${a.name}（生 ${formatYear(a.born)}）并不早于${b.name}（生 ${formatYear(b.born)}）。若想表达跨时代的精神接续，请改用「心传」。`,
        'relation:kind:心传'));
    }
    // 典册中本有关系：核对类型
    const catalogEntry = RELATION_MAP.get(`${r.from}→${r.to}`) || RELATION_MAP.get(`${r.to}→${r.from}`);
    if (catalogEntry && catalogEntry.kind !== r.kind) {
      issues.push(issue('relation.kind', 'warning', key,
        `典册将${a.name}与${b.name}的关系记作「${catalogEntry.kind}」，你标为「${r.kind}」——策展版本会保留你的标注，并附上典册来源。`));
    }
    if (!catalogEntry) {
      // 自创关系：记录为用户来源，并做合理性提示
      const gap = Math.abs(a.born - b.born);
      if (gap > 300 && !['心传', '回响', '再发现', '反叛', '激发'].includes(r.kind)) {
        issues.push(issue('relation.distant', 'warning', key,
          `${a.name}与${b.name}相距 ${gap} 年，「${r.kind}」更适合同代人；跨世纪的呼应可考虑「心传」或「回响」。`));
      }
    }
  }

  // 问题与人物的亲和性（仅提示，不阻止策展自由）
  for (const era of erasOnWall) {
    for (const q of canonical[era.id].questions) {
      const catalogQ = QUESTION_MAP.get(q.refId);
      const sameEraPeople = new Set(canonical[era.id].people.map((p) => p.refId));
      const friends = catalogQ.affinities.filter((id) => sameEraPeople.has(id));
      if (sameEraPeople.size > 0 && friends.length === 0) {
        issues.push(issue('question.affinity', 'warning', q.refId,
          `「${q.label}」挂在「${era.name}」，但典册中与它对话的思想家都不在这个展厅——问题允许漫游，这里会是一次别开生面的并置。`));
      }
    }
  }

  // 已在墙上的人物，其主展厅缺席 → 悬空提示
  for (const [refId, p] of Object.entries(placements)) {
    const person = PEOPLE_MAP.get(refId);
    if (!person) continue;
    const { home } = homeEraForPerson(person);
    if (!state.eras.includes(home)) {
      issues.push(issue('era.home-absent', 'warning', refId,
        `「${person.name}」的主展厅「${ERA_MAP.get(home)?.name}」尚未上墙，他目前以访客身份出现。`));
    }
  }

  const errors = issues.filter((i) => i.severity === 'error');
  return {
    valid: errors.length === 0,
    issues,
    canonical,
    eraChronology: chronologically.map((e) => e.id),
    stats: {
      eras: erasOnWall.length,
      people: placedPeople.size ? [...placedPeople.values()].reduce((n, l) => n + l.length, 0) : 0,
      questions: placedQuestions.size ? [...placedQuestions.values()].reduce((n, l) => n + l.length, 0) : 0,
      relations: (state.relations ?? []).length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
      errors: errors.length,
    },
  };
}

// 三路合并：base 为分叉点，server 为当前版本，client 为离线/并发期间的本地状态
// 返回 {state, conflicts[]}；冲突字段由调用方按策略裁决
export function threeWayMerge(base, server, client) {
  const conflicts = [];
  const merged = emptyState();

  // 标题
  if (server.title === client.title) merged.title = client.title;
  else if (server.title === base.title) merged.title = client.title;
  else if (client.title === base.title) merged.title = server.title;
  else {
    conflicts.push({ field: 'title', server: server.title, client: client.title });
    merged.title = server.title; // 占位，策略层覆盖
  }

  const mergeSet = (field) => {
    const b = new Set(base[field] ?? []);
    const s = new Set(server[field] ?? []);
    const c = new Set(client[field] ?? []);
    const out = [];
    const all = new Set([...s, ...c]);
    for (const item of all) {
      const inS = s.has(item);
      const inC = c.has(item);
      const inB = b.has(item);
      if (inS && inC) out.push(item);
      else if (!inS && !inC) { /* both removed */ }
      else if (inB) {
        // one removed, one kept
        conflicts.push({ field, item, server: inS, client: inC });
      } else {
        out.push(item); // one side added
      }
    }
    // 顺序：以服务端年代顺序重排 eras；relations 保持服务端顺序+客户端新增
    return out;
  };

  merged.eras = mergeSet('eras')
    .map((id) => ERA_MAP.get(id))
    .filter(Boolean)
    .sort((a, b) => a.from - b.from)
    .map((e) => e.id);

  // relations（对象集合）
  const keyOf = (r) => relKey(r.from, r.to, r.kind);
  const bRel = new Map((base.relations ?? []).map((r) => [keyOf(r), r]));
  const sRel = new Map((server.relations ?? []).map((r) => [keyOf(r), r]));
  const cRel = new Map((client.relations ?? []).map((r) => [keyOf(r), r]));
  for (const [key, r] of sRel) {
    if (cRel.has(key) || !bRel.has(key)) merged.relations.push(r);
  }
  for (const [key, r] of cRel) {
    if (sRel.has(key)) continue;
    if (!bRel.has(key)) merged.relations.push(r); // client added
    // if server deleted what base had and client kept → conflict
    if (bRel.has(key) && !sRel.has(key)) {
      conflicts.push({ field: 'relations', item: key, server: false, client: true });
    }
  }
  for (const [key] of bRel) {
    if (!sRel.has(key) && cRel.has(key)) {
      // already recorded above
    }
    if (sRel.has(key) && !cRel.has(key)) {
      conflicts.push({ field: 'relations', item: key, server: true, client: false });
      merged.relations.push(sRel.get(key));
    }
  }

  // placements 按键独立合并
  const keys = new Set([
    ...Object.keys(server.placements ?? {}),
    ...Object.keys(client.placements ?? {}),
  ]);
  for (const refId of keys) {
    const b = base.placements?.[refId] ? JSON.stringify(base.placements[refId]) : null;
    const s = server.placements?.[refId] ? JSON.stringify(server.placements[refId]) : null;
    const c = client.placements?.[refId] ? JSON.stringify(client.placements[refId]) : null;
    if (s === c) {
      if (s) merged.placements[refId] = JSON.parse(s);
    } else if (s === b) {
      if (c) merged.placements[refId] = JSON.parse(c);
    } else if (c === b) {
      if (s) merged.placements[refId] = JSON.parse(s);
    } else if (s === null || c === null) {
      conflicts.push({ field: 'placements', item: refId, server: s, client: c });
      if (s) merged.placements[refId] = JSON.parse(s);
    } else {
      conflicts.push({ field: 'placements', item: refId, server: JSON.parse(s), client: JSON.parse(c) });
      merged.placements[refId] = JSON.parse(s);
    }
  }

  return { state: merged, conflicts };
}
