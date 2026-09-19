import { useEffect, useMemo, useState } from 'react';
import { Cloud, CloudOff, History, Loader2, Save, Wifi, WifiOff, X } from 'lucide-react';
import { useCentury } from './useCentury';
import { Timeline } from './Timeline';
import { ScrollView } from './ScrollView';
import { Palette } from './Palette';
import { PreviewPane, ValidationStrip, IssueDrawer } from './PreviewPane';
import { ConflictDialog } from './ConflictDialog';
import { RelationEditor } from './RelationEditor';
import { VersionDrawer } from './VersionDrawer';
import { TargetPicker } from './TargetPicker';
import './century.css';

function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)');
    const fn = (e) => setMobile(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return mobile;
}

export function CenturyPage() {
  const c = useCentury();
  const mobile = useIsMobile();
  const [relationsFor, setRelationsFor] = useState(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [pick, setPick] = useState(null);

  if (!c.catalog) {
    return (
      <main className="century-loading">
        <Loader2 size={26} className="spin" />
        <p>{c.catalogError ? '无法连接档案馆服务。' : '正在打开档案馆…'}</p>
        {c.catalogError && (
          <div className="loading-hint">
            <p>思想年代的时间逻辑由本地服务端裁决，请在另一个终端运行：</p>
            <pre>npm run century</pre>
            <p>开发时另开 <code>npm run dev</code>（/api 已配置代理）。离线期间的本地编排仍会保留，重连后合并。</p>
          </div>
        )}
      </main>
    );
  }

  const errors = c.serverReport?.issues.filter((i) => i.severity === 'error').length ?? 0;
  const warnings = c.serverReport?.issues.filter((i) => i.severity === 'warning').length ?? 0;

  return (
    <div className={`century-shell ${!c.online ? 'is-offline' : ''} ${mobile ? 'is-mobile' : 'is-desktop'}`}>
      <header className="century-topbar">
        <div className="century-brand">
          <span className="brand-mark">Φ</span>
          <div>
            <span className="kicker">A PERSONAL CENTURY</span>
            <h1>我的思想年代</h1>
          </div>
        </div>
        <input
          className="title-input"
          value={c.state.title}
          maxLength={80}
          aria-label="展览标题"
          onChange={(e) => c.mutate([{ op: 'title', title: e.target.value }])}
        />
        <div className="topbar-actions">
          <SyncBadge sync={c.sync} online={c.online} dirty={c.dirty} lastSavedAt={c.lastSavedAt} />
          <button className="ghost-button" onClick={c.manualSave} disabled={!c.dirty || c.sync === 'saving' || c.sync === 'merging'}>
            <Save size={14} /> 保存版本
          </button>
          <button className="ghost-button" onClick={() => setIssuesOpen(true)} aria-label="查看服务端校验明细">
            裁决 <span className={`issue-count ${errors ? 'has-err' : warnings ? 'has-warn' : ''}`}>{errors || warnings || '✓'}</span>
          </button>
          <button className="ghost-button" onClick={() => setVersionsOpen(true)}><History size={14} /> 版本</button>
        </div>
      </header>

      <div className={mobile ? 'century-body-mobile' : 'century-body'}>
        {mobile ? (
          <>
            <div className="mobile-stage">
              <ScrollView catalog={c.catalog} state={c.state} report={c.serverReport} mutate={c.mutate} onOpenRelation={setRelationsFor} />
            </div>
            <div className="mobile-palette">
              <Palette catalog={c.catalog} state={c.state} mutate={c.mutate} onPickTarget={setPick} />
            </div>
            <div className="mobile-preview">
              <PreviewPane preview={c.preview} previewState={c.previewState} onRetry={() => c.refreshPreview(c.state, c.baseVersion)} version={c.baseVersion} dirty={c.dirty} />
            </div>
          </>
        ) : (
          <>
            <div className="stage-column">
              <ValidationStrip report={c.serverReport} />
              <Timeline catalog={c.catalog} state={c.state} report={c.serverReport} mutate={c.mutate} onOpenRelation={setRelationsFor} />
              <Palette catalog={c.catalog} state={c.state} mutate={c.mutate} onPickTarget={setPick} />
            </div>
            <div className="preview-column">
              <PreviewPane preview={c.preview} previewState={c.previewState} onRetry={() => c.refreshPreview(c.state, c.baseVersion)} version={c.baseVersion} dirty={c.dirty} />
            </div>
          </>
        )}
      </div>

      {c.toast && (
        <div className={`toast toast-${c.toast.tone}`} role="status">
          {c.toast.tone === 'error' ? <WifiOff size={15} /> : c.toast.tone === 'warn' ? <CloudOff size={15} /> : <Cloud size={15} />}
          <span>{c.toast.text}</span>
          {c.toast.action && <button className="toast-action" onClick={c.toast.action.run}>{c.toast.action.label}</button>}
          <button className="toast-x" onClick={c.clearToast} aria-label="关闭提示"><X size={13} /></button>
        </div>
      )}

      {c.conflict && <ConflictDialog conflict={c.conflict} onResolve={c.resolveConflict} onCancel={c.cancelConflict} />}
      {relationsFor && <RelationEditor catalog={c.catalog} state={c.state} mutate={c.mutate} openRefId={relationsFor} onClose={() => setRelationsFor(null)} />}
      {pick && <TargetPicker catalog={c.catalog} pick={pick} state={c.state} mutate={c.mutate} onClose={() => setPick(null)} />}
      <IssueDrawer report={c.serverReport} open={issuesOpen} onClose={() => setIssuesOpen(false)} onApplyFix={(issue) => {
        if (issue.fix?.startsWith('place:')) {
          const eraId = issue.fix.slice(6);
          const count = Object.values(c.state.placements).filter((p) => p.eraId === eraId && p.lane === 'person').length;
          c.mutate([{ op: 'place', refId: issue.about, eraId, order: count, lane: 'person' }]);
        }
      }} />
      <VersionDrawer open={versionsOpen} onClose={() => setVersionsOpen(false)} versions={c.versions} head={c.baseVersion} onRestore={c.restoreVersion} />
    </div>
  );
}

function SyncBadge({ sync, online, dirty, lastSavedAt }) {
  if (!online) {
    return <span className="sync-badge sync-offline"><WifiOff size={13} /> 离线 · 改动暂存本机</span>;
  }
  if (sync === 'saving') return <span className="sync-badge sync-saving"><Loader2 size={13} className="spin" /> 保存中…</span>;
  if (sync === 'merging') return <span className="sync-badge sync-merging"><Loader2 size={13} className="spin" /> 合并中…</span>;
  if (sync === 'conflict') return <span className="sync-badge sync-conflict"><Wifi size={13} /> 待合并</span>;
  if (sync === 'preview-failed') return <span className="sync-badge sync-warn"><CloudOff size={13} /> 已入库 · 预览待重试</span>;
  if (sync === 'error') return <span className="sync-badge sync-error"><WifiOff size={13} /> 保存失败 · 已本地暂存</span>;
  if (dirty) return <span className="sync-badge sync-dirty"><Wifi size={13} /> 有未保存改动</span>;
  return (
    <span className="sync-badge sync-ok" title={lastSavedAt ? `上次保存 ${new Date(lastSavedAt).toLocaleString('zh-CN', { hour12: false })}` : ''}>
      <Cloud size={13} /> 已同步{lastSavedAt ? ` ${new Date(lastSavedAt).toLocaleTimeString('zh-CN', { hour12: false })}` : ''}
    </span>
  );
}
