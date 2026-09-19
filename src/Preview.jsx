// 展览预览：把当前编排实时渲染成可阅读的展签文本。
// 若本地渲染失败（保存成功但预览失败），自动降级为服务端生成的预览。
import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { fmtYear } from './Palette.jsx';

export default function Preview({ catalog, nodes, timelineId, version, saveState }) {
  const [localError, setLocalError] = useState(null);
  const [serverData, setServerData] = useState(null);
  const [serverFailed, setServerFailed] = useState(false);

  const local = useMemo(() => {
    try {
      return { ok: true, sections: buildLocal(catalog, nodes) };
    } catch (e) {
      return { ok: false, error: e };
    }
  }, [catalog, nodes]);

  // 本地渲染失败 → 拉取服务端兜底预览
  useEffect(() => {
    if (local.ok) { setLocalError(null); setServerFailed(false); return; }
    setLocalError(String(local.error?.message ?? local.error));
    let dead = false;
    api.serverPreview(timelineId)
      .then(({ status, body }) => { if (!dead) (status === 200 ? setServerData(body) : setServerFailed(true)); })
      .catch(() => { if (!dead) setServerFailed(true); });
    return () => { dead = true; };
  }, [local, timelineId, version]);

  if (local.ok) {
    return (
      <aside className="preview" aria-label="展览预览">
        <h2>展览预览 <span className="preview-src">实时</span></h2>
        {saveState === 'dirty' && <p className="preview-note">有未保存的修改，预览为当前编排。</p>}
        <Sections sections={local.sections} />
      </aside>
    );
  }

  if (serverData && !serverFailed) {
    return (
      <aside className="preview degraded" aria-label="展览预览（服务端兜底）">
        <h2>展览预览 <span className="preview-src warn">服务端兜底</span></h2>
        <p className="preview-note">本地预览渲染失败（{localError}），以下为服务端按最近保存版本（v{serverData.version}）生成的预览。</p>
        <Sections sections={serverData.sections.map((s) => ({ heading: s.heading, items: s.items.map((it) => ({ title: it.title, body: it.body })) }))} />
      </aside>
    );
  }

  return (
    <aside className="preview degraded">
      <h2>展览预览 <span className="preview-src warn">不可用</span></h2>
      <p className="preview-note">本地与服务端预览均失败。你的编排已安全保存（版本 v{version}），可刷新重试。</p>
      <pre className="preview-raw">{JSON.stringify(nodes, null, 2)}</pre>
    </aside>
  );
}

function Sections({ sections }) {
  if (!sections.length) return <p className="empty-hint">挂上展品后，这里会生成可阅读的展览文本。</p>;
  return (
    <div className="preview-body">
      {sections.map((s, i) => (
        <section key={i}>
          <h3>{s.heading}</h3>
          {s.items.map((it, j) => (
            <article key={j} className="label-card">
              <h4>{it.title}</h4>
              {it.body && <p>{it.body}</p>}
            </article>
          ))}
          {s.items.length === 0 && <p className="empty-hint">（此时代下暂无展品）</p>}
        </section>
      ))}
    </div>
  );
}

// 本地预览构建：时代 → 其下哲学家（含悬挂的问题）→ 未归入时代的散件
function buildLocal(catalog, nodes) {
  const refOf = (kind, refId) => {
    const t = kind === 'era' ? catalog.eras : kind === 'philosopher' ? catalog.philosophers : catalog.questions;
    const r = t.find((x) => x.id === refId);
    if (!r) throw new Error(`目录缺少 ${kind}:${refId}`);
    return r;
  };
  const eraNodes = nodes.filter((n) => n.kind === 'era').sort((a, b) => refOf('era', a.refId).start - refOf('era', b.refId).start);
  const used = new Set();
  const sections = [];

  const describe = (n) => {
    if (n.kind === 'philosopher') {
      const p = refOf('philosopher', n.refId);
      const qs = nodes.filter((c) => c.parentId === n.id && c.kind === 'question')
        .map((c) => `「${refOf('question', c.refId).text}」`);
      qs.forEach(() => {});
      nodes.filter((c) => c.parentId === n.id).forEach((c) => used.add(c.id));
      return { title: `${p.name}（${fmtYear(p.birth)}–${fmtYear(p.death)}）`, body: p.summary + (qs.length ? ` 悬问：${qs.join('；')}` : '') };
    }
    if (n.kind === 'question') return { title: `「${refOf('question', n.refId).text}」`, body: '' };
    return null;
  };

  for (const e of eraNodes) {
    const era = refOf('era', e.refId);
    const children = nodes.filter((n) => n.parentId === e.id).sort((a, b) => a.year - b.year);
    children.forEach((c) => used.add(c.id));
    used.add(e.id);
    sections.push({ heading: `${era.name}（${fmtYear(era.start)}–${fmtYear(era.end)}）`, items: children.map(describe).filter(Boolean) });
  }
  const orphans = nodes.filter((n) => !used.has(n.id) && n.kind !== 'era').sort((a, b) => a.year - b.year);
  if (orphans.length) sections.push({ heading: '未归入时代', items: orphans.map(describe).filter(Boolean) });
  return sections;
}
