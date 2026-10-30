import { useEffect, useRef, useState } from 'react';
import { formatColor, hexToRgb, hsvToRgb, parseColor, rgbToHex, rgbToHsv, type ColorFormat, type Hsv } from '../domain/colorConv';
import { MONTH_COLORS } from '../domain/months';

// The colors of the twelve months as they are right now (the theme settings can change them).
function monthHexes(): string[] {
  if (typeof document === 'undefined') return MONTH_COLORS;
  const cs = getComputedStyle(document.documentElement);
  return MONTH_COLORS.map((fallback, i) => { const v = cs.getPropertyValue(`--month-${i + 1}`).trim(); return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback; });
}
const SIZE = 150;
const FORMATS: ColorFormat[] = ['HEX', 'RGB', 'HSL'];

// A color wheel (hue around, saturation outward) with a brightness slider, the color as a HEX, RGB or HSL code, and a drawer with the month colors.
export default function ColorPicker({ value, onChange, label = 'Color' }: { value: string; onChange(hex: string): void; label?: string }) {
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(hexToRgb(value)));
  const [format, setFormat] = useState<ColorFormat>('HEX');
  const hex = rgbToHex(hsvToRgb(hsv));
  const [text, setText] = useState(formatColor(value, 'HEX'));
  const [bad, setBad] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wheel = useRef<HTMLDivElement>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const show = (h: string, f: ColorFormat = format) => { setText(formatColor(h, f)); setBad(false); };
  // Dragging changes the color on screen straight away; it is saved a moment after you stop.
  const draft = (next: Hsv) => {
    setHsv(next);
    const h = rgbToHex(hsvToRgb(next));
    show(h);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(h), 250);
  };
  const choose = (h: string) => { if (timer.current) clearTimeout(timer.current); setHsv(rgbToHsv(hexToRgb(h))); show(h); onChange(h); };
  const fromPointer = (e: React.PointerEvent) => {
    const r = wheel.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const s = Math.min(1, Math.hypot(dx, dy) / (r.width / 2));
    draft({ h: ((Math.atan2(dy, dx) * 180) / Math.PI + 450) % 360, s, v: hsv.v });
  };
  const commitText = () => {
    const h = parseColor(text, format);
    if (!h) { setBad(true); return; }
    choose(h);
  };
  const a = (hsv.h * Math.PI) / 180 - Math.PI / 2;
  const mark = { left: SIZE / 2 + Math.cos(a) * hsv.s * (SIZE / 2), top: SIZE / 2 + Math.sin(a) * hsv.s * (SIZE / 2) };

  return (
    <div className="cpicker" role="group" aria-label={`${label} picker`}>
      <div ref={wheel} className="cwheel" role="img" aria-label="Color wheel" style={{ width: SIZE, height: SIZE, filter: `brightness(${hsv.v})` }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); fromPointer(e); }} onPointerMove={(e) => { if (e.buttons) fromPointer(e); }}>
        <span className="cmark" style={{ left: mark.left, top: mark.top, background: hex }} />
      </div>
      <label className="cbright"><span className="muted small">Brightness</span>
        <input type="range" min={0} max={100} aria-label="Brightness" value={Math.round(hsv.v * 100)} onChange={(e) => draft({ ...hsv, v: Number(e.target.value) / 100 })} /></label>
      <div className="ccode">
        <span className="cswatch" style={{ background: hex }} />
        <select className="field" aria-label="Color code" value={format} onChange={(e) => { const f = e.target.value as ColorFormat; setFormat(f); show(hex, f); }}>
          {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <input className={`field${bad ? ' bad' : ''}`} aria-label={`${format} code`} aria-invalid={bad} value={text} onChange={(e) => { setText(e.target.value); setBad(false); }} onBlur={commitText} onKeyDown={(e) => e.key === 'Enter' && commitText()} />
      </div>
      <details className="cdrawer">
        <summary>Month colors</summary>
        <span className="swatches">{[...new Set(monthHexes())].map((c, i) => <button key={i} type="button" className="swatch" style={{ background: c }} aria-label={`Use color ${c}`} onClick={() => choose(c)} />)}</span>
      </details>
    </div>
  );
}
