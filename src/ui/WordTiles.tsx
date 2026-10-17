import { wordLetters } from '../domain/words';

export interface Tile { letter: string; src: string | null }
// The stickers that spell a word. A letter with no sticker yet shows as a plain tile, and a space is a gap.
export default function WordTiles({ word, letters, size = 40, className = '' }: { word: string; letters: Record<string, string>; size?: number; className?: string }) {
  const tiles = wordLetters(word);
  return (
    <span className={`wordtiles ${className}`} role="img" aria-label={`${word}, spelled in letter stickers`} style={{ ['--tile' as string]: `${size}px` }}>
      {tiles.map((l, i) => l === null
        ? <span key={i} className="wtgap" aria-hidden="true" />
        : letters[l] ? <img key={i} className="wt" src={letters[l]} alt="" /> : <span key={i} className="wt wtplain" aria-hidden="true">{l}</span>)}
    </span>
  );
}

// The same, for stickers already looked up (the dashboard).
export function WordTilesRow({ tiles, label, size = 26 }: { tiles: ({ letter: string; src: string | null } | null)[]; label: string; size?: number }) {
  return (
    <span className="wordtiles" role="img" aria-label={`${label}, spelled in letter stickers`} style={{ ['--tile' as string]: `${size}px` }}>
      {tiles.map((t, i) => t === null ? <span key={i} className="wtgap" aria-hidden="true" /> : t.src ? <img key={i} className="wt" src={t.src} alt="" /> : <span key={i} className="wt wtplain" aria-hidden="true">{t.letter}</span>)}
    </span>
  );
}
