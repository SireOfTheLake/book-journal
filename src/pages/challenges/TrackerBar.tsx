import type { Tracker } from '../../domain/challenges';

// "4/20", "20%" and "16 left", with a bar.
export default function TrackerBar({ t, color, bonus }: { t: Tracker; color?: string; bonus?: { done: number; total: number } | null }) {
  return (
    <div className="ctracker" role="group" aria-label="Progress">
      <span className="cdone">{t.done}/{t.total}{bonus ? <span className="cbonus"> (+{bonus.done} bonus)</span> : null}</span>
      <span className="cpct">{t.percent}%</span>
      <span className="cleft">{t.left} left</span>
      <span className="cbar" aria-hidden="true"><span style={{ width: `${t.percent}%`, background: color ?? 'var(--accent)' }} /></span>
    </div>
  );
}
