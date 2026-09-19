import { useMemo, useState } from 'react';
import { ArrowLeftRight, CloudOff, GitMerge, X } from 'lucide-react';

// 「合并台」：保存时若 baseVersion 已落后，或离线期间别人改了档案，
// 服务端做三路合并并把无法自动裁决的分叉列在这里。策展人逐项选择，
// 最终版本仍由服务端落库与校验。

function summarize(side, conflict) {
  if (side === 'title') return JSON.stringify(conflict.server) === JSON.stringify(conflict.client)
    ? '相同' : null;
  return null;
}

export function ConflictDialog({ conflict, onResolve, onCancel }) {
  const info = conflict.mergeInfo ?? {};
  const conflicts = info.conflicts ?? [];
  const [picks, setPicks] = useState({}); // index -> 'server' | 'client'
  const allPicked = conflicts.every((_, i) => picks[i]);

  const pick = (i, side) => setPicks((p) => ({ ...p, [i]: side }));

  function applyPicks() {
    // 以服务端的 proposedState 为底稿，按用户选择覆写冲突字段
    const state = JSON.parse(JSON.stringify(info.proposedState ?? conflict.client));
    conflicts.forEach((c, i) => {
      const side = picks[i];
      if (side === 'client') {
        if (c.field === 'title') state.title = conflict.client.title;
        if (c.field === 'eras') {
          if (conflict.client.eras.includes(c.item)) { if (!state.eras.includes(c.item)) state.eras.push(c.item); }
          else state.eras = state.eras.filter((id) => id !== c.item);
        }
        if (c.field === 'placements') {
          const v = conflict.client.placements?.[c.item];
          if (v) state.placements[c.item] = v; else delete state.placements[c.item];
        }
        if (c.field === 'relations') {
          const rel = parseKey(c.item);
          const keeps = conflict.client.relations?.some((r) => `${r.from}→${r.to}⟦${r.kind}⟧` === c.item);
          if (keeps && !state.relations.some((r) => `${r.from}→${r.to}⟦${r.kind}⟧` === c.item)) state.relations.push(rel);
          if (!keeps) state.relations = state.relations.filter((r) => `${r.from}→${r.to}⟦${r.kind}⟧` !== c.item);
        }
      }
      // 'server' 即 proposedState 的默认值，无需改写
    });
    onResolve('manual', state);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="merge-title">
      <div className="modal merge-modal">
        <header>
          <div className="kicker"><GitMerge size={13} /> THREE-WAY MERGE</div>
          <h2 id="merge-title">合并台：墙上出现了两个版本</h2>
          <button className="modal-x" onClick={onCancel} aria-label="放弃本地改动"><X size={16} /></button>
        </header>
        <p className="merge-intro">
          你基于第 <b>{conflict.baseVersion}</b> 版布展，而档案馆墙上已是第 <b>{conflict.serverHead}</b> 版——
          可能是另一位策展人，也可能是你在另一台设备、或离线期间完成的改动。
          档案馆已完成三路合并，以下 {conflicts.length} 处分叉需要你逐项裁决。
        </p>

        <div className="merge-quick">
          <button className="ghost-button" onClick={() => onResolve('server')}>全部以墙上为准</button>
          <button className="ghost-button" onClick={() => onResolve('client')}>全部保留我的</button>
        </div>

        <ul className="conflict-list">
          {conflicts.map((c, i) => (
            <ConflictRow key={`${c.field}-${c.item}-${i}`} c={c} i={i} conflict={conflict}
              picked={picks[i]} onPick={(s) => pick(i, s)} />
          ))}
          {conflicts.length === 0 && (
            <li className="conflict-auto">没有真正的分叉，可以直接合成。</li>
          )}
        </ul>

        {(info.validation?.issues ?? []).filter((x) => x.severity === 'error').length > 0 && (
          <p className="merge-warn">合并后的方案仍有年代硬伤，落库前请留意右侧明细。</p>
        )}

        <footer>
          <button className="ghost-button" onClick={onCancel}><CloudOff size={14} />放弃我的，用墙上版本</button>
          <button className="solid-button" disabled={conflicts.length > 0 && !allPicked} onClick={applyPicks}>
            <ArrowLeftRight size={14} /> 采纳裁决并保存新版本
          </button>
        </footer>
      </div>
    </div>
  );
}

function parseKey(key) {
  const [rest, kindPart] = key.split('⟦');
  const [from, to] = rest.split('→');
  return { from, to, kind: kindPart.replace('⟧', '') };
}

function ConflictRow({ c, i, conflict, picked, onPick }) {
  const labels = useMemo(() => describeConflict(c, conflict), [c, conflict]);
  return (
    <li className={`conflict-row pick-${picked ?? 'none'}`}>
      <div className="conflict-what">
        <span className="conflict-field">{fieldName(c.field)}</span>
        <p>{labels.title}</p>
      </div>
      <div className="conflict-sides">
        <button className={`side side-server ${picked === 'server' ? 'is-picked' : ''}`} onClick={() => onPick('server')}>
          <span>墙上版本 v{conflict.serverHead}</span>
          <b>{labels.server}</b>
        </button>
        <button className={`side side-client ${picked === 'client' ? 'is-picked' : ''}`} onClick={() => onPick('client')}>
          <span>我的版本（基于 v{conflict.baseVersion}）</span>
          <b>{labels.client}</b>
        </button>
      </div>
    </li>
  );
}

function fieldName(f) {
  return { title: '展览标题', eras: '展厅', placements: '画作位置', relations: '关系弧线' }[f] ?? f;
}

function describeConflict(c, conflict) {
  const eraName = (id) => conflict.server && id;
  if (c.field === 'title') {
    return { title: '展览标题被两边改写', server: conflict.server.title, client: conflict.client.title };
  }
  if (c.field === 'eras') {
    const name = c.item;
    return {
      title: c.server && !c.client ? `展厅被一方撤下` : '展厅存在分歧',
      server: c.server ? `保留展厅` : '撤下展厅',
      client: c.client ? `保留展厅` : '撤下展厅',
    };
  }
  if (c.field === 'placements') {
    const s = c.server;
    const cli = c.client;
    return {
      title: `同一件作品挂在不同位置`,
      server: s ? `挂在 ${eraCell(s)} · 序号 ${s.order}` : '取下墙（回到库房）',
      client: cli ? `挂在 ${eraCell(cli)} · 序号 ${cli.order}` : '取下墙（回到库房）',
    };
  }
  // relations
  const rel = parseKey(c.item);
  return {
    title: `关系「${rel.from} —${rel.kind}→ ${rel.to}」`,
    server: c.server ? '保留这条弧线' : '删除这条弧线',
    client: c.client ? '保留这条弧线' : '删除这条弧线',
  };
}

function eraCell(p) {
  return p.eraId;
}
