// Color conversions for the color picker: HEX, RGB and HSL codes, and the hue / saturation / brightness the color wheel works in.
export type Rgb = { r: number; g: number; b: number };
export type Hsv = { h: number; s: number; v: number }; // h 0-360, s and v 0-1
export type ColorFormat = 'HEX' | 'RGB' | 'HSL';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
export const rgbToHex = ({ r, g, b }: Rgb) => `#${[r, g, b].map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')).join('')}`;

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  let h = 0;
  if (d) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}
export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return { r: f(5) * 255, g: f(3) * 255, b: f(1) * 255 };
}
export function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const { h } = rgbToHsv({ r, g, b });
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2, d = max - min;
  return { h, s: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l };
}
export function hslToRgb({ h, s, l }: { h: number; s: number; l: number }): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export function formatColor(hex: string, format: ColorFormat): string {
  const rgb = hexToRgb(hex);
  if (format === 'HEX') return hex.toLowerCase();
  if (format === 'RGB') return `${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}`;
  const { h, s, l } = rgbToHsl(rgb);
  return `${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`;
}

// Reads what was typed in the chosen format ("#c4683d", "196, 104, 61" or "21, 54%, 51%"); null when it is not a color.
export function parseColor(text: string, format: ColorFormat): string | null {
  const t = text.trim();
  if (format === 'HEX') {
    const h = t.startsWith('#') ? t : `#${t}`;
    if (/^#[0-9a-f]{3}$/i.test(h)) return `#${[...h.slice(1)].map((c) => c + c).join('')}`.toLowerCase();
    return isHex(h) ? h.toLowerCase() : null;
  }
  const nums = t.replace(/^(rgb|hsl)a?\(|\)$/gi, '').split(/[\s,]+/).filter(Boolean).map((p) => Number.parseFloat(p));
  if (nums.length !== 3 || nums.some((n) => Number.isNaN(n))) return null;
  if (format === 'RGB') return nums.every((n) => n >= 0 && n <= 255) ? rgbToHex({ r: nums[0], g: nums[1], b: nums[2] }) : null;
  const [h, s, l] = nums;
  return s >= 0 && s <= 100 && l >= 0 && l <= 100 ? rgbToHex(hslToRgb({ h: ((h % 360) + 360) % 360, s: s / 100, l: l / 100 })) : null;
}
