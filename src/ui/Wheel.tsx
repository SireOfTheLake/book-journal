// A spinning wheel with one equal wedge per category and a pointer at the top. The turning is plain CSS, so it is skipped when the page asks for less motion.
const COLORS = ['#c0603a', '#3f7f8c', '#7a5aa6', '#5d8a4a', '#b0893a', '#a04a6a', '#4a6aa6', '#8a6a4a'];
export interface WheelWedge { key: string; label: string; color: string | null }

const polar = (r: number, deg: number) => [Math.sin((deg * Math.PI) / 180) * r, -Math.cos((deg * Math.PI) / 180) * r] as const;
const short = (t: string) => (t.length > 14 ? `${t.slice(0, 13)}…` : t);

export default function Wheel({ wedges, rotation, spinMs, label }: { wedges: WheelWedge[]; rotation: number; spinMs: number; label: string }) {
  const n = wedges.length;
  const R = 150;
  const w = n ? 360 / n : 360;
  return (
    <div className="wheelwrap">
      <svg className="wheel" viewBox="-170 -170 340 340" role="img" aria-label={label}>
        <g className="wheelturn" style={{ transform: `rotate(${rotation}deg)`, transition: spinMs > 0 ? `transform ${spinMs}ms cubic-bezier(0.12, 0.6, 0.12, 1)` : 'none' }}>
          {n === 0 && <circle r={R} className="wedge empty" />}
          {n === 1 && <circle r={R} fill={wedges[0].color ?? COLORS[0]} className="wedge" />}
          {n > 1 && wedges.map((wd, i) => {
            const [x1, y1] = polar(R, i * w), [x2, y2] = polar(R, (i + 1) * w);
            return <path key={wd.key} className="wedge" fill={wd.color ?? COLORS[i % COLORS.length]} d={`M0 0 L${x1} ${y1} A${R} ${R} 0 ${w > 180 ? 1 : 0} 1 ${x2} ${y2} Z`} />;
          })}
          {wedges.map((wd, i) => {
            const mid = (i + 0.5) * w;
            const flip = mid > 180;
            return (
              <text key={`t${wd.key}`} className="wedgelabel" textAnchor={flip ? 'start' : 'end'} dominantBaseline="middle" fontSize={n > 8 ? 11 : 13}
                transform={flip ? `rotate(${mid - 90}) rotate(180) translate(${-(R - 12)}, 0)` : `rotate(${mid - 90}) translate(${R - 12}, 0)`}>{short(wd.label)}</text>
            );
          })}
        </g>
        <circle r="14" className="hub" />
        <path className="pointer" d="M-11 -166 L11 -166 L0 -138 Z" />
      </svg>
    </div>
  );
}
