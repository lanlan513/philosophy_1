import { useMemo, useState } from 'react';
import { X } from 'lucide-react';

const KINDS = ['师承', '承继', '对话', '论敌', '评注', '再发现', '传播', '敬重', '惊醒', '反叛', '回响', '激发', '心传'];

export function RelationEditor({ catalog, state, mutate, openRefId, onClose }) {
  const people = useMemo(() => new Map(catalog.people.map((p) => [p.id, p])), [catalog]);
  const person = people.get(openRefId);
  const [target, setTarget] = useState('');
  const [kind, setKind] = useState('师承');

  if (!person) return null;
  const placed = new Set(Object.keys(state.placements ?? {}));
  const outgoing = state.relations.filter((r) => r.from === person.id || r.to === person.id);
  const catalogRelations = catalog.relations.filter((r) => r.from === person.id || r.to === person.id);

  function add() {
    if (!target) return;
    mutate([{ op: 'addRelation', from: person.id, to: target, kind }]);
    setTarget('');
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal relation-modal" role="dialog" aria-modal="true" aria-label={`${person.name} 的关系弧线`}>
        <header>
          <div className="kicker">RELATIONS / ARCS</div>
          <h2>{person.name} 的弧线</h2>
          <button className="modal-x" onClick={onClose} aria-label="关闭"><X size={16} /></button>
        </header>

        <div className="relation-add">
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="关系类型">
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="选择另一位思想家">
            <option value="">选择另一位思想家…</option>
            {catalog.people.filter((p) => p.id !== person.id).map((p) => (
              <option key={p.id} value={p.id}>{p.name}（{p.latin}）</option>
            ))}
          </select>
          <button className="solid-button" disabled={!target} onClick={add}>画上弧线</button>
        </div>

        <ul className="relation-list">
          {outgoing.map((r, i) => {
            const other = people.get(r.from === person.id ? r.to : r.from);
            const direction = r.from === person.id ? '→' : '←';
            const catalogEntry = catalogRelations.find((x) =>
              (x.from === r.from && x.to === r.to) || (x.from === r.to && x.to === r.from));
            const onWall = placed.has(other.id);
            return (
              <li key={i} className={onWall ? '' : 'is-offwall'}>
                <span className="rel-kind">{r.kind}</span>
                <span className="rel-direction">{direction}</span>
                <b>{other.name}</b>
                <small>{other.latin}</small>
                <span className="rel-source">
                  {catalogEntry
                    ? <>典册来源：{catalogEntry.kind}{catalogEntry.kind !== r.kind && <em>（你的标注与之不同，会并陈）</em>}</>
                    : <em>策展人自撰</em>}
                  {!onWall && <em className="offwall-flag">· 对方尚未上墙，弧线暂不显示</em>}
                </span>
                <button className="link-button danger" onClick={() => mutate([{ op: 'removeRelation', from: r.from, to: r.to, kind: r.kind }])}>移除</button>
              </li>
            );
          })}
          {outgoing.length === 0 && <li className="relation-empty">还没有弧线。典册中与{person.name}相关的线索会在你保存后自动核对。</li>}
        </ul>

        <details className="catalog-hints">
          <summary>典册中与 TA 相关的记载（{catalogRelations.length}）</summary>
          <ul>
            {catalogRelations.map((r, i) => {
              const other = people.get(r.from === person.id ? r.to : r.from);
              const added = outgoing.some((o) =>
                (o.from === r.from && o.to === r.to) || (o.from === r.to && o.to === r.from));
              return (
                <li key={i}>
                  {r.from === person.id ? `${person.name} —${r.kind}→ ${other.name}` : `${other.name} —${r.kind}→ ${person.name}`}
                  {added ? <span className="hint-added">已采用</span> : (
                    <button className="link-button" onClick={() => mutate([{ op: 'addRelation', from: r.from, to: r.to, kind: r.kind }])}>采用</button>
                  )}
                </li>
              );
            })}
            {catalogRelations.length === 0 && <li>典册暂无收录——欢迎自撰跨时空对话。</li>}
          </ul>
        </details>
      </div>
    </div>
  );
}
