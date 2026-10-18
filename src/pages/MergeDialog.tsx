import { useEffect, useState } from 'react';
import type { Item } from '../repo/bookLog';
import { planChoice, type FieldMode, type MergeChoice, type MergePlan } from '../repo/mergeReview';
import { Combo } from './bookLog/parts';

export interface MergeApi {
  plan(keepId: string, dupId: string): Promise<MergePlan>;
  merge(keepId: string, dupId: string, choice: MergeChoice): Promise<void>;
}

// Merge in two steps: pick the other entry and which name to keep, then review what comes into the combined entry.
export default function MergeDialog({ noun, self, others, api, onClose }: { noun: string; self: Item; others: Item[]; api: MergeApi; onClose(): void }) {
  const [other, setOther] = useState<string | null>(null);
  const [keepSelf, setKeepSelf] = useState(true);
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [choice, setChoice] = useState<MergeChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const plural = noun === 'series' ? 'series' : `${noun}s`;
  const otherName = others.find((c) => c.id === other)?.name ?? '';
  const keepName = keepSelf ? self.name : otherName, dupName = keepSelf ? otherName : self.name;
  const ids = (): [string, string] => (keepSelf ? [self.id, other as string] : [other as string, self.id]);
  const review = async () => {
    if (!other) return;
    setBusy(true); setError(null);
    try { const p = await api.plan(...ids()); setPlan(p); setChoice(planChoice(p)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const go = async () => {
    if (!choice) return;
    setBusy(true);
    try { await api.merge(...ids(), choice); onClose(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  useEffect(() => { setPlan(null); setChoice(null); }, [other, keepSelf]);
  const setMode = (key: string, mode: FieldMode) => setChoice((c) => c && { ...c, fields: { ...c.fields, [key]: mode } });
  const toggle = (key: string) => setChoice((c) => c && { ...c, leave: c.leave.includes(key) ? c.leave.filter((k) => k !== key) : [...c.leave, key] });
  const groups = plan ? [...new Set(plan.items.map((i) => i.group))] : [];
  const differing = plan?.fields.filter((f) => f.dup !== null && f.dup !== f.keep) ?? [];

  return (
    <div className="overlay" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className={`dialog${plan ? ' mergedlg' : ''}`} role="dialog" aria-label={`Merge ${plural}`}>
        <h2 className="pagetitle small2">{`Merge ${plural}`}</h2>
        {!plan && (
          <>
            <span className="muted">{`Two entries for the same ${noun} become one. You will review what comes across before anything changes.`}</span>
            <div className="pickrow">
              <span className="lbl2">Merge with</span>
              {other ? <span><b>{otherName}</b> <button type="button" className="btn quiet" aria-label={`Change the other ${noun}`} onClick={() => setOther(null)}>Change</button></span>
                : <Combo autoFocus label={`Search the other ${noun}`} placeholder={`Search for a ${noun}`} options={others.filter((c) => c.id !== self.id).map((c) => ({ key: c.id, label: c.name }))} onPick={setOther} />}
            </div>
            {other && (
              <div className="pickrow" role="radiogroup" aria-label="Which one to keep">
                <span className="lbl2">Keep this name</span>
                <label className="inline"><input type="radio" name="keep" checked={keepSelf} onChange={() => setKeepSelf(true)} /><span>{self.name} (this page)</span></label>
                <label className="inline"><input type="radio" name="keep" checked={!keepSelf} onChange={() => setKeepSelf(false)} /><span>{otherName}</span></label>
              </div>
            )}
          </>
        )}
        {plan && choice && (
          <>
            <span className="notice">{`"${dupName}" will be folded into "${keepName}". Untick anything you do not want to bring over.`}</span>
            {differing.length > 0 && (
              <div className="mergefields" aria-label="Fields">
                <span className="lbl2">Details that differ</span>
                {differing.map((f) => (
                  <div className="mergefield" key={f.key} role="group" aria-label={f.label}>
                    <b>{f.label}</b>
                    <div className="seg" role="radiogroup" aria-label={`${f.label} choice`}>
                      <button type="button" role="radio" aria-checked={choice.fields[f.key] === 'keep'} className={choice.fields[f.key] === 'keep' ? 'on' : ''} onClick={() => setMode(f.key, 'keep')}>{`Keep: ${f.keep ?? 'empty'}`}</button>
                      <button type="button" role="radio" aria-checked={choice.fields[f.key] === 'dup'} className={choice.fields[f.key] === 'dup' ? 'on' : ''} onClick={() => setMode(f.key, 'dup')}>{`Use: ${f.dup}`}</button>
                      {f.keep !== null && (f.text || f.key === 'links') && <button type="button" role="radio" aria-checked={choice.fields[f.key] === 'both'} className={choice.fields[f.key] === 'both' ? 'on' : ''} onClick={() => setMode(f.key, 'both')}>Both</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {groups.map((g) => (
              <fieldset className="mergeitems" key={g}>
                <legend className="lbl2">{g}</legend>
                {plan.items.filter((i) => i.group === g).map((i) => (
                  <label className="inline" key={i.key}><input type="checkbox" checked={!choice.leave.includes(i.key)} onChange={() => toggle(i.key)} /><span>{i.label}</span></label>
                ))}
              </fieldset>
            ))}
            {differing.length === 0 && groups.length === 0 && <span className="muted">There is nothing extra to bring over.</span>}
          </>
        )}
        {error && <div className="bcard warn" role="alert">{error}</div>}
        <div className="entryform dialogbtns">
          {!plan && <button type="button" className="btn on" disabled={!other || busy} onClick={review}>Review...</button>}
          {plan && <button type="button" className="btn on" disabled={busy} onClick={go}>Merge</button>}
          {plan && <button type="button" className="btn" disabled={busy} onClick={() => { setPlan(null); setChoice(null); }}>Back</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
