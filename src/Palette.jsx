// 展品目录面板：可拖拽，也可用按钮添加（可访问替代方案）
export default function Palette({ catalog, onAdd, usedRefs }) {
  const groups = [
    { key: 'era', title: '时代节点', items: catalog.eras, label: (e) => `${e.name}（${fmtYear(e.start)}–${fmtYear(e.end)}）` },
    { key: 'philosopher', title: '哲学家', items: catalog.philosophers, label: (p) => `${p.name}（${fmtYear(p.birth)}–${fmtYear(p.death)}）` },
    { key: 'question', title: '核心问题', items: catalog.questions, label: (q) => `「${q.text}」` },
  ];
  return (
    <aside className="palette" aria-label="展品目录">
      <h2>展品目录</h2>
      <p className="hint">拖拽到展墙，或点击「挂上」。</p>
      {groups.map((g) => (
        <section key={g.key}>
          <h3>{g.title}</h3>
          <ul>
            {g.items.map((item) => {
              const used = usedRefs.has(item.id);
              return (
                <li key={item.id}>
                  <div
                    className={`palette-item kind-${g.key} ${used ? 'used' : ''}`}
                    draggable={!used}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-pc-item', JSON.stringify({ kind: g.key, refId: item.id }));
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                  >
                    <span>{g.label(item)}</span>
                    <button
                      type="button"
                      disabled={used}
                      onClick={() => onAdd(g.key, item.id)}
                      aria-label={`挂上 ${g.label(item)}`}
                    >
                      {used ? '已挂上' : '挂上'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </aside>
  );
}

export function fmtYear(y) {
  return y < 0 ? `前${-y}` : `${y}`;
}
