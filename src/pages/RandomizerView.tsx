import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { allCategories, challengeKey, spin, spinTarget, TREAT_KEY, TRICK_KEY, wheelCategories, type Pick, type Rng } from '../domain/randomizer';
import type { DraftRow, PromptKind, RandomizerData } from '../repo/randomizer';
import Wheel from '../ui/Wheel';
import { Card, Seg } from './bookLog/parts';

export interface RandomizerActions {
  addPrompt(kind: PromptKind, text: string): Promise<void>;
  removePrompt(id: string): void;
  start(pick: Pick): Promise<void>;
  discard(bookId: string): void;
}

function PromptList({ kind, title, prompts, used, act }: { kind: PromptKind; title: string; prompts: { id: string; text: string }[]; used: string[]; act: RandomizerActions }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = async (t: string) => {
    try { await act.addPrompt(kind, t); setText(''); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="promptlist">
      <b>{title}</b>
      {prompts.length === 0 && <span className="muted small">No {title} prompts yet.</span>}
      <ul className="plist">
        {prompts.map((p) => (
          <li key={p.id}><span className="grow">{p.text}</span><button type="button" className="mini" aria-label={`Remove ${p.text} from ${title}`} onClick={() => act.removePrompt(p.id)}>&times;</button></li>
        ))}
      </ul>
      <div className="addrow">
        <input className="field grow" aria-label={`New ${title} prompt`} placeholder={`Add a ${title} prompt`} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(text); }} />
        <button type="button" className="btn" onClick={() => void add(text)}>Add</button>
      </div>
      {error && <span className="muted small" role="alert">{error}</span>}
      {used.length > 0 && (
        <div className="usedbefore"><span className="muted small">From your past reads</span>
          <span className="chips">{used.map((t) => <button key={t} type="button" className="chip sug" aria-label={`Add ${t} to ${title}`} onClick={() => void add(t)}>+ {t}</button>)}</span>
        </div>
      )}
    </div>
  );
}

export default function RandomizerView({ data, drafts, year, act, rng = Math.random, spinMs = 4200 }: { data: RandomizerData; drafts: DraftRow[]; year: number; act: RandomizerActions; rng?: Rng; spinMs?: number }) {
  const [off, setOff] = useState<Set<string>>(new Set());
  const [incompleteOnly, setIncompleteOnly] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<Pick | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const cats = allCategories({ trick: data.trick.map((p) => p.text), treat: data.treat.map((p) => p.text), challenges: data.challenges }, incompleteOnly);
  const wheel = wheelCategories(cats, { off, incompleteOnly });
  const toggle = (key: string) => { setResult(null); setOff((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; }); };
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const doSpin = () => {
    const got = spin(wheel, rng);
    if (!got) return;
    setResult(null);
    const ms = reduced ? 0 : spinMs;
    setRotation((r) => spinTarget(r, got.category, wheel.length, rng));
    setSpinning(true);
    timer.current = setTimeout(() => { setSpinning(false); setResult(got.pick); }, ms);
  };
  const begin = async () => {
    if (!result) return;
    try { await act.start(result); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const row = (key: string, label: string, count: number, hint?: string) => (
    <label key={key} className={count === 0 ? 'rzrow dim' : 'rzrow'}>
      <input type="checkbox" checked={!off.has(key)} disabled={spinning} onChange={() => toggle(key)} />
      <span className="grow">{label}</span>
      <span className="muted small">{count === 0 ? (hint ?? 'no prompts') : `${count} prompt${count === 1 ? '' : 's'}`}</span>
    </label>
  );
  const byKey = Object.fromEntries(cats.map((c) => [c.key, c]));

  return (
    <div className="randomizer">
      <h1 className="pagetitle">PROMPT RANDOMIZER</h1>
      <p className="muted">Spin the wheel to find out what your next book has to be. Then add the book that fits.</p>
      <div className="rzgrid">
        <Card label="What to randomize">
          {row(TRICK_KEY, 'Trick', byKey[TRICK_KEY].picks.length, 'add prompts below')}
          {row(TREAT_KEY, 'Treat', byKey[TREAT_KEY].picks.length, 'add prompts below')}
          <span className="lbl2">{`Challenges in ${year}`}</span>
          {data.challenges.length === 0 && <span className="muted small">There are no published challenges for this year.</span>}
          {data.challenges.map((c) => row(challengeKey(c.id), c.name, byKey[challengeKey(c.id)].picks.length, incompleteOnly ? 'all done' : 'no prompts'))}
          <Seg label="Which challenge prompts" value={incompleteOnly ? 'incomplete' : 'all'} onChange={(v) => { setResult(null); setIncompleteOnly(v !== 'all'); }}
            options={[{ value: 'incomplete', label: 'Incomplete only' }, { value: 'all', label: 'All prompts' }]} />
        </Card>

        <Card label="The wheel" className="wheelcard">
          <Wheel wedges={wheel.map((c) => ({ key: c.key, label: c.label, color: c.color }))} rotation={rotation} spinMs={reduced ? 0 : spinMs} label={`Wheel with ${wheel.length} categories`} />
          {wheel.length === 0 && <span className="muted small">Tick at least one category that has prompts.</span>}
          <button type="button" className="btn on big" disabled={spinning || wheel.length === 0} onClick={doSpin}>{spinning ? 'Spinning...' : result ? 'Spin again' : 'Spin'}</button>
          <div className="rzresult" aria-live="polite">
            {result && (
              <>
                <span className="lbl2">{result.categoryLabel}</span>
                <b className="rzprompt">{result.prompt}</b>
                <button type="button" className="btn on" onClick={begin}>Add a new book</button>
              </>
            )}
            {error && <span className="muted" role="alert">{error}</span>}
          </div>
        </Card>

        <Card label="Trick and Treat prompts" className="rzprompts">
          <PromptList kind="trick" title="Trick" prompts={data.trick} used={data.usedBefore.trick} act={act} />
          <PromptList kind="treat" title="Treat" prompts={data.treat} used={data.usedBefore.treat} act={act} />
        </Card>

        {drafts.length > 0 && (
          <Card label="Waiting for a book" className="rzdrafts">
            {drafts.map((d) => (
              <div key={d.book_id} className="relline">
                <span className="grow">{d.challenge ?? `${d.reason ?? 'No reason'}${d.prompt ? `: ${d.prompt}` : ''}`}</span>
                <Link className="mini" to={`/book/${d.book_id}/${d.read_id}`}>Choose a book</Link>
                <button type="button" className="mini" aria-label={`Discard ${d.challenge ?? d.prompt ?? d.reason ?? 'this page'}`} onClick={() => act.discard(d.book_id)}>Discard</button>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
