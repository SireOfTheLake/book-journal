import type { FreeSub, Reason, ReasonKind } from '../../repo/reason';
import type { ChallengeChoice, ReadChallenge } from '../../repo/challenges';
import { Card, EditSelect, EditText } from './parts';

export interface ReasonActions { set(r: { kind: ReasonKind | null; sub?: FreeSub; prompt?: string | null }): void; setPrompt(text: string): void }
export interface PromptActions { assign(slotId: string): void; remove(slotId: string): void }

const CATEGORIES: { value: ReasonKind; label: string }[] = [
  { value: 'challenge', label: 'Challenge' }, { value: 'trick', label: 'Trick' }, { value: 'treat', label: 'Treat' }, { value: 'free', label: 'Free Read' },
];

// "Why am I reading this?" — the Category and Prompt of the paper journal. The prompt choices depend on the category.
export default function ReasonCard({ reason, items, choices, challengeAct, act }: { reason: Reason; items: ReadChallenge[]; choices: ChallengeChoice[]; challengeAct: PromptActions; act: ReasonActions }) {
  const kind: ReasonKind | null = reason.kind ?? (items.length ? 'challenge' : null);
  const primary = items.find((i) => !i.word) ?? null; // Word Builder words are added in the Challenges card
  // Only prompts nobody has filled yet (plus the one this read is on, so it can be shown as the current choice).
  const slotOptions = choices.filter((c) => !c.word).flatMap((c) => c.slots
    .filter((s) => !s.taken || c.current_slot_id === s.id)
    .map((s) => ({ value: s.id, label: `${c.name}: ${s.group ? `${s.group} · ` : ''}${s.label}` })));
  const noChallenges = choices.every((c) => c.word);
  const words = items.filter((i) => i.word);

  return (
    <Card label="Why I'm reading this" className="narrowcard">
      <div className="stack"><span className="muted">Category</span>
        <EditSelect label="Category" addLabel="Add category" value={kind} options={CATEGORIES}
          onChange={(v) => act.set({ kind: v as ReasonKind | null })} />
      </div>
      <div className="stack"><span className="muted">Prompt</span>
        {kind === null && <span className="muted small">Choose a category first.</span>}
        {kind === 'challenge' && (noChallenges
          ? <span className="muted small">{choices.length ? 'Word Builder words are added in the Challenges card.' : 'There are no published challenges for this year.'}</span>
          : <EditSelect label="Prompt" addLabel="Add prompt" value={primary?.slot_id ?? null} options={slotOptions}
              onChange={(v) => {
                if (v) { challengeAct.assign(v); const o = slotOptions.find((x) => x.value === v); if (o) act.setPrompt(o.label); }
                else { if (primary) challengeAct.remove(primary.slot_id); act.setPrompt(''); }
              }} />)}
        {kind === 'challenge' && primary?.planned && <span className="muted small">It is on the challenge now, and counts once you have read the book.</span>}
        {kind === 'challenge' && !primary && reason.kind === 'challenge' && reason.prompt && !noChallenges && (
          <span className="reasonkept"><b>{reason.prompt}</b><span className="muted small"> is kept here, but is not on the challenge right now. Pick it again to put it back, or choose another prompt.</span></span>
        )}
        {kind === 'challenge' && words.map((w) => <span key={w.slot_id} className="muted small">{`${w.name}: ${w.label} (a word)`}</span>)}
        {kind === 'challenge' && items.filter((i) => !i.word).length > 1 && <span className="muted small">{`and ${items.filter((i) => !i.word).length - 1} more in the Challenges card`}</span>}
        {(kind === 'trick' || kind === 'treat') && <EditText label="Prompt" addLabel="Add prompt" value={reason.kind === kind ? reason.prompt : null} onCommit={(v) => act.setPrompt(v)} />}
        {(kind === 'trick' || kind === 'treat') && reason.kind === kind && !!reason.suggestions?.length && (
          <div className="usedbefore"><span className="muted small">Used before</span>
            <span className="chips">{reason.suggestions.map((t) => <button key={t} type="button" className="chip sug" onClick={() => act.setPrompt(t)}>{t}</button>)}</span>
          </div>
        )}
        {kind === 'free' && (
          <EditSelect label="Prompt" addLabel="Add prompt" value={reason.sub} options={[{ value: 'tbr', label: 'TBR' }, { value: 'next', label: 'Next in Series' }]}
            onChange={(v) => act.set({ kind: 'free', sub: v as FreeSub })} />
        )}
      </div>
    </Card>
  );
}
