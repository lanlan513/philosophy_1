// SVG 展墙时间轴。桌面：横向空间展墙；移动端（窄屏）：纵向长卷。
// 拖拽只是“提议”，最终年份与布局由服务端校验与下发。
import { useEffect, useRef, useState } from 'react';
import { fmtYear } from './Palette.jsx';

export const DOMAIN = { min: -850, max: 2030 };
const W = 1240, PAD = 70;
const ERA_ROW_H = 46, LANE_H = 66, FRAME_W = 118, FRAME_H = 50;

const xOf = (year) => PAD + ((year - DOMAIN.min) / (DOMAIN.max - DOMAIN.min)) * (W - 2 * PAD);
const yearOf = (x) => Math.round(DOMAIN.min + ((x - PAD) / (W - 2 * PAD)) * (DOMAIN.max - DOMAIN.min));
const clampDomain = (y) => Math.min(DOMAIN.max, Math.max(DOMAIN.min, y));

export function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 880px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 880px)');
    const fn = () => setNarrow(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return narrow;
}

function refLabel(catalog, n) {
  if (n.kind === 'era') return catalog.eras.find((e) => e.id === n.refId)?.name ?? n.refId;
  if (n.kind === 'philosopher') return catalog.philosophers.find((p) => p.id === n.refId)?.name ?? n.refId;
  return `「${catalog.questions.find((q) => q.id === n.refId)?.text ?? n.refId}」`;
}

export default function Timeline({ catalog, nodes, layout, selectedId, onSelect, onMove, onRemove, onDropNew, announce, narrow, invalidIds }) {
  if (narrow) return <ScrollTimeline {...{ catalog, nodes, selectedId, onSelect, onMove, onRemove, announce, invalidIds }} />;
  return <WallTimeline {...{ catalog, nodes, layout, selectedId, onSelect, onMove, onRemove, onDropNew, announce, invalidIds }} />;
}

/* ---------------- 桌面：SVG 展墙 ---------------- */

function WallTimeline({ catalog, nodes, layout, selectedId, onSelect, onMove, onRemove, onDropNew, announce, invalidIds }) {
  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null); // { id, year } 拖拽中的临时位置

  const eraNodes = nodes.filter((n) => n.kind === 'era')
    .sort((a, b) => eraOf(catalog, a).start - eraOf(catalog, b).start);
  const eraRow = new Map(eraNodes.map((n, i) => [n.id, i]));
  const frames = nodes.filter((n) => n.kind !== 'era');
  const eraAreaH = Math.max(1, eraNodes.length) * ERA_ROW_H + 26;
  const laneCount = Math.max(1, layout?.laneCount ?? 1);
  const H = eraAreaH + laneCount * LANE_H + 70;

  const frameY = (id) => eraAreaH + (layout?.lanes?.[id] ?? 0) * LANE_H + 10;
  const nodePos = (n) => n.kind === 'era'
    ? { x: xOf(n.year), y: 20 + (eraRow.get(n.id) ?? 0) * ERA_ROW_H + 17 }
    : { x: xOf(drag?.id === n.id ? drag.year : n.year), y: frameY(n.id) + FRAME_H / 2 };

  // 拖拽中断兜底：Esc、窗口失焦、指针被取消 → 全部回到拖拽前
  useEffect(() => {
    if (!drag) return;
    const cancel = () => { setDrag(null); announce('拖拽已取消，展品回到原位置'); };
    const onKey = (e) => { if (e.key === 'Escape') cancel(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('blur', cancel); };
  }, [drag, announce]);

  const svgYear = (clientX) => {
    const svg = svgRef.current;
    const pt = new DOMPoint(clientX, 0).matrixTransform(svg.getScreenCTM().inverse());
    return clampDomain(yearOf(pt.x));
  };

  const beginDrag = (e, n) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: n.id, year: n.year, pointerId: e.pointerId });
    onSelect(n.id);
  };
  const moveDrag = (e, n) => {
    if (!drag || drag.id !== n.id) return;
    setDrag({ ...drag, year: svgYear(e.clientX) });
  };
  const endDrag = (e, n) => {
    if (!drag || drag.id !== n.id) return;
    const year = clampForNode(catalog, n, svgYear(e.clientX));
    setDrag(null);
    if (year !== n.year) { onMove(n.id, year); announce(`${refLabel(catalog, n)} 已移至 ${fmtYear(year)} 年`); }
  };
  const cancelDrag = (n) => {
    if (!drag || drag.id !== n.id) return;
    setDrag(null);
    announce('拖拽被中断，已还原');
  };

  const onKey = (e, n) => {
    const step = e.shiftKey ? 25 : 5;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const year = clampForNode(catalog, n, n.year + (e.key === 'ArrowRight' ? step : -step));
      onMove(n.id, year);
      announce(`${refLabel(catalog, n)} 移至 ${fmtYear(year)} 年`);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onRemove(n.id);
      announce(`${refLabel(catalog, n)} 已取下`);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(n.id);
    }
  };

  const ticks = [];
  for (let y = -800; y <= 2000; y += 200) ticks.push(y);

  return (
    <div
      className="wall"
      onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-pc-item')) e.preventDefault(); }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData('application/x-pc-item');
        if (!raw) return;
        e.preventDefault();
        const { kind, refId } = JSON.parse(raw);
        onDropNew(kind, refId, svgYear(e.clientX));
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="application"
        aria-label="思想年代展墙，可用左右方向键移动选中的展品"
        preserveAspectRatio="xMidYMin meet"
      >
        {/* 年代刻度 */}
        {ticks.map((t) => (
          <g key={t} className="tick">
            <line x1={xOf(t)} y1={0} x2={xOf(t)} y2={H - 40} />
            <text x={xOf(t)} y={H - 24}>{fmtYear(t)}</text>
          </g>
        ))}
        <line x1={PAD} y1={H - 40} x2={W - PAD} y2={H - 40} className="axis" />

        {/* 时代横幅 */}
        {eraNodes.map((n) => {
          const era = eraOf(catalog, n);
          const y = 20 + eraRow.get(n.id) * ERA_ROW_H;
          return (
            <g key={n.id}>
              <rect className="era-band" x={xOf(era.start)} y={y} width={xOf(era.end) - xOf(era.start)} height={30} rx={4} />
              <text className="era-label" x={xOf(n.year)} y={y + 20}>{era.name}</text>
            </g>
          );
        })}

        {/* 父子连线 */}
        {nodes.filter((n) => n.parentId).map((n) => {
          const p = nodes.find((m) => m.id === n.parentId);
          if (!p) return null;
          const a = nodePos(n), b = nodePos(p);
          return <path key={`ln-${n.id}`} className="link" d={`M ${a.x} ${a.y} C ${a.x} ${(a.y + b.y) / 2}, ${b.x} ${(a.y + b.y) / 2}, ${b.x} ${b.y}`} />;
        })}

        {/* 拖拽参考线 */}
        {drag && (
          <g className="drag-guide">
            <line x1={xOf(drag.year)} y1={0} x2={xOf(drag.year)} y2={H - 40} />
            <text x={xOf(drag.year)} y={14}>{fmtYear(drag.year)}</text>
          </g>
        )}

        {/* 画框节点 */}
        {frames.map((n) => {
          const year = drag?.id === n.id ? drag.year : n.year;
          const x = xOf(year), y = frameY(n.id);
          const invalid = invalidIds?.has(n.id);
          return (
            <g
              key={n.id}
              className={`frame kind-${n.kind} ${selectedId === n.id ? 'selected' : ''} ${invalid ? 'invalid' : ''} ${drag?.id === n.id ? 'dragging' : ''}`}
              transform={`translate(${x - FRAME_W / 2}, ${y})`}
              tabIndex={0}
              role="button"
              aria-label={`${refLabel(catalog, n)}，锚定 ${fmtYear(year)} 年。方向键移动，Delete 取下`}
              onPointerDown={(e) => beginDrag(e, n)}
              onPointerMove={(e) => moveDrag(e, n)}
              onPointerUp={(e) => endDrag(e, n)}
              onPointerCancel={() => cancelDrag(n)}
              onKeyDown={(e) => onKey(e, n)}
              onFocus={() => onSelect(n.id)}
            >
              <rect width={FRAME_W} height={FRAME_H} rx={3} />
              <text x={FRAME_W / 2} y={21} className="frame-title">{fit(refLabel(catalog, n), 9)}</text>
              <text x={FRAME_W / 2} y={38} className="frame-year">{fmtYear(year)}</text>
            </g>
          );
        })}
      </svg>
      {nodes.length === 0 && <p className="empty-hint">展墙还空着——从左侧目录拖一个时代或哲学家上来。</p>}
    </div>
  );
}

/* ---------------- 移动端：纵向长卷 ---------------- */

function ScrollTimeline({ catalog, nodes, selectedId, onSelect, onMove, onRemove, announce, invalidIds }) {
  const ordered = [...nodes].sort((a, b) => a.year - b.year);
  return (
    <ol className="scroll" aria-label="思想长卷（按年代自上而下）">
      {ordered.map((n) => (
        <li key={n.id} className={`scroll-item kind-${n.kind} ${selectedId === n.id ? 'selected' : ''} ${invalidIds?.has(n.id) ? 'invalid' : ''}`}>
          <button type="button" className="scroll-main" onClick={() => onSelect(n.id)}>
            <span className="scroll-year">{fmtYear(n.year)}</span>
            <span className="scroll-label">{refLabel(catalog, n)}</span>
          </button>
          <span className="scroll-actions">
            <button type="button" onClick={() => { const y = clampForNode(catalog, n, n.year - 10); onMove(n.id, y); announce(`已前移至 ${fmtYear(y)} 年`); }} aria-label="前移十年">←</button>
            <button type="button" onClick={() => { const y = clampForNode(catalog, n, n.year + 10); onMove(n.id, y); announce(`已后移至 ${fmtYear(y)} 年`); }} aria-label="后移十年">→</button>
            <button type="button" onClick={() => { onRemove(n.id); announce('已取下'); }} aria-label="取下">✕</button>
          </span>
        </li>
      ))}
      {ordered.length === 0 && <p className="empty-hint">长卷还空着——从目录里挂上第一件展品。</p>}
    </ol>
  );
}

function eraOf(catalog, n) {
  return catalog.eras.find((e) => e.id === n.refId) ?? { start: DOMAIN.min, end: DOMAIN.max, name: n.refId };
}

function clampForNode(catalog, n, year) {
  let y = clampDomain(year);
  if (n.kind === 'philosopher') {
    const p = catalog.philosophers.find((x) => x.id === n.refId);
    if (p) y = Math.min(p.death, Math.max(p.birth, y));
  }
  if (n.kind === 'era') {
    const e = catalog.eras.find((x) => x.id === n.refId);
    if (e) y = Math.min(e.end, Math.max(e.start, y));
  }
  return y;
}

function fit(s, max) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
