import { AlertTriangle, BookOpen, CheckCircle2, Loader2, RefreshCw, ScrollText } from 'lucide-react';
import { useMemo } from 'react';

// 右侧「展览预览」：渲染服务端生成的可读墙签。
// 与保存解耦：可能出现「已入库 vN，但本次渲染失败」。

export function PreviewPane({ preview, previewState, onRetry, version, dirty }) {
  return (
    <section className="preview-pane" aria-label="展览预览" aria-live="polite">
      <header className="preview-head">
        <div>
          <span className="kicker">LIVE EXHIBITION PREVIEW</span>
          <h3>展览预览</h3>
        </div>
        <button className="ghost-button" onClick={onRetry} disabled={previewState === 'loading'}>
          {previewState === 'loading' ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
          重新渲染
        </button>
      </header>

      {previewState === 'failed' && (
        <div className="preview-fail" role="alert">
          <AlertTriangle size={18} />
          <div>
            <b>展墙渲染器暂时离线。</b>
            <p>你的编排版本已经安全保存在档案馆，不会丢失。网络恢复后可在此重新渲染。</p>
            <button className="solid-button" onClick={onRetry}><RefreshCw size={14} />重试渲染</button>
          </div>
        </div>
      )}

      {previewState === 'loading' && !preview && (
        <div className="preview-loading"><Loader2 size={20} className="spin" /><p>正在排版墙签…</p></div>
      )}

      {preview && (
        <article className={previewState === 'failed' ? 'is-stale' : ''}>
          <div className="preview-cover">
            <span className="cover-eyebrow">A PERSONAL CENTURY</span>
            <h2>{preview.title}{dirty && <em className="dirty-dot" title="有未保存改动">·</em>}</h2>
            <p className="cover-meta">{preview.subtitle}</p>
            <p className="cover-synopsis">{preview.synopsis}</p>
          </div>

          <div className="preview-rooms">
            {preview.rooms.map((room) => (
              <div key={room.eraId} className="preview-room">
                <div className="room-marker">
                  <span className="room-no">{String(room.index).padStart(2, '0')}</span>
                  <span className="room-line" />
                </div>
                <div className="room-body">
                  <h3>{room.name}</h3>
                  <p className="room-en">{room.en} · {room.years} · {room.region}</p>
                  <p className="wall-text"><ScrollText size={13} />{room.wallText}</p>

                  {room.paintings.length > 0 && (
                    <ul className="wall-labels">
                      {room.paintings.map((p) => (
                        <li key={p.refId} className={p.onLoan ? 'is-loan' : ''}>
                          <div className="label-no">{String(p.index).padStart(2, '0')}</div>
                          <div>
                            <h4>{p.name} <small>{p.latin}</small>{p.onLoan && <span className="loan-tag">借展</span>}</h4>
                            <p className="label-years">{p.label} · {p.tradition}</p>
                            <p className="label-idea">{p.idea} —— <q>{p.quote}</q></p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {room.questions.length > 0 && (
                    <div className="room-questions">
                      <h5>本厅悬挂的问题</h5>
                      {room.questions.map((q) => (
                        <div key={q.refId} className="room-q"><BookOpen size={12} /><b>{q.label}</b><span>{q.hint}</span></div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {preview.arcs.length > 0 && (
            <div className="preview-arcs">
              <h4>弧线目录</h4>
              <ul>
                {preview.arcs.map((arc, i) => (
                  <li key={i}><span className="arc-from">{arc.from}</span><span className="arc-kind">{arc.kind}{arc.catalogKind && <em>（典册作「{arc.catalogKind}」）</em>}</span><span className="arc-to">{arc.to}</span><span className="arc-source">{arc.source}</span></li>
                ))}
              </ul>
            </div>
          )}

          {preview.curatorNotes.length > 0 && (
            <aside className="curator-notes">
              <h4><AlertTriangle size={14} /> 策展注记（服务端校验）</h4>
              <ul>{preview.curatorNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </aside>
          )}

          <footer className="preview-colophon">{preview.colophon}</footer>
        </article>
      )}
    </section>
  );
}

export function ValidationStrip({ report }) {
  const errors = report?.issues.filter((i) => i.severity === 'error') ?? [];
  const warnings = report?.issues.filter((i) => i.severity === 'warning') ?? [];
  return (
    <div className="validation-strip" aria-live="polite">
      {errors.length > 0 ? (
        <span className="v-status v-error"><AlertTriangle size={14} />{errors.length} 处年代/关系硬伤需修正</span>
      ) : warnings.length > 0 ? (
        <span className="v-status v-warning"><AlertTriangle size={14} />{warnings.length} 条策展注记</span>
      ) : report ? (
        <span className="v-status v-ok"><CheckCircle2 size={14} />年代与关系均与典册相合</span>
      ) : <span className="v-status"><Loader2 size={14} className="spin" />等待服务端裁决…</span>}
      {report && <span className="v-stats">{report.stats.eras} 厅 · {report.stats.people} 人 · {report.stats.questions} 问 · {report.stats.relations} 线</span>}
    </div>
  );
}

export function IssueDrawer({ report, open, onClose, onApplyFix }) {
  if (!open || !report) return null;
  const issues = [...report.issues].sort((a, b) => (a.severity === 'error' ? -1 : 1));
  return (
    <div className="issue-drawer" role="dialog" aria-modal="true" aria-label="服务端校验明细">
      <header><h3>档案馆裁决明细</h3><button onClick={onClose}>收起</button></header>
      <ul>
        {issues.map((i, n) => (
          <li key={n} className={`issue-row issue-${i.severity}`}>
            <span className="issue-level">{i.severity === 'error' ? '硬伤' : '注记'}</span>
            <div>
              <p>{i.message}</p>
              {i.fix && <button className="link-button" onClick={() => onApplyFix?.(i)}>采纳建议</button>}
            </div>
          </li>
        ))}
        {issues.length === 0 && <li className="issue-clean"><CheckCircle2 size={16} /> 没有发现问题。</li>}
      </ul>
    </div>
  );
}
