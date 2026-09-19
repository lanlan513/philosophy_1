// 端到端边界情况测试（需服务端已在 BASE 运行）
const BASE = process.env.BASE || 'http://localhost:8080';
const TL = `test-${Date.now()}`;
let passed = 0, failed = 0;

function ok(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${extra}`); }
}
const put = (payload) => fetch(`${BASE}/api/timelines/${TL}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const get = (path = '') => fetch(`${BASE}/api/timelines/${TL}${path}`).then((r) => r.json());

const ERA = { id: 'e1', kind: 'era', refId: 'c19', year: 1850, parentId: null };
const NIETZSCHE = { id: 'p1', kind: 'philosopher', refId: 'nietzsche', year: 1880, parentId: 'e1' };

console.log(`时间线: ${TL}`);

// 1. 正常保存 + 车道布局（节点重叠 → 不同车道）
let r = await put({ baseVersion: 0, clientId: 'a', idempotencyKey: 't1', nodes: [
  ERA, NIETZSCHE,
  { id: 'p2', kind: 'philosopher', refId: 'marx', year: 1880, parentId: 'e1' },   // 同年 → 重叠
  { id: 'p3', kind: 'philosopher', refId: 'schopenhauer', year: 1855, parentId: null },
] });
ok('保存成功 v1', r.status === 200 && r.body.version === 1);
const lanes = r.body.layout.lanes;
ok('重叠节点分配到不同车道', new Set([lanes.p1, lanes.p2, lanes.p3]).size === 3, JSON.stringify(lanes));

// 2. 幂等重放
const again = await put({ baseVersion: 0, clientId: 'a', idempotencyKey: 't1', nodes: [] });
ok('幂等重放不产生新版本', again.status === 200 && again.body.version === 1 && again.body.idempotentReplay === true);

// 3. 旧版本覆盖 → 409
r = await put({ baseVersion: 0, clientId: 'a', idempotencyKey: 't2', nodes: [] });
ok('旧版本覆盖被拒绝(409)', r.status === 409 && r.body.error === 'VERSION_CONFLICT');
ok('409 返回服务器现状', Array.isArray(r.body.nodes) && r.body.nodes.length === 4);

// 4. 人物年代越界 → 422
r = await put({ baseVersion: 1, clientId: 'a', idempotencyKey: 't3', nodes: [{ id: 'x', kind: 'philosopher', refId: 'kant', year: 1500, parentId: null }] });
ok('人物年代越界被拒绝(422)', r.status === 422 && r.body.issues.some((i) => i.code === 'LIFESPAN' || i.code === 'LIFESPAN'));

// 5. 时代归属错误 → 422；传统不符 → warning
r = await put({ baseVersion: 1, clientId: 'a', idempotencyKey: 't4', nodes: [
  { id: 'e2', kind: 'era', refId: 'medieval', year: 800, parentId: null },
  { id: 'p9', kind: 'philosopher', refId: 'kant', year: 1750, parentId: 'e2' },
] });
ok('生平与时代不相交被拒绝(422)', r.status === 422 && r.body.issues.some((i) => i.code === 'ERA_LIFESPAN'));
r = await put({ baseVersion: 1, clientId: 'a', idempotencyKey: 't5', nodes: [
  { id: 'e3', kind: 'era', refId: 'c19', year: 1850, parentId: null },
  { id: 'p10', kind: 'philosopher', refId: 'russell', year: 1890, parentId: 'e3' },
] });
ok('传统不符仅警告不拦截', r.status === 200 && r.body.warnings.some((w) => w.code === 'TRADITION'));

// 6. 节点关系：环 / 问题下挂子节点 / 重复展品
r = await put({ baseVersion: 2, clientId: 'a', idempotencyKey: 't6', nodes: [
  { id: 'a1', kind: 'philosopher', refId: 'hume', year: 1750, parentId: 'a2' },
  { id: 'a2', kind: 'philosopher', refId: 'kant', year: 1760, parentId: 'a1' },
] });
ok('关系成环被拒绝(422)', r.status === 422 && r.body.issues.some((i) => i.code === 'CYCLE'));
r = await put({ baseVersion: 2, clientId: 'a', idempotencyKey: 't7', nodes: [
  { id: 'b1', kind: 'question', refId: 'q-time', year: 1750, parentId: null },
  { id: 'b2', kind: 'philosopher', refId: 'kant', year: 1760, parentId: 'b1' },
] });
ok('问题下挂子节点被拒绝(422)', r.status === 422 && r.body.issues.some((i) => i.code === 'PARENT_KIND'));
r = await put({ baseVersion: 2, clientId: 'a', idempotencyKey: 't8', nodes: [
  { id: 'c1', kind: 'philosopher', refId: 'kant', year: 1760, parentId: null },
  { id: 'c2', kind: 'philosopher', refId: 'kant', year: 1770, parentId: null },
] });
ok('重复展品被拒绝(422)', r.status === 422 && r.body.issues.some((i) => i.code === 'DUP_REF'));

// 7. 离线后重新合并（rebase 三方合并）
//    服务器在 v2 上由 B 新增一个问题 → v3；A 仍基于 v2 离线修改 → rebase
r = await put({ baseVersion: 2, clientId: 'b', idempotencyKey: 't9', nodes: [
  { id: 'e3', kind: 'era', refId: 'c19', year: 1850, parentId: null },
  { id: 'p10', kind: 'philosopher', refId: 'russell', year: 1890, parentId: 'e3' },
  { id: 'q1', kind: 'question', refId: 'q-language', year: 1895, parentId: 'p10' },
] });
ok('B 保存到 v3', r.status === 200 && r.body.version === 3);
r = await put({ baseVersion: 2, clientId: 'a', strategy: 'rebase', idempotencyKey: 't10', nodes: [
  { id: 'e3', kind: 'era', refId: 'c19', year: 1840, parentId: null },          // A 移动了时代锚点
  { id: 'p10', kind: 'philosopher', refId: 'russell', year: 1890, parentId: 'e3' },
  { id: 'n1', kind: 'philosopher', refId: 'nietzsche', year: 1880, parentId: 'e3' }, // A 离线新增
] });
ok('离线重合并成功', r.status === 200 && r.body.version === 4 && r.body.merged);
const refs = r.body.nodes.map((n) => n.refId).sort();
ok('合并保留双方修改', refs.includes('nietzsche') && refs.includes('q-language'), refs.join(','));
ok('合并后重新下发车道布局', r.body.layout && typeof r.body.layout.lanes === 'object');

// 8. 合并冲突：双方都改同一节点 → 记录冲突
r = await put({ baseVersion: 4, clientId: 'b', idempotencyKey: 't11', nodes: r.body.nodes.map((n) => n.id === 'n1' ? { ...n, year: 1885 } : n) });
const cur = await get();
r = await put({ baseVersion: 4, clientId: 'a', strategy: 'rebase', idempotencyKey: 't12', nodes: cur.nodes.map((n) => n.id === 'n1' ? { ...n, year: 1870 } : n).filter((n) => n.id !== 'q1') });
ok('双方改同一节点产生冲突记录', r.status === 200 && r.body.merged.conflicts.length >= 1, JSON.stringify(r.body.merged?.conflicts));

// 9. 基线过旧 → BASE_UNKNOWN（构造：history 上限外不存在，这里用负数版本模拟）
r = await put({ baseVersion: 999, clientId: 'a', strategy: 'rebase', idempotencyKey: 't13', nodes: [] });
ok('未知基线返回 409 BASE_UNKNOWN', r.status === 409 && r.body.error === 'BASE_UNKNOWN');

// 10. 服务端预览兜底 + 版本历史
const prev = await get('/preview');
ok('服务端预览可用', Array.isArray(prev.sections) && prev.sections.length > 0);
const vers = await get('/versions');
ok('版本历史可追溯', vers.versions.length >= 3);

console.log(`\n${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
