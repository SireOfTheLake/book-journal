import type { Board, Tile } from '../../domain/boardGame/board';

const S = 74, G = 18;
const GLYPH: Record<Tile['type'], string> = { start: 'GO', finish: '★', prompt: '', wild: '✦', series: '❯❯', tbr: '▤', bonus: '▲', penalty: '▼', item: '◆', boss: '♛' };
export const TYPE_NAME: Record<Tile['type'], string> = { start: 'Start', finish: 'Finish', prompt: 'Prompt', wild: 'Wild space', series: 'Next in series', tbr: 'From your TBR', bonus: 'Bonus', penalty: 'Penalty', item: 'Item', boss: 'Boss' };

/** The board itself: a winding path of numbered spaces, colored by zone, with your token on the space you are on. */
export default function BoardMap({ board, selected, onSelect }: { board: Board; selected: number | null; onSelect(i: number): void }) {
  const pts = board.tiles.map((t) => t.pos!);
  const w = (Math.max(...pts.map((p) => p.x)) + 1) * (S + G) - G;
  const h = (Math.max(...pts.map((p) => p.y)) + 1) * (S + G) - G;
  const cx = (t: Tile) => t.pos!.x * (S + G) + S / 2, cy = (t: Tile) => t.pos!.y * (S + G) + S / 2;
  return (
    <div className="bg-map" style={{ width: w + 16, height: h + 16 }}>
      <svg className="bg-path" width={w + 16} height={h + 16} aria-hidden="true">
        <polyline points={board.tiles.map((t) => `${cx(t) + 8},${cy(t) + 8}`).join(' ')} fill="none" strokeWidth="5" strokeDasharray="2 9" strokeLinecap="round" />
      </svg>
      {board.zones.map((z, zi) => {
        const first = board.tiles[z.from];
        return <span key={zi} className="bg-zonelabel" style={{ left: first.pos!.x * (S + G) + 8, top: first.pos!.y * (S + G) - 12, ['--zc' as string]: `var(--bgz-${z.color})` }}>{z.name}</span>;
      })}
      {board.tiles.map((t) => {
        const done = !!t.done && t.type !== 'start';
        const here = board.pos === t.i;
        const zone = board.zones[t.zone];
        return (
          <button key={t.i} type="button" className={`bg-tile t-${t.type}${done ? ' done' : ''}${here ? ' here' : ''}${selected === t.i ? ' sel' : ''}${t.quest ? ' quest' : ''}`}
            style={{ left: t.pos!.x * (S + G) + 8, top: t.pos!.y * (S + G) + 8, width: S, height: S, ['--zc' as string]: `var(--bgz-${zone?.color ?? 0})` }}
            aria-label={`Space ${t.i}: ${TYPE_NAME[t.type]}${done ? ', done' : ''}${here ? ', you are here' : ''}`} onClick={() => onSelect(t.i)}>
            <span className="bg-num">{t.i}</span>
            <span className="bg-glyph">{done && t.type !== 'bonus' && t.type !== 'penalty' && t.type !== 'item' ? '✓' : GLYPH[t.type]}</span>
            {t.quest && <span className="bg-qmark" title="Side quest">!</span>}
            {here && <span className="bg-token" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
