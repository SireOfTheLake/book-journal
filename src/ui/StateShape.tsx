import { shapeOf } from '../domain/usMap';

// One state drawn on its own, filled with its color (or just outlined while it has no book).
export default function StateShape({ name, color, size = 56 }: { name: string; color?: string | null; size?: number }) {
  const s = shapeOf(name);
  if (!s) return null;
  const [x, y, w, h] = s.box;
  const pad = 3;
  return (
    <svg className="stateshape" role="img" aria-label={color ? `${name}, filled in` : `${name}, empty`} width={size} height={size} viewBox={`${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}`} preserveAspectRatio="xMidYMid meet">
      <path d={s.d} fill={color ?? 'none'} stroke={color ? 'var(--bg)' : 'var(--line2)'} strokeWidth={color ? 1.5 : 3} strokeDasharray={color ? undefined : '8 6'} strokeLinejoin="round" />
    </svg>
  );
}
