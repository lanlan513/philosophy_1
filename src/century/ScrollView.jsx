import { ArrowDown, ArrowUp, ChevronDown, X } from 'lucide-react';
import { useMemo } from 'react';
import { formatYear } from './applyOps.js';

// 移动端「长卷」：放弃二维拖拽，变成一条从上往下阅读的展墙。
// 每件作品都有显式排序/移厅按钮——这不是拖拽的妥协，而是完整的可达交互。

export function ScrollView({ catalog, state, report, mutate, onOpenRelation }) {
  const eras = useMemo(
    () => state.eras.map((id) => catalog.eras.find((e) => e.id === id)).filter(Boolean).sort((a, b) => a.from - b.from),
    [state.eras, catalog],
  );
  const people = new Map(catalog.people.map((p) => [p.id, p]));
  const questions = new Map(catalog.questions.map((q) => [q.id, q]));

  const issueByRef = useMemo(() => {
    const m = new Map();
    for (const i of report?.issues ?? []) {
      if (!m.has(i.about)) m.set(i.about, []);
      m.get(i.about).push(i);
    }
    return m;
  }, [report]);

  if (eras.length === 0) {
    return <div className="scroll-empty"><p>长卷尚未展开。</p><p>请先在下方「时代节点」中点按「上墙」。</p></div>;
  }

  return (
    <div className="scroll-view">
      <div className="scroll-ruler" aria-hidden="true">
        {eras.map((era) => (
          <div key={era.id} className="scroll-tick" style={{ '--era-color': era.color }}>
            <span>{formatYear(era.from)}</span>
          </div>
        ))}
        <div className="scroll-tick"><span>今天</span></div>
      </div>

      {eras.map((era, eraIndex) => {
        const entries = Object.entries(state.placements).filter(([, p]) => p.eraId === era.id);
        const peopleList = entries.filter(([, p]) => p.lane === 'person').sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));
        const questionList = entries.filter(([, p]) => p.lane === 'question').sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));
        return (
          <section key={era.id} className="scroll-room" style={{ '--era-color': era.color }}>
            <header className="scroll-room-head">
              <span className="scroll-room-index">第 {eraIndex + 1} 厅</span>
              <h2>{era.name}</h2>
              <p>{era.en} · {formatYear(era.from)}–{formatYear(era.to)} · {era.region}</p>
              <p className="scroll-blurb">{era.blurb}</p>
              <button className="scroll-remove-era" onClick={() => mutate([{ op: 'removeEra', eraId: era.id }])}>
                <X size={12} /> 撤下此厅（作品回库房）
              </button>
            </header>

            <ol className="scroll-paintings">
              {peopleList.map(([refId, placement], row) => {
                const p = people.get(refId);
                const issues = issueByRef.get(refId) ?? [];
                return (
                  <li key={refId} className={`scroll-painting ${issues.some((i) => i.severity === 'error') ? 'has-error' : ''} ${issues.some((i) => i.severity === 'warning') ? 'has-warning' : ''}`}>
                    <div className="scroll-card">
                      <div className="scroll-card-meta">
                        <span>{formatYear(p.born)} — {formatYear(p.died)}</span>
                        <span>{catalog.traditions[p.tradition]?.name}</span>
                      </div>
                      <h3>{p.name} <small>{p.latin}</small></h3>
                      <p className="scroll-idea">{p.idea}</p>
                      <blockquote>“{p.quote}”</blockquote>
                      <IssueLines issues={issues} />
                      <div className="scroll-card-actions">
                        <button disabled={row === 0} onClick={() => mutate(reorderOps(state, refId, -1))} aria-label={`${p.name} 上移`}><ArrowUp size={14} /></button>
                        <button disabled={row === peopleList.length - 1} onClick={() => mutate(reorderOps(state, refId, 1))} aria-label={`${p.name} 下移`}><ArrowDown size={14} /></button>
                        <EraMoveSelect state={state} catalog={catalog} currentEra={era.id} eras={eras}
                          onChange={(eraId) => mutate([{ op: 'place', refId, eraId, order: nextOrder(state, eraId), lane: 'person' }])} />
                        <button className="scroll-unplace" onClick={() => mutate([{ op: 'unplace', refId }])}>取下</button>
                        <button className="scroll-relate" onClick={() => onOpenRelation?.(refId)}>连线</button>
                      </div>
                    </div>
                  </li>
                );
              })}
              {peopleList.length === 0 && <li className="scroll-empty-lane">这位思想家的位置还空着 —— 从库房挂入。</li>}
            </ol>

            {questionList.length > 0 && (
              <div className="scroll-questions">
                <h4>悬而未决</h4>
                {questionList.map(([refId]) => {
                  const q = questions.get(refId);
                  const issues = issueByRef.get(refId) ?? [];
                  return (
                    <div key={refId} className="scroll-q">
                      <strong>{q.label}</strong>
                      <span>{q.hint}</span>
                      <IssueLines issues={issues} compact />
                      <div className="scroll-card-actions">
                        <EraMoveSelect state={state} catalog={catalog} currentEra={era.id} eras={eras}
                          onChange={(eraId) => mutate([{ op: 'place', refId, eraId, order: nextOrder(state, eraId, 'question'), lane: 'question' }])} />
                        <button className="scroll-unplace" onClick={() => mutate([{ op: 'unplace', refId }])}>取下</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function IssueLines({ issues, compact }) {
  if (!issues?.length) return null;
  return (
    <ul className={`issue-lines ${compact ? 'is-compact' : ''}`}>
      {issues.map((i, n) => (
        <li key={n} className={`issue-${i.severity}`}>{i.severity === 'error' ? '⛔ ' : '注 · '}{i.message}</li>
      ))}
    </ul>
  );
}

function EraMoveSelect({ currentEra, eras, onChange }) {
  return (
    <label className="era-move-select">
          <span className="sr-only">移到展厅</span>
      <select value={currentEra} onChange={(e) => onChange(e.target.value)} aria-label="移到其它展厅">
        {eras.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
      <ChevronDown size={13} />
    </label>
  );
}

function reorderOps(state, refId, delta) {
  const current = state.placements[refId];
  const ids = Object.entries(state.placements)
    .filter(([, p]) => p.eraId === current.eraId && p.lane === current.lane)
    .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0)).map(([id]) => id);
  const i = ids.indexOf(refId);
  const j = i + delta;
  if (j < 0 || j >= ids.length) return [];
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids.map((id, order) => ({ op: 'place', refId: id, eraId: current.eraId, order, lane: current.lane }));
}

function nextOrder(state, eraId, lane = 'person') {
  const n = Object.values(state.placements).filter((p) => p.eraId === eraId && p.lane === lane).length;
  return n;
}
