// 我的思想年代 · 主应用
// 保存协议：CAS（baseVersion）乐观锁；409 → 用户选择重载或 rebase 三方合并；
// 断网 → 本地草稿 + 恢复在线后自动 rebase；422 → 标红问题节点。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, uuid } from './api.js';
import Palette from './Palette.jsx';
import Timeline, { useNarrow, DOMAIN } from './Timeline.jsx';
import Preview from './Preview.jsx';

const TIMELINE_ID = new URLSearchParams(location.search).get('t') || 'my-century';
const DRAFT_KEY = `pc:draft:${TIMELINE_ID}`;

export default function App() {
  const narrow = useNarrow();
  const [catalog, setCatalog] = useState(null);
  const [server, setServer] = useState(null);      // { version, nodes, layout, updatedAt }
  const [nodes, setNodes] = useState(null);        // 工作副本
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState('loading'); // saved|saving|offline|conflict|invalid|error
  const [warnings, setWarnings] = useState([]);
  const [issues, setIssues] = useState([]);        // 422 校验错误
  const [conflict, setConflict] = useState(null);  // 409 服务器快照
  const [mergeNote, setMergeNote] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const clientId = useMemo(uuid, []);
  const saveTimer = useRef(null);
  const keyRef = useRef(uuid());                   // 每轮编辑一个幂等键，网络重试安全

  const announce = useCallback((msg) => setAnnouncement(`${Date.now()}:${msg}`), []);

  /* ---------- 加载：目录 + 时间线 + 本地草稿恢复 ---------- */
  useEffect(() => {
    (async () => {
      try {
        const [cat, tl] = await Promise.all([api.catalog(), api.timeline(TIMELINE_ID)]);
        if (cat.status !== 200 || tl.status !== 200) throw new Error('加载失败');
        setCatalog(cat.body);
        // 离线草稿恢复：草稿比服务器新 → 恢复并标记待保存
        let restored = null;
        try {
          const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
          if (draft && draft.baseVersion === tl.body.version && Date.parse(draft.savedAt) > Date.parse(tl.body.updatedAt)) restored = draft.nodes;
        } catch { /* 草稿损坏则忽略 */ }
        setServer(tl.body);
        setNodes(restored ?? tl.body.nodes);
        setDirty(!!restored);
        setSaveState(restored ? 'offline' : 'saved');
        if (restored) announce('已恢复上次未保存的草稿');
      } catch {
        setSaveState('offline');
        // 完全离线启动：尝试从草稿启动
        try {
          const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
          if (draft) {
            const cat = await api.catalog().catch(() => null);
            if (cat?.status === 200) setCatalog(cat.body);
            setServer({ version: draft.baseVersion, nodes: draft.nodes, layout: { lanes: {}, laneCount: 1 }, updatedAt: draft.savedAt });
            setNodes(draft.nodes);
            setDirty(true);
          }
        } catch { /* 无能为力 */ }
      }
    })();
  }, [announce]);

  /* ---------- 保存 ---------- */
  const save = useCallback(async (strategy, currentNodes, baseVersion) => {
    setSaveState('saving');
    try {
      const { status, body } = await api.save(TIMELINE_ID, {
        baseVersion, nodes: currentNodes, clientId, idempotencyKey: keyRef.current,
        ...(strategy === 'rebase' ? { strategy: 'rebase' } : {}),
      });
      if (status === 200) {
        keyRef.current = uuid();
        setServer(body);
        setNodes(body.nodes);           // 以服务端裁决后的节点为准（合并/布局）
        setWarnings(body.warnings ?? []);
        setIssues([]);
        setConflict(null);
        setDirty(false);
        setSaveState('saved');
        localStorage.removeItem(DRAFT_KEY);
        if (body.merged) {
          const n = body.merged.conflicts?.length ?? 0;
          setMergeNote(`已与服务器版本 v${body.merged.fromVersion}→v${body.version} 合并${n ? `，${n} 处冲突以你的离线修改为准` : ''}`);
          setTimeout(() => setMergeNote(null), 8000);
        }
        announce(`已保存，版本 ${body.version}`);
      } else if (status === 409) {
        setConflict(body);
        setSaveState('conflict');
        announce('检测到他人已保存新版本');
      } else if (status === 422) {
        setIssues(body.issues ?? []);
        setWarnings(body.warnings ?? []);
        setSaveState('invalid');
        announce('服务端校验未通过，请检查标红的展品');
      } else {
        setSaveState('error');
      }
    } catch {
      setSaveState('offline');          // 网络失败：保留草稿，等待重连
      announce('当前离线，修改已保存在本地，恢复网络后自动合并');
    }
  }, [announce, clientId]);

  /* ---------- 修改入口：统一走 mutate，自动写草稿 + 防抖自动保存 ---------- */
  const mutate = useCallback((fn) => {
    setNodes((prev) => {
      const next = fn(prev);
      setDirty(true);
      setIssues([]);
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ nodes: next, baseVersion: server.version, savedAt: new Date().toISOString() })); } catch { /* 存储满则跳过 */ }
      return next;
    });
  }, [server]);

  useEffect(() => {
    if (!dirty || saveState === 'conflict') return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save('cas', nodes, server.version), 1500);
    return () => clearTimeout(saveTimer.current);
  }, [nodes, dirty, saveState, save, server]);

  /* ---------- 离线 → 在线自动 rebase 合并 ---------- */
  useEffect(() => {
    const onOnline = () => { if (dirty && server) save('rebase', nodes, server.version); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [dirty, nodes, server, save]);

  /* ---------- 节点操作 ---------- */
  const addNode = useCallback((kind, refId, year) => {
    mutate((prev) => [...prev, { id: uuid(), kind, refId, year: defaultYear(catalog, kind, refId, year), parentId: null, note: '' }]);
  }, [mutate, catalog]);

  const moveNode = useCallback((id, year) => {
    mutate((prev) => prev.map((n) => (n.id === id ? { ...n, year } : n)));
  }, [mutate]);

  const removeNode = useCallback((id) => {
    mutate((prev) => prev.filter((n) => n.id !== id).map((n) => (n.parentId === id ? { ...n, parentId: null } : n)));
    setSelectedId((s) => (s === id ? null : s));
  }, [mutate]);

  const attachNode = useCallback((id, parentId) => {
    mutate((prev) => prev.map((n) => (n.id === id ? { ...n, parentId: parentId || null } : n)));
  }, [mutate]);

  /* ---------- 冲突解决 ---------- */
  const resolveReload = () => {
    setNodes(conflict.nodes);
    setServer(conflict);
    setConflict(null);
    setDirty(false);
    setSaveState('saved');
    localStorage.removeItem(DRAFT_KEY);
    announce('已加载服务器版本，本地修改已放弃');
  };
  const resolveMerge = () => save('rebase', nodes, server.version);

  const invalidIds = useMemo(() => new Set(issues.map((i) => i.nodeId).filter(Boolean)), [issues]);
  const usedRefs = useMemo(() => new Set((nodes ?? []).map((n) => n.refId)), [nodes]);
  const selected = nodes?.find((n) => n.id === selectedId) ?? null;

  if (!catalog || !nodes) {
    return <main className="boot"><p>{saveState === 'offline' ? '离线且没有可用草稿，请联网后刷新。' : '正在布展……'}</p></main>;
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>我的思想年代 <span className="subtitle">A Personal Century</span></h1>
        <div className="status" role="status">
          <StatusBadge state={saveState} dirty={dirty} version={server.version} />
          <button type="button" className="save-btn" disabled={!dirty || saveState === 'saving'} onClick={() => save('cas', nodes, server.version)}>
            保存此版
          </button>
        </div>
      </header>

      {mergeNote && <div className="banner ok" role="status">{mergeNote}</div>}
      {saveState === 'offline' && <div className="banner warn" role="alert">离线中——修改已存入本地草稿，恢复网络后将自动与服务器合并。</div>}
      {saveState === 'invalid' && (
        <div className="banner err" role="alert">
          服务端校验未通过：
          <ul>{issues.map((i, k) => <li key={k}><button type="button" onClick={() => setSelectedId(i.nodeId)}>{i.message}</button></li>)}</ul>
        </div>
      )}
      {warnings.length > 0 && saveState !== 'invalid' && (
        <div className="banner note" role="note">策展提示：{warnings.map((w) => w.message).join('；')}</div>
      )}
      {conflict && (
        <div className="banner err" role="alertdialog" aria-label="版本冲突">
          <p>另有一处保存已生效（服务器 v{conflict.version}，你的修改基于 v{server.version}）。</p>
          <button type="button" onClick={resolveMerge}>合并我的修改</button>
          <button type="button" onClick={resolveReload}>放弃我的修改，加载服务器版本</button>
        </div>
      )}

      <div className={`layout ${narrow ? 'narrow' : ''}`}>
        <Palette catalog={catalog} onAdd={(kind, refId) => addNode(kind, refId)} usedRefs={usedRefs} />
        <main className="stage">
          <Timeline
            catalog={catalog} nodes={nodes} layout={server.layout}
            selectedId={selectedId} onSelect={setSelectedId}
            onMove={moveNode} onRemove={removeNode}
            onDropNew={(kind, refId, year) => addNode(kind, refId, year)}
            announce={announce} narrow={narrow} invalidIds={invalidIds}
          />
          {selected && (
            <Inspector
              catalog={catalog} node={selected} nodes={nodes}
              onAttach={attachNode} onRemove={removeNode} onClose={() => setSelectedId(null)}
            />
          )}
        </main>
        <Preview catalog={catalog} nodes={nodes} timelineId={TIMELINE_ID} version={server.version} saveState={dirty ? 'dirty' : saveState} />
      </div>

      <div className="sr-only" aria-live="polite">{announcement.replace(/^\d+:/, '')}</div>
    </div>
  );
}

function StatusBadge({ state, dirty, version }) {
  const map = {
    loading: ['…', '加载中'], saved: ['✓', `已保存 · v${version}`], saving: ['↻', '保存中…'],
    offline: ['⚠', '离线'], conflict: ['⚠', '版本冲突'], invalid: ['✕', '校验未通过'], error: ['✕', '保存失败'],
  };
  const [icon, text] = map[state] ?? ['?', state];
  return <span className={`badge st-${state}`}>{icon} {dirty && state === 'saved' ? '有修改' : text}</span>;
}

function Inspector({ catalog, node, nodes, onAttach, onRemove, onClose }) {
  const parents = nodes.filter((n) => n.id !== node.id && n.kind !== 'question' && node.kind !== 'era');
  const label = node.kind === 'era'
    ? catalog.eras.find((e) => e.id === node.refId)?.name
    : node.kind === 'philosopher'
      ? catalog.philosophers.find((p) => p.id === node.refId)?.name
      : `「${catalog.questions.find((q) => q.id === node.refId)?.text}」`;
  return (
    <section className="inspector" aria-label="展品设置">
      <h3>{label}</h3>
      {node.kind !== 'era' && (
        <label>
          归入
          <select value={node.parentId ?? ''} onChange={(e) => onAttach(node.id, e.target.value)}>
            <option value="">（不归属）</option>
            {parents.map((p) => {
              const l = p.kind === 'era'
                ? catalog.eras.find((e) => e.id === p.refId)?.name
                : catalog.philosophers.find((x) => x.id === p.refId)?.name;
              return <option key={p.id} value={p.id}>{p.kind === 'era' ? '时代：' : '人物：'}{l}</option>;
            })}
          </select>
        </label>
      )}
      <div className="inspector-actions">
        <button type="button" className="danger" onClick={() => { onRemove(node.id); onClose(); }}>取下</button>
        <button type="button" onClick={onClose}>完成</button>
      </div>
    </section>
  );
}

function defaultYear(catalog, kind, refId, droppedYear) {
  if (droppedYear != null) return Math.round(droppedYear);
  if (kind === 'era') return catalog.eras.find((e) => e.id === refId)?.start ?? 0;
  if (kind === 'philosopher') {
    const p = catalog.philosophers.find((x) => x.id === refId);
    return p ? Math.min(p.death, p.birth + 30) : 0;
  }
  return Math.min(DOMAIN.max, Math.max(DOMAIN.min, 1750));
}
