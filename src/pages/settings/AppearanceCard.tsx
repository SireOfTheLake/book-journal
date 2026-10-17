import { MONTH_COLORS, MONTH_NAMES } from '../../domain/months';
import { useTheme } from '../../theme/ThemeContext';
import { CUSTOM_KEYS, DEFAULT_THEME, presetById, presetsFor, resolveVars, type CustomKey, type Mode } from '../../theme/themes';

const CUSTOM_LABEL: Record<CustomKey, string> = { accent: 'Accent', bg: 'Background', panel: 'Cards', side: 'Sidebar', text: 'Text' };
const MODE_LABEL: Record<Mode, string> = { dark: 'Dark', light: 'Light' };

function Swatches({ mode }: { mode: Mode }) {
  const { theme, update } = useTheme();
  return (
    <div className="stack">
      <span className="lbl2">{MODE_LABEL[mode]} themes</span>
      <div className="presets" role="group" aria-label={`${MODE_LABEL[mode]} themes`}>
        {presetsFor(mode).map((p) => (
          <button type="button" key={p.id} className={`preset ${theme.presets[mode] === p.id ? 'on' : ''}`} aria-pressed={theme.presets[mode] === p.id} aria-label={`${p.name} theme`}
            onClick={() => update((t) => ({ ...t, presets: { ...t.presets, [mode]: p.id }, mode }))}>
            <span className="presetpic" style={{ background: p.palette.bg, borderColor: p.palette.line2 }}>
              <span style={{ background: p.palette.side }} /><span style={{ background: p.palette.panel, borderColor: p.palette.line }}><i style={{ background: p.palette.text }} /><i style={{ background: p.palette.muted }} /></span><b style={{ background: p.palette.accent }} />
            </span>
            <span>{p.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AppearanceCard() {
  const { theme, update, setMode } = useTheme();
  const mode = theme.mode;
  const shown = resolveVars(theme);
  const custom = theme.custom[mode];
  const preset = presetById(theme.presets[mode], mode);
  const setCustom = (k: CustomKey, v: string) => update((t) => ({ ...t, custom: { ...t.custom, [t.mode]: { ...t.custom[t.mode], [k]: v } } }));
  const setMonth = (i: number, v: string) => update((t) => ({ ...t, months: t.months.map((m, k) => (k === i ? v : m)) }));
  const customised = CUSTOM_KEYS.some((k) => custom[k]);
  const monthsChanged = theme.months.some((m, i) => m !== MONTH_COLORS[i]);
  return (
    <div className="bcard appearance">
      <span className="lbl2">Appearance</span>
      <div className="stack">
        <span className="lbl2">Mode</span>
        <div className="seg small" role="group" aria-label="Mode">
          {(['dark', 'light'] as Mode[]).map((m) => <button type="button" key={m} className={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>{MODE_LABEL[m]}</button>)}
        </div>
      </div>
      <Swatches mode="dark" />
      <Swatches mode="light" />

      <div className="stack">
        <span className="lbl2">{`Your own colors for the ${MODE_LABEL[mode].toLowerCase()} theme`}</span>
        <p className="muted small">{`These sit on top of ${preset.name}. Dark and light keep their own colors.`}</p>
        <div className="colorgrid">
          {CUSTOM_KEYS.map((k) => (
            <label key={k} className="colorpick"><input type="color" aria-label={`${CUSTOM_LABEL[k]} color`} value={shown[k]} onChange={(e) => setCustom(k, e.target.value)} /><span>{CUSTOM_LABEL[k]}</span></label>
          ))}
        </div>
        {customised && <button type="button" className="mini" onClick={() => update((t) => ({ ...t, custom: { ...t.custom, [t.mode]: {} } }))}>{`Back to ${preset.name}'s colors`}</button>}
      </div>

      <div className="stack">
        <span className="lbl2">Month colors</span>
        <p className="muted small">Each month has its own color. They start out repeating (January and July match, and so on), but you can change any one. Used on the Calendar, Month chart, Book list, and Bracket.</p>
        <div className="colorgrid">
          {theme.months.map((m, i) => (
            <label key={i} className="colorpick"><input type="color" aria-label={`${MONTH_NAMES[i]} color`} value={m} onChange={(e) => setMonth(i, e.target.value)} /><span>{MONTH_NAMES[i].slice(0, 3)}</span></label>
          ))}
        </div>
        {monthsChanged && <button type="button" className="mini" onClick={() => update((t) => ({ ...t, months: [...DEFAULT_THEME.months] }))}>Back to the original month colors</button>}
      </div>
    </div>
  );
}
