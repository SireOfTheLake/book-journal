import { useContext, useEffect, useMemo, useState } from 'react';
import { DbContext } from '../../db/DbContext';
import type { Fit } from '../../domain/boardGame/challengePrompts';
import { getStickers } from '../../repo/boardGame';

/** The sticker pictures for some prompts, read one time each as they come up. A prompt with no picture gives an empty string. */
export function useStickers(slotIds: (string | null | undefined)[]): Record<string, string> {
  const db = useContext(DbContext); // may be missing (the phone page has no local database), then there are simply no pictures
  const [pics, setPics] = useState<Record<string, string>>({});
  const ids = useMemo(() => [...new Set(slotIds.filter((x): x is string => !!x))], [slotIds.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const need = ids.filter((id) => !(id in pics));
    if (!db || !need.length) return;
    let live = true;
    getStickers(db, need).then((r) => { if (live) setPics((p) => ({ ...p, ...Object.fromEntries(need.map((id) => [id, r[id] ?? ''])), })); }, () => undefined);
    return () => { live = false; };
  }, [db, ids, pics]);
  return pics;
}

export const fitKey = (f: Fit) => f.slotId ?? `word:${f.challengeId}`;

/** The challenge prompts a space also fills, each with its sticker when it has one. With `off` and `toggle`, the ones that fill on their own can be unticked. */
export default function FitList({ fits, off, toggle }: { fits: Fit[]; off?: ReadonlySet<string>; toggle?: (key: string) => void }) {
  const pics = useStickers(fits.filter((f) => f.sticker).map((f) => f.slotId));
  if (!fits.length) return null;
  return (
    <ul className="bg-fits" aria-label="Challenge prompts this space fills">
      {fits.map((f) => {
        const k = fitKey(f), pic = f.slotId ? pics[f.slotId] : '';
        return (
          <li key={k}>
            {pic ? <img className="bg-sticker" src={pic} alt={`${f.challenge} sticker: ${f.label}`} /> : <span className="bg-sticker none" aria-hidden="true" />}
            <span>
              {toggle && f.auto
                ? <label className="inline"><input type="checkbox" checked={!off?.has(k)} onChange={() => toggle(k)} /><span><b>{f.challenge}</b>: {f.label}</span></label>
                : <span><b>{f.challenge}</b>: {f.label}</span>}
              {!f.auto && <><br /><span className="muted small">{f.word ? 'Add the country to it yourself on the Book Log.' : 'You fill this one in yourself.'}</span></>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
