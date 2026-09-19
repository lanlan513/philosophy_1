import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOps, validateState, emptyState, threeWayMerge } from './validate.mjs';
import { renderPreview } from './preview.mjs';

function build(ops) {
  return applyOps(emptyState(), [
    { op: 'title', title: '测试展' },
    ...ops,
  ]);
}

test('典册年代：人物挂入无重叠的展厅属于硬错误', () => {
  // 孔子（前551–前479）挂进「信仰时代」（400–1300）
  const state = build([
    { op: 'addEra', eraId: 'faith' },
    { op: 'place', refId: 'confucius', eraId: 'faith', order: 0 },
  ]);
  const report = validateState(state);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((i) => i.code === 'person.anachronism' && i.severity === 'error'));
});

test('借展：生命横跨相邻展厅只警告不拒绝', () => {
  // 康德 1724–1804：生命中点 1764 落在理性时代（主展厅），但一生跨入现代纪元。
  // 把他挂进「现代纪元」是合法的借展：年代重叠，只给 warning。
  const state = build([
    { op: 'addEra', eraId: 'modern' },
    { op: 'place', refId: 'kant', eraId: 'modern', order: 0 },
  ]);
  const report = validateState(state);
  assert.equal(report.valid, true);
  assert.ok(report.issues.some((i) => i.code === 'person.loan'));
});

test('策展顺序不能改写年代顺序', () => {
  const state = build([
    { op: 'addEra', eraId: 'contemporary' },
    { op: 'addEra', eraId: 'axial' },
  ]);
  const report = validateState(state);
  assert.deepEqual(report.eraChronology, ['axial', 'contemporary']);
  assert.ok(report.issues.some((i) => i.code === 'era.order'));
});

test('师承方向错误是硬错误，并给出心传建议', () => {
  const state = build([
    { op: 'addRelation', from: 'kant', to: 'hume', kind: '师承' },
  ]);
  const report = validateState(state);
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((i) => i.code === 'relation.direction'));
});

test('未知人物与未知关系一律拒绝', () => {
  // applyOps 会在入口拒收未知引用；validateState 也必须独立拦截脏状态（防御深度）
  const state = {
    title: '测试展',
    eras: ['axial'],
    placements: { nobody: { eraId: 'axial', order: 0, lane: 'person' } },
    relations: [{ from: 'nobody', to: 'plato', kind: '师承' }],
  };
  const report = validateState(state);
  assert.ok(report.issues.some((i) => i.code === 'ref.unknown'));
  assert.ok(report.issues.some((i) => i.code === 'relation.unknown'));
});

test('同序重叠产生警告，规范顺序以生年裁决', () => {
  const state = build([
    { op: 'addEra', eraId: 'axial' },
    { op: 'place', refId: 'plato', eraId: 'axial', order: 3 },
    { op: 'place', refId: 'socrates', eraId: 'axial', order: 3 },
  ]);
  const report = validateState(state);
  assert.ok(report.issues.some((i) => i.code === 'order.overlap'));
  assert.deepEqual(
    report.canonical.axial.people.map((p) => p.refId),
    ['socrates', 'plato'],
  );
});

test('撤下展厅把作品送回库房而不是删除', () => {
  let state = build([
    { op: 'addEra', eraId: 'axial' },
    { op: 'place', refId: 'confucius', eraId: 'axial', order: 0 },
  ]);
  state = applyOps(state, [{ op: 'removeEra', eraId: 'axial' }]);
  assert.deepEqual(state.eras, []);
  assert.deepEqual(state.placements, {});
});

test('三路合并：双方编辑不同字段自动合并，无需用户介入', () => {
  const base = build([
    { op: 'addEra', eraId: 'axial' },
    { op: 'place', refId: 'confucius', eraId: 'axial', order: 0 },
  ]);
  const serverState = applyOps(base, [
    { op: 'addEra', eraId: 'classical' },
  ]);
  const clientState = applyOps(base, [
    { op: 'place', refId: 'socrates', eraId: 'axial', order: 1 },
  ]);
  const { state: merged, conflicts } = threeWayMerge(base, serverState, clientState);
  assert.deepEqual(merged.eras.sort(), ['axial', 'classical']);
  assert.ok(merged.placements.confucius);
  assert.ok(merged.placements.socrates);
  assert.equal(conflicts.length, 0);
});

test('三路合并：同一节点各挂一处 → 冲突上报', () => {
  const base = build([
    { op: 'addEra', eraId: 'axial' },
    { op: 'addEra', eraId: 'classical' },
    { op: 'place', refId: 'plato', eraId: 'axial', order: 0 },
  ]);
  const serverState = applyOps(base, [{ op: 'place', refId: 'plato', eraId: 'classical', order: 0 }]);
  const clientState = applyOps(base, [{ op: 'place', refId: 'plato', eraId: 'axial', order: 5 }]);
  const { conflicts } = threeWayMerge(base, serverState, clientState);
  assert.ok(conflicts.some((c) => c.field === 'placements' && c.item === 'plato'));
});

test('三路合并：一方删、另一方保留 → 删除/保留冲突', () => {
  const base = build([
    { op: 'addEra', eraId: 'axial' },
    { op: 'place', refId: 'confucius', eraId: 'axial', order: 0 },
  ]);
  const serverState = applyOps(base, [{ op: 'unplace', refId: 'confucius' }]);
  const clientState = applyOps(base, [{ op: 'place', refId: 'confucius', eraId: 'axial', order: 9 }]);
  const { conflicts } = threeWayMerge(base, serverState, clientState);
  assert.ok(conflicts.some((c) => c.field === 'placements' && c.item === 'confucius'));
});

test('预览：康德以借展身份挂在现代，策展注记如实记录', () => {
  const state = build([
    { op: 'addEra', eraId: 'modern' },
    { op: 'place', refId: 'kant', eraId: 'modern', order: 0 },
  ]);
  const preview = renderPreview(state, { version: 3, versionId: 'abcdefgh', at: new Date('2026-09-18T10:00:00Z') });
  assert.match(preview.subtitle, /v3/);
  assert.equal(preview.rooms.length, 1);
  assert.match(preview.rooms[0].wallText, /康德/);
  assert.ok(preview.curatorNotes.some((n) => n.includes('借展')));
  assert.ok(preview.colophon.includes('展厅'));
});
