import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, waitForServer } from './api';
import { applyOps, emptyState } from './applyOps.js';

const LS = {
  gallery: 'century.gallery.v1',
  ops: 'century.ops.v1',
  base: 'century.base.v1',
  clientId: 'century.clientId',
};

function readLS(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function writeLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 隐身模式等场景下静默降级 */ }
}
function clearLS() {
  for (const key of Object.values(LS)) {
    try { localStorage.removeItem(key); } catch { /* noop */ }
  }
}

function clientId() {
  let id = readLS(LS.clientId);
  if (!id) {
    id = `curator-${Math.random().toString(36).slice(2, 10)}`;
    writeLS(LS.clientId, id);
  }
  return id;
}

// 把当前状态与基准状态做 diff，生成最小 op 序列（离线重连后发送）
function diffToOps(base, next, catalog) {
  const ops = [];
  if (base.title !== next.title) ops.push({ op: 'title', title: next.title });

  for (const eraId of next.eras) {
    if (!base.eras.includes(eraId)) ops.push({ op: 'addEra', eraId });
  }
  for (const eraId of base.eras) {
    if (!next.eras.includes(eraId)) ops.push({ op: 'removeEra', eraId });
  }

  const refs = new Set([...Object.keys(next.placements), ...Object.keys(base.placements ?? {})]);
  for (const refId of refs) {
    const b = JSON.stringify(base.placements?.[refId] ?? null);
    const n = JSON.stringify(next.placements?.[refId] ?? null);
    if (b !== n) {
      if (!next.placements[refId]) ops.push({ op: 'unplace', refId });
      else ops.push({ op: 'place', refId, eraId: next.placements[refId].eraId, order: next.placements[refId].order, lane: next.placements[refId].lane });
    }
  }

  const keyOf = (r) => `${r.from}→${r.to}⟦${r.kind}⟧`;
  const bRel = new Map((base.relations ?? []).map((r) => [keyOf(r), r]));
  const nRel = new Map((next.relations ?? []).map((r) => [keyOf(r), r]));
  for (const [key, r] of nRel) if (!bRel.has(key)) ops.push({ op: 'addRelation', ...r });
  for (const [key, r] of bRel) if (!nRel.has(key)) ops.push({ op: 'removeRelation', ...r });

  // 未知引用不会进入 op（保持与服务端 applyOps 的白名单一致）
  return ops;
}

export function useCentury() {
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState(false);
  const [state, setState] = useState(emptyState());
  const [baseVersion, setBaseVersion] = useState(0);
  const [galleryId, setGalleryId] = useState(null);
  const [serverState, setServerState] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [sync, setSync] = useState('idle'); // idle | saving | saved | offline | preview-failed | conflict | merging | error
  const [online, setOnline] = useState(navigator.onLine);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [toast, setToast] = useState(null);
  const [conflict, setConflict] = useState(null); // {serverHead, current, base, client, mergeInfo}
  const [serverReport, setServerReport] = useState(null); // 服务端裁决（issues/canonical）
  const [preview, setPreview] = useState(null);
  const [previewState, setPreviewState] = useState('idle'); // idle | loading | ready | failed
  const [versions, setVersions] = useState([]);

  const stateRef = useRef(state);
  const baseSnapshotRef = useRef(null); // 分叉点状态（三路合并的 base）
  const saveTimer = useRef(null);
  const inflight = useRef(false);
  const cid = useMemo(() => clientId(), []);

  stateRef.current = state;

  // ---------- 启动：目录 + 档案 ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await waitForServer(2500);
      if (!ok) {
        if (!cancelled) {
          setCatalogError(true);
          setSync('offline');
        }
        // 离线启动：用缓存的目录（若有），否则稍后由重试填充
        const cached = readLS('century.catalog');
        if (cached && !cancelled) setCatalog(cached);
        return;
      }
      try {
        const cat = await api.catalog();
        if (cancelled) return;
        setCatalog(cat);
        writeLS('century.catalog', cat);
        setCatalogError(false);
        await hydrate(cat);
      } catch (err) {
        if (!cancelled) {
          setCatalogError(true);
          setToast({ tone: 'error', text: `加载失败：${err.message}` });
        }
      }
    })();
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { cancelled = true; window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  async function hydrate(cat) {
    // URL 支持 ?gallery=<id> 分享
    const params = new URLSearchParams(window.location.search);
    let id = params.get('gallery') || readLS(LS.gallery);
    let gallery = null;
    if (id) {
      try { gallery = await api.getGallery(id); } catch { gallery = null; }
    }
    if (!gallery) {
      gallery = await api.createGallery('我的思想年代', seedOps());
      id = gallery.id;
      writeLS(LS.gallery, id);
      const url = new URL(window.location);
      url.searchParams.set('gallery', id);
      window.history.replaceState(null, '', url);
    }
    // 离线期间留下的本地改动？进入合并流程
    const savedClientState = readLS(LS.ops);
    const savedBaseVersion = readLS(LS.base);
    setGalleryId(id);
    setServerState(gallery.state);
    baseSnapshotRef.current = gallery.state;
    setBaseVersion(gallery.head);
    setVersions(gallery.versions);

    if (savedClientState && JSON.stringify(savedClientState) !== JSON.stringify(gallery.state)) {
      const localBaseVersion = savedBaseVersion ?? gallery.head;
      if (gallery.head !== localBaseVersion) {
        // 期间服务端也有新版本 → 取分叉点快照，走三路合并
        let baseState = gallery.state;
        try {
          const snap = await api.getVersion(id, localBaseVersion);
          baseState = snap.state;
        } catch { /* 版本缺失则退化为以当前为分叉点 */ }
        baseSnapshotRef.current = baseState;
        setConflict(await buildConflict(gallery, baseState, savedClientState, localBaseVersion));
      } else {
        // 服务端未动：本地改动直接成为待提交状态
        baseSnapshotRef.current = gallery.state;
      }
      setState(savedClientState);
      setDirty(true);
      setSync('offline');
    } else {
      setState(gallery.state);
      setDirty(false);
      setSync('saved');
      setLastSavedAt(new Date());
      // 拉一次首屏预览
      refreshPreview(gallery.state, gallery.head);
    }
  }

  const seedOps = () => [
    { op: 'title', title: '我的思想年代' },
    { op: 'addEra', eraId: 'axial' },
    { op: 'addEra', eraId: 'classical' },
    { op: 'addEra', eraId: 'reason' },
    { op: 'place', refId: 'confucius', eraId: 'axial', order: 0 },
    { op: 'place', refId: 'socrates', eraId: 'axial', order: 1 },
    { op: 'place', refId: 'plato', eraId: 'classical', order: 0 },
    { op: 'addRelation', from: 'socrates', to: 'plato', kind: '师承' },
  ];

  // ---------- 本地编辑 ----------
  const mutate = useCallback((opsOrUpdater, opts = {}) => {
    if (!catalog) return;
    setState((prev) => {
      const ops = typeof opsOrUpdater === 'function'
        ? opsOrUpdater(prev)
        : Array.isArray(opsOrUpdater) ? opsOrUpdater : [opsOrUpdater];
      const next = applyOps(prev, ops, catalog);
      writeLS(LS.ops, next);
      writeLS(LS.base, baseVersion);
      // 本地预判（乐观提示，非最终裁决）
      return next;
    });
    setDirty(true);
    if (!opts.silent) scheduleSave();
  }, [catalog, baseVersion]);

  const replaceState = useCallback((next, markDirty = true) => {
    setState(next);
    writeLS(LS.ops, next);
    writeLS(LS.base, baseVersion);
    if (markDirty) { setDirty(true); scheduleSave(); }
  }, [catalog, baseVersion]);

  function scheduleSave() {
    if (!navigator.onLine) {
      setSync('offline');
      return;
    }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => commitState(stateRef.current), 900);
    setSync('saving');
  }

  // ---------- 服务端裁决（校验），随编辑节流刷新 ----------
  useEffect(() => {
    if (!catalog || !galleryId) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const report = await api.validateState(stateRef.current);
        if (!cancelled) setServerReport(report);
      } catch { /* 网络抖动时保留上一次裁决 */ }
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [state, catalog, galleryId]);

  // ---------- 提交（乐观版本号） ----------
  async function commitState(clientState, retryAfterMerge = false) {
    if (!galleryId || inflight.current) return;
    if (!navigator.onLine) { setSync('offline'); return; }
    inflight.current = true;
    setSync('saving');
    try {
      const ops = baseSnapshotRef.current
        ? diffToOps(baseSnapshotRef.current, clientState, catalog)
        : [];
      const result = await api.commit(galleryId, {
        baseVersion,
        ops,
        clientId: cid,
        withPreview: true,
      });
      // —— 保存成功 ——
      setBaseVersion(result.committedVersion);
      setServerState(result.current.state);
      baseSnapshotRef.current = result.current.state;
      setVersions(result.current.versions);
      writeLS(LS.gallery, galleryId);
      localStorage.removeItem(LS.ops);
      localStorage.removeItem(LS.base);

      // 服务端规范化后的状态回到本地（例如重复展厅被合并）
      setState(result.current.state);
      setDirty(false);
      setLastSavedAt(new Date(result.at));

      // —— 保存成功，但预览可能失败：二者独立 ——
      if (result.preview) {
        setPreview(result.preview);
        setPreviewState('ready');
        setSync('saved');
        setToast({ tone: 'ok', text: `已保存为第 ${result.committedVersion} 版，展览预览已更新。` });
      } else if (result.previewError) {
        setPreviewState('failed');
        setSync('preview-failed');
        setToast({
          tone: 'warn',
          text: `第 ${result.committedVersion} 版已安全入库，但展墙渲染暂时失败。版本不会丢失，可重试预览。`,
          action: { label: '重试预览', run: () => refreshPreview(result.current.state, result.committedVersion, result.versionId) },
        });
      } else {
        setSync('saved');
      }
    } catch (err) {
      if (err.status === 422 && err.body?.error === 'validation_rejected') {
        // 服务端拒绝：存在年代/关系硬伤。本地编辑原样保留，由问题面板引导修正。
        setServerReport(err.body.validation);
        setSync('error');
        const hard = err.body.validation.issues.filter((i) => i.severity === 'error');
        setToast({
          tone: 'error',
          text: `档案馆拒绝保存：${hard.length} 处年代/关系硬伤。点击「裁决」查看明细并采纳修正建议；策展注记级别的问题不受影响。`,
        });
      } else if (err.status === 409) {
        // —— 旧版本覆盖：拒绝，并打开合并台 ——
        setConflict(await buildConflict(err.body.current, serverStateRefSafe(), clientState, baseVersion));
        setSync('conflict');
        setToast({ tone: 'warn', text: `检测到并发编辑：墙上已是第 ${err.body.serverHead} 版，你基于第 ${err.body.requestedBase} 版改动。请在合并台裁决。` });
      } else {
        setSync('error');
        setToast({ tone: 'error', text: `保存失败：${err.message}。改动保留在本地。` });
      }
    } finally {
      inflight.current = false;
    }
  }

  function serverStateRefSafe() {
    return serverState ?? baseSnapshotRef.current ?? emptyState();
  }

  async function buildConflict(serverGalleryOrCurrent, base, clientState, bVersion) {
    const current = serverGalleryOrCurrent?.state ?? serverGalleryOrCurrent;
    let mergeInfo = null;
    try {
      mergeInfo = await api.merge(galleryId, {
        baseVersion: bVersion,
        clientState,
        strategy: 'manual',
        clientId: cid,
      });
    } catch {
      mergeInfo = { conflicts: [], proposedState: clientState };
    }
    return {
      serverHead: serverGalleryOrCurrent?.head ?? null,
      current,
      base,
      client: clientState,
      baseVersion: bVersion,
      mergeInfo,
    };
  }

  // 解决冲突：策略合并后落版
  const resolveConflict = useCallback(async (strategy, overrides = null) => {
    if (!conflict) return;
    setSync('merging');
    try {
      if (strategy === 'manual' && overrides) {
        // 用户在合并台逐项编辑后的最终状态，直接作为客户端状态再走一次合并落版
        const result = await api.merge(galleryId, {
          baseVersion: conflict.baseVersion,
          clientState: overrides,
          strategy: 'client',
          clientId: cid,
        });
        finishMerge(result);
      } else {
        const result = await api.merge(galleryId, {
          baseVersion: conflict.baseVersion,
          clientState: conflict.client,
          strategy,
          clientId: cid,
        });
        finishMerge(result);
      }
    } catch (err) {
      setSync('conflict');
      setToast({ tone: 'error', text: `合并失败：${err.message}` });
    }
  }, [conflict, galleryId, cid]);

  function finishMerge(result) {
    if (!result.merged) {
      setConflict({ ...conflict, mergeInfo: result });
      setSync('conflict');
      return;
    }
    setBaseVersion(result.committedVersion);
    setServerState(result.current.state);
    baseSnapshotRef.current = result.current.state;
    setState(result.current.state);
    setVersions(result.current.versions);
    setPreview(result.preview);
    setPreviewState('ready');
    setConflict(null);
    setDirty(false);
    localStorage.removeItem(LS.ops);
    localStorage.removeItem(LS.base);
    setSync('saved');
    setLastSavedAt(new Date(result.at));
    setToast({ tone: 'ok', text: `合并完成，已保存为第 ${result.committedVersion} 版（裁决了 ${result.conflictsResolved?.length ?? 0} 处分叉）。` });
  }

  const cancelConflict = useCallback(() => {
    // 放弃本地改动，以服务端为准
    if (!conflict) return;
    setState(conflict.current);
    baseSnapshotRef.current = conflict.current;
    setConflict(null);
    setDirty(false);
    localStorage.removeItem(LS.ops);
    setSync('saved');
  }, [conflict]);

  // ---------- 预览 ----------
  const refreshPreview = useCallback(async (stateToRender, version, versionId) => {
    if (!galleryId) return;
    setPreviewState('loading');
    try {
      const result = await api.galleryPreview(galleryId, stateToRender ?? stateRef.current);
      setPreview(result.preview);
      setPreviewState('ready');
      if (sync === 'preview-failed') setSync(dirty ? 'saving' : 'saved');
    } catch (err) {
      setPreviewState('failed');
      setToast({ tone: 'warn', text: '展墙渲染器暂时不可用，已保存的版本不受影响。', action: { label: '重试', run: () => refreshPreview(stateToRender, version, versionId) } });
    }
  }, [galleryId, sync, dirty]);

  // ---------- 在线/离线 ----------
  useEffect(() => {
    if (!online) {
      setSync('offline');
      clearTimeout(saveTimer.current);
      return;
    }
    // 重新上线：有待提交的本地改动 → 重合并
    if (galleryId && readLS(LS.ops) && JSON.stringify(readLS(LS.ops)) !== JSON.stringify(baseSnapshotRef.current)) {
      (async () => {
        setSync('merging');
        const localState = readLS(LS.ops);
        let gallery = null;
        try { gallery = await api.getGallery(galleryId); } catch { /* 稍后再试 */ }
        if (!gallery) {
          const ok = await waitForServer(3000);
          if (ok) { setToast({ tone: 'ok', text: '连接恢复，正在重新合并本地编排…' }); window.location.reload(); }
          return;
        }
        if (gallery.head === baseVersion) {
          // 无人并发：普通提交即可
          commitState(localState);
        } else {
          setConflict(await buildConflict(gallery, baseSnapshotRef.current, localState, baseVersion));
          setSync('conflict');
        }
      })();
    }
  }, [online]);

  const manualSave = useCallback(() => commitState(stateRef.current), [galleryId, baseVersion, catalog]);

  const resetGallery = useCallback(async () => {
    if (!catalog) return;
    const gallery = await api.createGallery('我的思想年代', seedOps());
    clearLS();
    writeLS(LS.gallery, gallery.id);
    const url = new URL(window.location);
    url.searchParams.set('gallery', gallery.id);
    window.history.replaceState(null, '', url);
    window.location.reload();
  }, [catalog]);

  const restoreVersion = useCallback(async (version) => {
    const snap = await api.getVersion(galleryId, version);
    replaceState(snap.state, true);
    setToast({ tone: 'ok', text: `已调出第 ${version} 版作为新的编辑底稿，保存后会成为新版本（旧版本永不覆盖）。` });
  }, [galleryId, replaceState]);

  return {
    catalog, catalogError, state, galleryId,
    mutate, replaceState,
    dirty, sync, online, lastSavedAt, toast, clearToast: () => setToast(null),
    conflict, resolveConflict, cancelConflict,
    serverReport, preview, previewState, refreshPreview,
    versions, baseVersion, manualSave, resetGallery, restoreVersion,
  };
}
