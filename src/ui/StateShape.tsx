import { shapeOf } from '../domain/maps';
import type { MapId } from '../domain/maps';

// One place drawn on its own (state, province, continent or country), filled with its color or just outlined while it has no book.
// A tiny place is drawn from its enlarged copy (st) so the sticker is easy to see.
export default function StateShape({ name, color, size = 56, region = 'us' }: { name: string; color?: string | null; size?: number; region?: MapId }) {
  const s = shapeOf(region, name);
  if (!s) return null;
  const big = s.marker && s.st;
  const [x, y, w, h] = big ? [0, 0, 100, 100] : s.box;
  const pad = big ? 0 : 3;
  const d = big ? s.st! : s.d;
  if (!d) return <span className="stateshape stbadge" role="img" aria-label={color ? `${name}, filled in` : `${name}, empty`} style={{ width: size, height: size, lineHeight: `${size}px`, background: color ?? 'transparent' }}>{s.label}</span>;
  return (
    <svg className="stateshape" role="img" aria-label={color ? `${name}, filled in` : `${name}, empty`} width={size} height={size} viewBox={`${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}`} preserveAspectRatio="xMidYMid meet">
      <path d={d} fill={color ?? 'none'} stroke={color ? 'var(--bg)' : 'var(--line2)'} strokeWidth={color ? 1.5 : 3} strokeDasharray={color ? undefined : '8 6'} strokeLinejoin="round" />
    </svg>
  );
}
