import { useMemo, useState } from 'react';
import { Frame, HelpCircle, Landmark, Search, User } from 'lucide-react';
import { formatYear, homeEraForPerson } from './applyOps.js';

// 「库房」：还没上墙的时代、哲学家与问题。
// 桌面端是拖拽源；每一件作品同时提供按钮式操作（键盘/触屏的可达替代）。

export function Palette({ catalog, state, mutate, onPickTarget }) {
  const [tab, setTab] = useState('people');
  const [query, setQuery] = useState('');

  const placed = new Set(Object.keys(state.placements));
  const erasOnWall = new Set(state.eras);

  const people = useMemo(() => catalog.people.filter((p) => !placed.has(p.id)), [catalog.people, placed]);
  const questions = catalog.questions.filter((q) => !placed.has(q.id));
  const eras = catalog.eras.filter((e) => !erasOnWall.has(e.id));

  const q = query.trim().toLowerCase();
  const filteredPeople = people.filter((p) =>
    !q || [p.name, p.latin, p.idea, catalog.traditions[p.tradition]?.name].join(' ').toLowerCase().includes(q));

  function dragStart(e, payload) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-century', JSON.stringify(payload));
    e.dataTransfer.setData('text/plain', payload.refId ?? payload.eraId);
  }

  return (
    <aside className="palette" aria-label="库房：可拖上展墙的素材">
      <div className="palette-head">
        <span className="kicker">THE STOREROOM</span>
        <h3>库房</h3>
        <p>把藏品拖到上方展厅；或使用「挂墙」按钮选择位置。时间归属由档案馆裁定。</p>
      </div>

      <section className="palette-section">
        <h4><Landmark size={13} /> 时代节点 <em>{catalog.eras.filter((e) => state.eras.includes(e.id)).length}/{catalog.eras.length}</em></h4>
        <div className="era-rack">
          {eras.length === 0 && <p className="rack-empty">六个时代节点都已在墙上。</p>}
          {eras.map((era) => (
            <div key={era.id} className="rack-era" draggable
              onDragStart={(e) => dragStart(e, { kind: 'era', eraId: era.id })}
              onDragEnd={(e) => e.dataTransfer.clearData()}>
              <span className="era-swatch" style={{ background: era.color }} />
              <div>
                <b>{era.name}</b>
                <small>{formatYear(era.from)}–{formatYear(era.to)} · {era.region}</small>
              </div>
              <button className="rack-action" onClick={() => mutate([{ op: 'addEra', eraId: era.id }])}>上墙</button>
            </div>
          ))}
        </div>
      </section>

      <div className="palette-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'people'} className={tab === 'people' ? 'is-active' : ''} onClick={() => setTab('people')}><User size={13} />哲学家</button>
        <button role="tab" aria-selected={tab === 'questions'} className={tab === 'questions' ? 'is-active' : ''} onClick={() => setTab('questions')}><HelpCircle size={13} />核心问题</button>
      </div>

      {tab === 'people' && (
        <div className="palette-search">
          <Search size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索名字 / 传统 / 命题" aria-label="搜索库房中的哲学家" />
        </div>
      )}

      {tab === 'people' ? (
        <div className="rack-list">
          {filteredPeople.map((p) => {
            const { home, loans } = homeEraForPerson(p, catalog.eras);
            const homeEra = catalog.eras.find((e) => e.id === home);
            const wallable = state.eras.filter((id) => p.died >= catalog.eras.find((e) => e.id === id).from && p.born <= catalog.eras.find((e) => e.id === id).to);
            return (
              <div key={p.id} className="rack-person" draggable
                onDragStart={(e) => dragStart(e, { kind: 'place', refId: p.id, lane: 'person' })}>
                <div className="rack-person-main">
                  <b>{p.name}</b>
                  <small>{p.latin} · {formatYear(p.born)}–{formatYear(p.died)}</small>
                  <span className="rack-tag">{catalog.traditions[p.tradition]?.name}</span>
                  <span className="rack-home">典册归属：{homeEra?.name}{loans.length > 0 ? `（横跨 ${loans.length + 1} 厅）` : ''}</span>
                </div>
                <button className="rack-action" disabled={wallable.length === 0}
                  title={wallable.length === 0 ? '先把其所属时代挂上墙' : '选择展厅挂墙'}
                  onClick={() => onPickTarget({ kind: 'person', refId: p.id, wallable })}>挂墙</button>
              </div>
            );
          })}
          {filteredPeople.length === 0 && <p className="rack-empty">库房里没有匹配的哲学家。</p>}
        </div>
      ) : (
        <div className="rack-list">
          {questions.map((q) => (
            <div key={q.id} className="rack-question" draggable
              onDragStart={(e) => dragStart(e, { kind: 'place', refId: q.id, lane: 'question' })}>
              <div className="rack-person-main">
                <b>{q.label}</b>
                <small>{q.hint}</small>
              </div>
              <button className="rack-action" disabled={state.eras.length === 0}
                title={state.eras.length === 0 ? '先挂上至少一个时代' : '选择展厅'}
                onClick={() => onPickTarget({ kind: 'question', refId: q.id, wallable: state.eras })}>悬挂</button>
            </div>
          ))}
        </div>
      )}

      <p className="palette-foot"><Frame size={12} /> 拖放与按钮等价；键盘聚焦卡片后可用 ↑↓ 排序、Alt+←→ 换厅。</p>
    </aside>
  );
}
