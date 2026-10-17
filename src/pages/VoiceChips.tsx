import { useState } from 'react';
import { Link } from 'react-router-dom';

export interface VoiceItem { id: string; name: string }

// The characters a narrator voiced on a listen: small chips with a quiet "+" to add another.
export default function VoiceChips({ narrator, chars, options, onAdd, onRemove, max }: { max?: number; narrator: string; chars: VoiceItem[]; options: VoiceItem[]; onAdd(characterId: string): void; onRemove(characterId: string): void }) {
  const [adding, setAdding] = useState(false);
  const [all, setAll] = useState(false);
  const shown = max && !all ? chars.slice(0, max) : chars;
  const hidden = chars.length - shown.length;
  return (
    <span className="voicechips">
      {shown.map((c) => (
        <span key={c.id} className="chip tiny voicechip"><Link className="l" to={`/characters/${c.id}`}>{c.name}</Link>
          <button type="button" className="x" aria-label={`Take ${c.name} off ${narrator}`} onClick={() => onRemove(c.id)}>&times;</button></span>
      ))}
      {hidden > 0 && <button type="button" className="quiet voiceadd" aria-label={`Show ${hidden} more voiced by ${narrator}`} onClick={() => setAll(true)}>{`+${hidden} more`}</button>}
      {adding ? (
        <select autoFocus className="field small" aria-label={`Character voiced by ${narrator}`} value="" onBlur={() => setAdding(false)}
          onChange={(e) => { if (e.target.value) onAdd(e.target.value); setAdding(false); }}>
          <option value="">{options.length ? 'Choose a character...' : 'No more characters in this book'}</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      ) : <button type="button" className="quiet voiceadd" aria-label={`Add a character voiced by ${narrator}`} title="Add a character this narrator voiced" onClick={() => setAdding(true)}>{chars.length ? '+' : '+ voiced'}</button>}
    </span>
  );
}
