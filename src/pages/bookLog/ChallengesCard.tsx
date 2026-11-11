import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ChallengeChoice, ReadChallenge } from '../../repo/challenges';
import { hasLetters } from '../../domain/words';
import WordTiles from '../../ui/WordTiles';
import { Card } from './parts';
import { matchPrompt, type BookFacts } from '../../domain/promptMatch';

export interface ChallengeActions { assign(slotId: string): void; remove(slotId: string): void; setWord?(challengeId: string, word: string): void }

function PromptSelect({ choice, value, onChange }: { choice: ChallengeChoice; value: string; onChange(id: string): void }) {
  const groups = [...new Set(choice.slots.map((s) => s.group))];
  const opt = (s: ChallengeChoice['slots'][number]) => <option key={s.id} value={s.id}>{s.taken ? `${s.label} (has ${s.taken})` : s.label}</option>;
  return (
    <select aria-label={`Prompt in ${choice.name}`} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose a prompt...</option>
      {groups.map((g) => g === null ? choice.slots.filter((s) => s.group === null).map(opt) : <optgroup key={g} label={g}>{choice.slots.filter((s) => s.group === g).map(opt)}</optgroup>)}
    </select>
  );
}

// Which challenges this read counts toward, and the prompt it fills in each (one prompt per challenge).
export default function ChallengesCard({ items, choices, act, facts, bare = false }: { items: ReadChallenge[]; choices: ChallengeChoice[]; act: ChallengeActions; facts?: BookFacts; bare?: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [changing, setChanging] = useState<string | null>(null); // challenge id whose prompt is being changed
  const [pickChallenge, setPickChallenge] = useState('');
  const [pickSlot, setPickSlot] = useState('');
  const [word, setWord] = useState('');
  const free = choices.filter((c) => !items.some((i) => i.challenge_id === c.id));
  const chosen = free.find((c) => c.id === pickChallenge);
  const taken = chosen?.slots.find((s) => s.id === pickSlot)?.taken ?? null;
  const reset = () => { setAdding(false); setChanging(null); setPickChallenge(''); setPickSlot(''); setWord(''); };
  const lettersOf = (id: string) => choices.find((c) => c.id === id)?.letters ?? {};

  // Prompts in challenges this read is not yet in, that the book's facts say it could fill (a free prompt, or one with no book on it).
  const suggestions = facts ? choices.filter((c) => !c.word && !items.some((i) => i.challenge_id === c.id) && c.kind !== 'bingo').flatMap((c) => c.slots.filter((s) => !s.taken).map((s) => ({ c, s, why: matchPrompt(s.label, facts) })).filter((x) => x.why)) : [];
  const combo = items.filter((i) => !i.planned).length;
  const plannedCount = items.length - combo;

  const body = (
    <>
      {items.length >= 2 && <div className="combochip" role="status" aria-label="Combo"><b>{`Combo x${items.length}`}</b><span className="muted small">{` ${combo} ${combo === 1 ? 'prompt' : 'prompts'} filled across ${new Set(items.map((i) => i.challenge_id)).size} challenges${plannedCount ? `, ${plannedCount} planned` : ''}`}</span></div>}
      {items.length === 0 && !adding && <span className="muted">This read is not counting toward a challenge.</span>}
      <ul className="readchs">
        {items.map((i) => {
          const choice = choices.find((c) => c.id === i.challenge_id);
          return (
            <li key={i.challenge_id} className="readch" style={i.color ? { borderLeftColor: i.color } : undefined}>
              <div className="rcmain">
                <Link className="l rcname" to={`/journal/challenges/${i.challenge_id}`}>{i.name}</Link>
                {i.word ? <WordTiles word={i.label} letters={lettersOf(i.challenge_id)} size={30} /> : null}
                <span className="rcprompt">{i.group ? <span className="muted">{i.group}: </span> : null}<b>{i.label}</b>{i.note ? <span className="muted">{` · ${i.note}`}</span> : null}</span>
                {i.planned && <span className="chip tiny planchip" title="It counts as done once this book is read">planned</span>}
                <span className="muted small">{`${i.done} of ${i.total} done`}</span>
              </div>
              <div className="rcbtns">
                <button type="button" className="quiet" aria-label={`Change the prompt in ${i.name}`} onClick={() => { setChanging(changing === i.challenge_id ? null : i.challenge_id); setPickSlot(i.slot_id); setWord(i.label); }}>{i.word ? 'change word' : 'change'}</button>
                <button type="button" className="xbtn" aria-label={`Take this book off ${i.name}`} title="Take this book off this challenge" onClick={() => act.remove(i.slot_id)}>&times;</button>
              </div>
              {changing === i.challenge_id && i.word && (
                <div className="rcpick">
                  <input className="field small" aria-label={`Word for ${i.name}`} value={word} onChange={(e) => setWord(e.target.value)} />
                  <button type="button" className="mini" disabled={!hasLetters(word) || word.trim() === i.label} onClick={() => { act.setWord?.(i.challenge_id, word); reset(); }}>Save word</button>
                  <button type="button" className="quiet" onClick={reset}>Cancel</button>
                </div>
              )}
              {changing === i.challenge_id && choice && !i.word && (
                <div className="rcpick">
                  <PromptSelect choice={choice} value={pickSlot} onChange={setPickSlot} />
                  <button type="button" className="mini" disabled={!pickSlot || pickSlot === i.slot_id} onClick={() => { act.assign(pickSlot); reset(); }}>Move here</button>
                  <button type="button" className="quiet" onClick={reset}>Cancel</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {adding ? (
        <div className="rcpick stackish">
          {free.length === 0 ? <span className="muted">Every published challenge already has this book, or none are published for this year.</span> : (
            <>
              <select aria-label="Challenge" value={pickChallenge} onChange={(e) => { setPickChallenge(e.target.value); setPickSlot(''); }}>
                <option value="">Choose a challenge...</option>
                {free.map((c) => <option key={c.id} value={c.id}>{`${c.name} (${c.year})`}</option>)}
              </select>
              {chosen && !chosen.word && <PromptSelect choice={chosen} value={pickSlot} onChange={setPickSlot} />}
              {chosen?.word && chosen.limit !== null && chosen.used >= chosen.limit && <span className="muted small" role="note">{`${chosen.name} is full (${chosen.used} of ${chosen.limit} books).`}</span>}
              {chosen?.word && (
                <>
                  <input className="field small" aria-label={`Word for ${chosen.name}`} placeholder={chosen.theme ? `A word for this book (${chosen.theme})` : 'A word for this book'} value={word} onChange={(e) => setWord(e.target.value)} />
                  {word.trim() && <WordTiles word={word} letters={chosen.letters} size={30} />}
                </>
              )}
              {taken && <span className="muted small" role="note">{`That prompt already has ${taken}; this book will replace it.`}</span>}
            </>
          )}
          <div className="rcbtns">
            <button type="button" className="mini" disabled={chosen?.word ? !hasLetters(word) || (chosen.limit !== null && chosen.used >= chosen.limit) : !pickSlot}
              onClick={() => { if (chosen?.word) act.setWord?.(chosen.id, word); else act.assign(pickSlot); reset(); }}>Add to challenge</button>
            <button type="button" className="quiet" onClick={reset}>Cancel</button>
          </div>
        </div>
      ) : <button type="button" className="mini addchar" onClick={() => setAdding(true)}>+ Add to a challenge</button>}
      {suggestions.length > 0 && (
        <div className="promptsugg">
          <span className="lbl2">{`This book could also fill (${suggestions.length})`}</span>
          <ul>
            {(showAll ? suggestions : suggestions.slice(0, 5)).map(({ c, s, why }) => (
              <li key={s.id}><span className="rcprompt"><span className="muted">{`${c.name}: `}</span><b>{s.label}</b><span className="muted small">{` (${why})`}</span></span>
                <button type="button" className="mini" aria-label={`Add to ${s.label} in ${c.name}`} onClick={() => act.assign(s.id)}>Add</button></li>
            ))}
          </ul>
          {suggestions.length > 5 && <button type="button" className="quiet" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show fewer' : `Show all ${suggestions.length}`}</button>}
        </div>
      )}
    </>
  );
  return bare ? body : <Card label="Challenges" className="narrowcard">{body}</Card>;
}
