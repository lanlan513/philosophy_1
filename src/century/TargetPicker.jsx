import { X } from 'lucide-react';

// 无拖拽时的可达落点：从库房点「挂墙」，在对话框里选展厅与位置。
export function TargetPicker({ catalog, pick, onClose, mutate, state }) {
  if (!pick) return null;
  const refId = pick.refId;
  const isQuestion = pick.kind === 'question';
  const ref = isQuestion
    ? catalog.questions.find((q) => q.id === refId)
    : catalog.people.find((p) => p.id === refId);

  const wallable = pick.wallable
    .map((id) => catalog.eras.find((e) => e.id === id))
    .filter(Boolean);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal target-modal" role="dialog" aria-modal="true" aria-label={`把${ref.name ?? ref.label}挂上墙`}>
        <header>
          <div className="kicker">HANG ON THE WALL</div>
          <h2>把「{ref.name ?? ref.label}」挂在哪里？</h2>
          <button className="modal-x" onClick={onClose} aria-label="关闭"><X size={16} /></button>
        </header>
        {isQuestion && <p className="target-note">核心问题不设年代门槛，可以挂在任何展厅——它会在不属于自己的年代制造陌生化的对话。</p>}
        {!isQuestion && <p className="target-note">档案馆将依据其生卒年份校验：只能挂入生命有重叠的展厅。</p>}
        <div className="target-rooms">
          {wallable.length === 0 && <p className="rack-empty">墙上还没有与其生命重叠的展厅，请先在库房加入时代节点。</p>}
          {wallable.map((era) => {
            const count = Object.values(state.placements).filter((p) => p.eraId === era.id && p.lane === (isQuestion ? 'question' : 'person')).length;
            return (
              <button key={era.id} className="target-room" onClick={() => {
                mutate([{ op: 'place', refId, eraId: era.id, order: count, lane: isQuestion ? 'question' : 'person' }]);
                onClose();
              }}>
                <span className="era-swatch" style={{ background: era.color }} />
                <b>{era.name}</b>
                <small>已有 {count} 件{isQuestion ? '问题' : '作品'}</small>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
