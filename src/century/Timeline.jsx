import { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { formatYear, homeEraForPerson, moveItem, nudgeItem } from './applyOps.js';

// 桌面端「展墙」：SVG 负责年份轴、展厅色带与关系弧线；
// HTML 卡片负责内容、拖拽焦点与可达操作。两层共用同一套列宽度量。

const COL_WIDTH = 264;
const COL_GAP = 26;
const AXIS_H = 92;
const CARD_W = 224;
const CARD_H = 118;
const Q_CARD_H = 78;
const LANE_GAP = 28;

export function Timeline({ catalog, state, report, mutate, onOpenRelation }) {
  const wallRef = useRef(null);
  const [drag, setDrag] = useState(null); // {refId}
  const [dropHint, setDropHint] = useState(null); // {eraId, beforeRefId, lane}
  const [focused, setFocused] = useState(null);

  const eras = useMemo(
    () => state.eras.map((id) => catalog.eras.find((e) => e.id === id)).filter(Boolean)
      .sort((a, b) => a.from - b.from),
    [state.eras, catalog],
  );

  const peopleById = useMemo(() => new Map(catalog.people.map((p) => [p.id, p])), [catalog]);
  const questionById = useMemo(() => new Map(catalog.questions.map((q) => [q.id, q])), [catalog]);

  // 每个展厅按 order 排列（本地顺序；正式顺序由服务端 canonical 裁决并在问题面板提示）
  const lanes = useMemo(() => {
    const out = {};
    for (const era of eras) {
      const entries = Object.entries(state.placements).filter(([, p]) => p.eraId === era.id);
      out[era.id] = {
        person: entries.filter(([, p]) => p.lane === 'person').sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0)).map(([id]) => id),
        question: entries.filter(([, p]) => p.lane === 'question').sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0)).map(([id]) => id),
      };
    }
    return out;
  }, [state.placements, eras]);

  const laneHeight = (ids, isQ) => Math.max(260, ids.length * (isQ ? Q_CARD_H : CARD_H) + (ids.length - 1) * 14 + 80);
  const wallW = eras.length * (COL_WIDTH + COL_GAP) + 40;
  const peopleLaneH = Math.max(260, ...eras.map((e) => laneHeight(lanes[e.id]?.person ?? [], false)));
  const questionLaneH = Math.max(150, ...eras.map((e) => laneHeight(lanes[e.id]?.question ?? [], true)));
  const wallH = AXIS_H + peopleLaneH + LANE_GAP + questionLaneH + 120;

  function colX(i) { return 24 + i * (COL_WIDTH + COL_GAP); }

  function cardCenter(refId) {
    const p = state.placements[refId];
    if (!p) return null;
    const col = eras.findIndex((e) => e.id === p.eraId);
    if (col < 0) return null;
    const ids = lanes[p.eraId]?.[p.lane] ?? [];
    const row = ids.indexOf(refId);
    const x = colX(col) + COL_WIDTH / 2;
    const y = AXIS_H + (p.lane === 'question' ? peopleLaneH + LANE_GAP : 0)
      + row * ((p.lane === 'question' ? Q_CARD_H : CARD_H) + 14)
      + (p.lane === 'question' ? Q_CARD_H : CARD_H) / 2;
    return { x, y, lane: p.lane };
  }

  function commitDrop(refId, eraId, beforeRefId, e) {
    const isPerson = peopleById.has(refId);
    const isQuestion = questionById.has(refId);
    const existing = state.placements[refId];

    // 新挂墙：库房 → 展厅
    if (!existing && (isPerson || isQuestion)) {
      const lane = isPerson ? 'person' : 'question';
      const groupIds = Object.entries(state.placements)
        .filter(([, p]) => p.eraId === eraId && p.lane === lane)
        .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0)).map(([id]) => id);
      let index = beforeRefId ? groupIds.indexOf(beforeRefId) : groupIds.length;
      if (index < 0) index = groupIds.length;
      groupIds.splice(index, 0, refId);
      const ops = [{ op: 'place', refId, eraId, order: index, lane }];
      // 之后的节点顺延
      groupIds.forEach((id, i) => { if (id !== refId && i >= index) ops.push({ op: 'place', refId: id, eraId, order: i, lane }); });
      mutate(ops);
      setDrag(null); setDropHint(null);
      return;
    }

    const nextPlacements = moveItem(state, refId, eraId, beforeRefId);
    // moveItem 返回重排后的完整 placements；仅把真正变化的节点作为 op 提交
    mutate(() => {
      const list = [];
      for (const [id, p] of Object.entries(nextPlacements)) {
        if (JSON.stringify(state.placements[id] ?? null) !== JSON.stringify(p)) {
          list.push({ op: 'place', refId: id, eraId: p.eraId, order: p.order, lane: p.lane });
        }
      }
      return list;
    });
    setDrag(null);
    setDropHint(null);
  }

  function handleDragStart(refId, e) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', refId);
    setDrag({ refId });
  }
  function handleCardDragOver(eraId, beforeRefId, lane, e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropHint({ eraId, beforeRefId, lane });
  }
  function handleColumnDragOver(eraId, lane, e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dropHint || dropHint.eraId !== eraId || dropHint.lane !== lane) {
      setDropHint({ eraId, beforeRefId: null, lane });
    }
  }

  function keyMove(refId, delta) {
    const nextPlacements = nudgeItem(state, refId, delta);
    const list = Object.entries(nextPlacements)
      .filter(([id, p]) => JSON.stringify(p) !== JSON.stringify(state.placements[id]))
      .map(([id, p]) => ({ op: 'place', refId: id, eraId: p.eraId, order: p.order, lane: p.lane }));
    mutate(list, { silent: true });
  }

  // 键盘可达：Alt + ←/→ 在相邻展厅间移动
  function keyCrossEras(refId, dir) {
    const p = state.placements[refId];
    if (!p) return;
    const col = eras.findIndex((e) => e.id === p.eraId);
    const target = eras[col + dir];
    if (!target) return;
    commitDrop(refId, target.id, null);
  }

  // 关系弧线：只画两端都在墙上的
  const arcs = state.relations
    .map((r) => ({ r, a: cardCenter(r.from), b: cardCenter(r.to) }))
    .filter(({ a, b }) => a && b);

  const issueByRef = useMemo(() => {
    const m = new Map();
    for (const i of report?.issues ?? []) {
      if (!m.has(i.about)) m.set(i.about, []);
      m.get(i.about).push(i);
    }
    return m;
  }, [report]);

  return (
    <div className="timeline-scroll" ref={wallRef} role="region" aria-label="思想年代时间轴，使用方向键可移动画作"
      onDragOver={(e) => {
        // 拖到展墙最右侧空白退件区时高亮
        if (e.target === e.currentTarget || e.target.classList?.contains('remove-tray')) {
          e.preventDefault();
          setDropHint({ tray: true });
        }
      }}
      onDrop={(e) => {
        const refId = e.dataTransfer.getData('text/plain');
        if (refId && state.placements[refId] && (e.target === e.currentTarget || e.target.classList?.contains('remove-tray'))) {
          e.preventDefault();
          mutate([{ op: 'unplace', refId }]);
          setDrag(null); setDropHint(null);
        }
      }}>
      <div className={`remove-tray ${dropHint?.tray ? 'is-hover' : ''}`} aria-hidden="true">
        <X size={18} /><span>拖到这里取下墙</span>
      </div>
      <div className="timeline-wall" style={{ width: wallW, height: wallH }}>
        <svg className="timeline-svg" width={wallW} height={wallH} viewBox={`0 0 ${wallW} ${wallH}`} aria-hidden="true">
          {/* 展厅色带 */}
          {eras.map((era, i) => {
            const x = colX(i);
            return (
              <g key={era.id}>
                <rect x={x} y={AXIS_H - 34} width={COL_WIDTH} height={peopleLaneH + LANE_GAP + questionLaneH + 40}
                  rx={4} className="era-band" style={{ fill: era.color, fillOpacity: 0.07, stroke: era.color, strokeOpacity: 0.4 }} />
                <line x1={x} y1={AXIS_H - 10} x2={x + COL_WIDTH} y2={AXIS_H - 10}
                  stroke={era.color} strokeOpacity={0.55} strokeDasharray="2 6" />
              </g>
            );
          })}
          {/* 年份主轴 */}
          <line x1={12} y1={34} x2={wallW - 20} y2={34} className="axis-line" />
          <polygon points={`${wallW - 18},34 ${wallW - 30},29 ${wallW - 30},39`} className="axis-arrow" />
          {eras.map((era, i) => (
            <g key={`tick-${era.id}`}>
              <line x1={colX(i) + 14} y1={28} x2={colX(i) + 14} y2={40} className="axis-tick" />
              <text x={colX(i) + 14} y={20} className="axis-year">{formatYear(era.from)}</text>
            </g>
          ))}
          <text x={wallW - 40} y={20} className="axis-year" textAnchor="end">今天</text>

          {/* 关系弧线 */}
          {arcs.map(({ r, a, b }, idx) => {
            const midX = (a.x + b.x) / 2;
            const depth = Math.min(180, Math.abs(b.x - a.x) * 0.32 + 34);
            const d = `M ${a.x} ${a.y} C ${a.x} ${a.y - depth}, ${b.x} ${b.y - depth}, ${b.x} ${b.y}`;
            const active = focused && (focused === r.from || focused === r.to);
            return (
              <g key={`${r.from}-${r.to}-${r.kind}`} className={active ? 'arc is-active' : 'arc'}>
                <path d={d} fill="none" className="arc-path" />
                <text x={midX} y={Math.min(a.y, b.y) - depth + 20} className="arc-label" textAnchor="middle">{r.kind}</text>
              </g>
            );
          })}
        </svg>

        {/* 展厅标题 + 拖放列 */}
        {eras.map((era, i) => {
          const x = colX(i);
          return (
            <div className="era-column" key={era.id} style={{ left: x, width: COL_WIDTH, top: AXIS_H - 58 }}
              onDragOver={(e) => handleColumnDragOver(era.id, 'person', e)}
              onDrop={(e) => { e.preventDefault(); commitDrop(e.dataTransfer.getData('text/plain'), era.id, null); }}>
              <div className="era-head">
                <span className="era-dot" style={{ background: era.color }} />
                <div>
                  <h3>{era.name}</h3>
                  <p>{era.en} · {formatYear(era.from)}–{formatYear(era.to)}</p>
                </div>
                <button className="era-remove" aria-label={`撤下展厅 ${era.name}`} title="撤下展厅（画作回到库房）"
                  onClick={() => mutate([{ op: 'removeEra', eraId: era.id }])}><X size={13} /></button>
              </div>

              <div className="drop-lane person-lane" style={{ minHeight: peopleLaneH - 40 }}
                onDragOver={(e) => handleColumnDragOver(era.id, 'person', e)}
                onDrop={(e) => { e.preventDefault(); commitDrop(e.dataTransfer.getData('text/plain'), era.id, null); }}>
                {lanes[era.id].person.map((refId, row) => (
                  <DropSlot key={refId} active={dropHint?.eraId === era.id && dropHint?.beforeRefId === refId}
                    onOver={(e) => handleCardDragOver(era.id, refId, 'person', e)}
                    onDrop={(e) => { e.preventDefault(); commitDrop(e.dataTransfer.getData('text/plain'), era.id, refId); }}>
                    <PersonCard
                      person={peopleById.get(refId)}
                      placement={state.placements[refId]}
                      era={era}
                      issues={issueByRef.get(refId)}
                      dragging={drag?.refId === refId}
                      onDragStart={(e) => handleDragStart(refId, e)}
                      onDragEnd={() => { setDrag(null); setDropHint(null); }}
                      onFocus={() => setFocused(refId)}
                      onBlur={() => setFocused(null)}
                      onNudge={(d) => keyMove(refId, d)}
                      onCross={(d) => keyCrossEras(refId, d)}
                      onRemove={() => mutate([{ op: 'unplace', refId }])}
                      canUp={row > 0}
                      canDown={row < lanes[era.id].person.length - 1}
                      canLeft={i > 0}
                      canRight={i < eras.length - 1}
                      onRelations={() => onOpenRelation?.(refId)}
                    />
                  </DropSlot>
                ))}
                {lanes[era.id].person.length === 0 && <EmptyLane text="把哲学家拖到这面墙" />}
              </div>

              <div className="drop-lane question-lane" style={{ minHeight: questionLaneH - 70 }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); handleColumnDragOver(era.id, 'question', e); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); commitDrop(e.dataTransfer.getData('text/plain'), era.id, null); }}>
                <span className="lane-caption">悬而未决 · QUESTIONS</span>
                {lanes[era.id].question.map((refId, row) => (
                  <DropSlot key={refId} active={dropHint?.eraId === era.id && dropHint?.beforeRefId === refId}
                    onOver={(e) => handleCardDragOver(era.id, refId, 'question', e)}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); commitDrop(e.dataTransfer.getData('text/plain'), era.id, refId); }}>
                    <QuestionCard
                      question={questionById.get(refId)}
                      issues={issueByRef.get(refId)}
                      dragging={drag?.refId === refId}
                      onDragStart={(e) => handleDragStart(refId, e)}
                      onDragEnd={() => { setDrag(null); setDropHint(null); }}
                      onFocus={() => setFocused(refId)}
                      onBlur={() => setFocused(null)}
                      onNudge={(d) => keyMove(refId, d)}
                      onCross={(d) => keyCrossEras(refId, d)}
                      onRemove={() => mutate([{ op: 'unplace', refId }])}
                      canUp={row > 0}
                      canDown={row < lanes[era.id].question.length - 1}
                      canLeft={i > 0}
                      canRight={i < eras.length - 1}
                    />
                  </DropSlot>
                ))}
                {lanes[era.id].question.length === 0 && <EmptyLane text="问题可以挂在任何时代" compact />}
              </div>
            </div>
          );
        })}
      </div>
      {eras.length === 0 && <EmptyWall />}
    </div>
  );
}

function DropSlot({ children, active, onOver, onDrop }) {
  return (
    <div className={`drop-slot ${active ? 'is-active' : ''}`} onDragOver={onOver} onDrop={onDrop}>
      {active && <div className="drop-indicator" />}
      {children}
    </div>
  );
}

function EmptyLane({ text, compact }) {
  return <div className={`empty-lane ${compact ? 'is-compact' : ''}`}><Plus size={13} />{text}</div>;
}

function EmptyWall() {
  return (
    <div className="empty-wall">
      <p>展墙尚空。</p>
      <p className="empty-sub">从下方库房把「时代节点」拖上墙，再把哲学家挂进他们所属的年代。</p>
    </div>
  );
}

function CardShell({ dragging, onDragStart, onDragEnd, onFocus, onBlur, children, label, controls }) {
  return (
    <div className="painting-card" draggable onDragStart={onDragStart} onDragEnd={onDragEnd}
      onFocus={onFocus} onBlur={onBlur} tabIndex={0} role="button"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') { e.preventDefault(); controls.up?.(); }
        if (e.key === 'ArrowDown') { e.preventDefault(); controls.down?.(); }
        if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); controls.left?.(); }
        if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); controls.right?.(); }
      }}>
      {children}
    </div>
  );
}

function PersonCard({ person, era, issues, dragging, ...handlers }) {
  const severe = issues?.some((i) => i.severity === 'error');
  const warning = issues?.some((i) => i.severity === 'warning');
  const title = issues?.map((i) => `【${i.severity === 'error' ? '硬伤' : '注记'}】${i.message}`).join('\n');
  const controls = {
    up: handlers.canUp ? () => handlers.onNudge(-1) : null,
    down: handlers.canDown ? () => handlers.onNudge(1) : null,
    left: handlers.canLeft ? () => handlers.onCross(-1) : null,
    right: handlers.canRight ? () => handlers.onCross(1) : null,
  };
  return (
    <CardShell dragging={dragging} onDragStart={handlers.onDragStart} onDragEnd={handlers.onDragEnd}
      onFocus={handlers.onFocus} onBlur={handlers.onBlur} controls={controls}
      label={`${person.name}，${formatYear(person.born)}至${formatYear(person.died)}，位于${era.name}。方向键调整次序，Alt 加左右方向键切换展厅，Delete 取下`}
      >
      <div className={`card-frame ${severe ? 'has-error' : warning ? 'has-warning' : ''}`} title={title}>
        <div className="card-topline">
          <span className="card-years">{formatYear(person.born)} — {formatYear(person.died)}</span>
          <span className="card-badges">
            {issues?.filter((i) => i.severity === 'error').length > 0 && <span className="badge badge-error" title={title}>!</span>}
            {issues?.filter((i) => i.severity === 'warning').length > 0 && <span className="badge badge-warning" title={title}>注</span>}
            <button className="card-x" aria-label={`把 ${person.name} 取下墙`} onClick={handlers.onRemove}><X size={11} /></button>
          </span>
        </div>
        <h4>{person.name}</h4>
        <p className="card-latin">{person.latin}</p>
        <p className="card-idea">{person.idea}</p>
        <div className="card-controls" aria-hidden="false">
          <button tabIndex={-1} disabled={!handlers.canUp} onClick={() => handlers.onNudge(-1)} aria-label="上移"><ArrowUp size={12} /></button>
          <button tabIndex={-1} disabled={!handlers.canDown} onClick={() => handlers.onNudge(1)} aria-label="下移"><ArrowDown size={12} /></button>
        </div>
      </div>
    </CardShell>
  );
}

function QuestionCard({ question, issues, dragging, ...handlers }) {
  const warning = issues?.some((i) => i.severity === 'warning');
  const title = issues?.map((i) => i.message).join('\n');
  const controls = {
    up: handlers.canUp ? () => handlers.onNudge(-1) : null,
    down: handlers.canDown ? () => handlers.onNudge(1) : null,
    left: handlers.canLeft ? () => handlers.onCross(-1) : null,
    right: handlers.canRight ? () => handlers.onCross(1) : null,
  };
  return (
    <CardShell dragging={dragging} onDragStart={handlers.onDragStart} onDragEnd={handlers.onDragEnd}
      onFocus={handlers.onFocus} onBlur={handlers.onBlur} controls={controls}
      label={`核心问题 ${question.label}`}>
      <div className={`card-frame question-frame ${warning ? 'has-warning' : ''}`} title={title}>
        <div className="card-topline">
          <span className="q-mark">Q</span>
          <span className="card-badges">
            {warning && <span className="badge badge-warning" title={title}>注</span>}
            <button className="card-x" aria-label={`取下问题 ${question.label}`} onClick={handlers.onRemove}><X size={11} /></button>
          </span>
        </div>
        <h4>{question.label}</h4>
        <p className="card-hint">{question.hint}</p>
      </div>
    </CardShell>
  );
}
