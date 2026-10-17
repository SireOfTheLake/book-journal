import type { Tracker } from '../../domain/challenges';

// "4/20", "20%" and "16 left", with a bar.
export default function TrackerBar({ t, color }: { t: Tracker; color?: string }) {
  return (
    <div className="ctracker" role="group" aria-label="Progress">
      <span className="cdone">{t.done}/{t.total}</span>
      <span className="cpct">{t.percent}%</span>
      <span className="cleft">{t.left} left</span>
      <span className="cbar" aria-hidden="true"><span style={{ width: `${t.percent}%`, background: color ?? 'var(--accent)' }} /></span>
    </div>
  );
}
