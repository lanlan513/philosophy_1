import { History, RotateCcw, X } from 'lucide-react';

export function VersionDrawer({ open, onClose, versions, head, onRestore }) {
  if (!open) return null;
  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="version-drawer" role="dialog" aria-modal="true" aria-label="版本史">
        <header>
          <div><span className="kicker"><History size={12} /> IMMUTABLE VERSIONS</span><h3>布展版本史</h3></div>
          <button onClick={onClose} aria-label="关闭版本史"><X size={16} /></button>
        </header>
        <p className="drawer-intro">每次正式保存都会追加一个版本，旧版本永不覆盖。调出任意版本只是换一个编辑底稿，保存后成为新版本。</p>
        <ol>
          {[...versions].reverse().map((v) => (
            <li key={v.version} className={v.version === head ? 'is-head' : ''}>
              <div className="version-no">v{v.version}</div>
              <div className="version-meta">
                <b>{v.message}{v.source?.kind === 'server-merge' && <span className="merge-tag">合并版</span>}</b>
                <time>{new Date(v.at).toLocaleString('zh-CN', { hour12: false })}</time>
                <small>策展人 {v.client} · 基于 v{v.baseVersion ?? '—'} · {v.versionId.slice(0, 8)}</small>
              </div>
              {v.version !== head && (
                <button className="ghost-button" onClick={() => { onRestore(v.version); onClose(); }}>
                  <RotateCcw size={13} /> 调出
                </button>
              )}
              {v.version === head && <span className="head-tag">当前墙上</span>}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
