import type { GoalDisplay } from '../domain/goals';

// A goal's progress as a ring that fills up (with the percentage in the middle) or as a bar that fills up.
export default function GoalGauge({ percent, display, label, state, size = 84 }: { percent: number; display: GoalDisplay; label: string; state?: string; size?: number }) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  if (display === 'bar') {
    return <div className="goalbar" role="progressbar" aria-label={`${label} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p}><span style={{ width: `${p}%` }} className={state} /></div>;
  }
  const stroke = Math.max(7, Math.round(size / 9));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="goalring" style={{ width: size, height: size }} role="progressbar" aria-label={`${label} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--panel2)" strokeWidth={stroke} />
        <circle className={`ringfill ${state ?? ''}`} cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${(c * p) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="ringnum">{p}%</span>
    </div>
  );
}
