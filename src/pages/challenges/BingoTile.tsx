import { tint } from '../../domain/bingo';

// One square of a Bingo board. Also what the dashboards will use as a sticker: the picture if there is one, otherwise the words in a box in the square's colour.
export default function BingoTile({ label, art, color, cover, bookTitle, free }: {
  label: string; art: string | null; color: string; cover?: string | null; bookTitle?: string; free?: boolean;
}) {
  const style = { ['--tc' as string]: color, ['--tt' as string]: tint(color) };
  if (bookTitle !== undefined) {
    return (
      <div className="btile filled" style={style}>
        {cover ? <img src={cover} alt="" /> : <span className="btext">{bookTitle}</span>}
      </div>
    );
  }
  if (art) return <div className="btile pic" style={style}><img src={art} alt="" /></div>;
  return <div className={`btile${free && !label ? ' free' : ''}`} style={style}><span className="btext">{label || 'FREE'}</span></div>;
}
