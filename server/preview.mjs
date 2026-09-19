// 思想年代 · 展览预览生成
// 预览是独立的一步：保存（写版本）与预览（渲染墙签）分开，
// 因此允许出现「版本已安全入库、但本次渲染暂时失败」的真实状态。

import {
  ERAS, ERA_MAP, PEOPLE_MAP, QUESTION_MAP, RELATIONS,
  homeEraForPerson, formatYear,
} from './catalog.mjs';
import { validateState } from './validate.mjs';

function eraHomeMap() {
  const m = new Map();
  for (const p of Object.values(Object.fromEntries(PEOPLE_MAP))) {
    const { home } = homeEraForPerson(p);
    if (!m.has(home)) m.set(home, []);
    m.get(home).push(p);
  }
  return m;
}

// 生成一份可阅读的展览预览；renderedAt 由服务端时钟给出
export function renderPreview(state, meta) {
  const report = validateState(state);
  const eras = (state.eras ?? [])
    .map((id) => ERA_MAP.get(id))
    .filter(Boolean)
    .sort((a, b) => a.from - b.from);

  const rooms = eras.map((era, roomIndex) => {
    const row = report.canonical[era.id] ?? { people: [], questions: [] };
    const paintings = row.people.map((p, i) => {
      const person = PEOPLE_MAP.get(p.refId);
      const loan = homeEraForPerson(person).home !== era.id;
      return {
        index: i + 1,
        name: p.name,
        latin: person.latin,
        label: `${formatYear(person.born)} — ${formatYear(person.died)}`,
        tradition: p.tradition,
        idea: p.idea,
        quote: person.quote,
        note: person.note,
        onLoan: loan,
      };
    });
    const questions = row.questions.map((q) => ({ label: q.label, hint: q.hint }));
    return {
      index: roomIndex + 1,
      eraId: era.id,
      name: era.name,
      en: era.en,
      years: `${formatYear(era.from)} — ${formatYear(era.to)}`,
      region: era.region,
      blurb: era.blurb,
      wallText: composeWallText(era, paintings, questions),
      paintings,
      questions,
    };
  });

  // 弧线目录：只描述两个端点都在墙上的关系
  const placed = new Set(Object.keys(state.placements ?? {}));
  const arcs = (state.relations ?? [])
    .filter((r) => placed.has(r.from) && placed.has(r.to))
    .map((r) => {
      const a = PEOPLE_MAP.get(r.from);
      const b = PEOPLE_MAP.get(r.to);
      const canonical = RELATIONS.find((x) =>
        (x.from === r.from && x.to === r.to) || (x.from === r.to && x.to === r.from));
      return {
        from: a.name, to: b.name, kind: r.kind,
        source: canonical ? '典册' : '策展人自撰',
        catalogKind: canonical && canonical.kind !== r.kind ? canonical.kind : null,
      };
    });

  const warnings = report.issues.filter((i) => i.severity === 'warning');
  const title = state.title || '未命名的思想年代';

  return {
    title,
    subtitle: `策展版本 v${meta.version} · ${new Date(meta.at).toLocaleString('zh-CN', { hour12: false })} · 编号 ${meta.versionId.slice(0, 8)}`,
    synopsis: composeSynopsis(eras, rooms, arcs.length),
    rooms,
    arcs,
    curatorNotes: warnings.map((w) => w.message),
    colophon: `本展共 ${report.stats.eras} 个展厅、${report.stats.people} 位思想家、${report.stats.questions} 个问题、${arcs.length} 条弧线。时间顺序由档案馆依据典册年份裁定，策展顺序单独保留。`,
    renderedAt: new Date(meta.at).toISOString(),
  };
}

function composeWallText(era, paintings, questions) {
  if (paintings.length === 0 && questions.length === 0) {
    return `这是一间尚在布展的展厅。${era.blurb}`;
  }
  const names = paintings.map((p) => p.name).join('、') || '——';
  const qText = questions.length ? `墙上另悬问题 ${questions.map((q) => `「${q.label}」`).join('、')}，供观者在画前停留。` : '';
  return `${era.blurb} 本厅依年代次序悬挂 ${paintings.length} 件作品：${names}。${qText}`;
}

function composeSynopsis(eras, rooms, arcCount) {
  if (eras.length === 0) return '你的展厅还是空的。从左侧把时代节点拖上墙，开始策展。';
  const span = `${formatYear(eras[0].from)} 到 ${formatYear(eras[eras.length - 1].to)}`;
  return `这是一条横跨 ${span} 的私人思想长卷，由 ${eras.length} 个展厅接续而成。观者将依次走过${eras.map((e) => `「${e.name}」`).join('、')}；${arcCount} 条标注了来源的弧线，把相隔世纪的对话显影出来。`;
}
