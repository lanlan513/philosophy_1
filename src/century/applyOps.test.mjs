import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOps, emptyState, moveItem, nudgeItem } from './applyOps.js';

// 复用服务端典册的形状构造最小 catalog（客户端只需要只读引用表）
const eras = [
  { id: 'a', from: -600, to: -200 },
  { id: 'b', from: -200, to: 400 },
];
const people = [
  { id: 'p1', born: -500, died: -420 },
  { id: 'p2', born: -460, died: -380 },
  { id: 'p3', born: -300, died: -240 },
];
const questions = [{ id: 'q1' }];
const catalog = { eras, people, questions };

function seed() {
  return applyOps(emptyState(), [
    { op: 'addEra', eraId: 'a' },
    { op: 'place', refId: 'p1', eraId: 'a', order: 0 },
    { op: 'place', refId: 'p2', eraId: 'a', order: 1 },
  ], catalog);
}

test('未知人物/展厅/关系类型在客户端入口即被拒收（白名单镜像服务端）', () => {
  let s = applyOps(seed(), [{ op: 'place', refId: 'ghost', eraId: 'a', order: 0 }], catalog);
  assert.equal(s.placements.ghost, undefined);
  s = applyOps(seed(), [{ op: 'place', refId: 'p1', eraId: 'zzz', order: 0 }], catalog);
  assert.equal(s.placements.p1.eraId, 'a');
  s = applyOps(seed(), [{ op: 'addRelation', from: 'p1', to: 'p2', kind: '不存在的关系' }], catalog);
  assert.equal(s.relations.length, 0);
});

test('moveItem 跨展厅重排并连续编号，杜绝同序重叠', () => {
  let s = seed();
  s = applyOps(s, [{ op: 'addEra', eraId: 'b' }], catalog);
  const next = moveItem(s, 'p2', 'b', null);
  assert.equal(next.p2.eraId, 'b');
  assert.deepEqual([next.p1.order], [0]);
  assert.equal(next.p2.order, 0);
});

test('moveItem 在同展厅内插入到目标之前，后续顺序顺延', () => {
  const s = applyOps(seed(), [{ op: 'place', refId: 'p3', eraId: 'a', order: 2 }], catalog);
  const next = moveItem(s, 'p3', 'a', 'p1');
  assert.deepEqual(
    Object.entries(next).sort((a, b) => a[1].order - b[1].order).map(([id]) => id),
    ['p3', 'p1', 'p2'],
  );
  assert.deepEqual([0, 1, 2], Object.values(next).map((p) => p.order).sort((x, y) => x - y));
});

test('nudgeItem 边界处不越界', () => {
  const s = seed();
  assert.equal(nudgeItem(s, 'p1', -1), s.placements);
  const down = nudgeItem(s, 'p1', 1);
  assert.deepEqual(
    Object.entries(down).sort((a, b) => a[1].order - b[1].order).map(([id]) => id),
    ['p2', 'p1'],
  );
});

test('撤下展厅把作品送回库房', () => {
  const s = applyOps(seed(), [{ op: 'removeEra', eraId: 'a' }], catalog);
  assert.deepEqual(s.eras, []);
  assert.deepEqual(s.placements, {});
});

test('重复关系不会重复入列；removeRelation 精确匹配类型', () => {
  let s = applyOps(seed(), [{ op: 'addRelation', from: 'p1', to: 'p2', kind: '对话' }], catalog);
  s = applyOps(s, [{ op: 'addRelation', from: 'p1', to: 'p2', kind: '对话' }], catalog);
  assert.equal(s.relations.length, 1);
  s = applyOps(s, [{ op: 'addRelation', from: 'p1', to: 'p2', kind: '师承' }], catalog);
  assert.equal(s.relations.length, 2);
  s = applyOps(s, [{ op: 'removeRelation', from: 'p1', to: 'p2', kind: '师承' }], catalog);
  assert.equal(s.relations.length, 1);
  assert.equal(s.relations[0].kind, '对话');
});
