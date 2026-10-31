import { useContext, useEffect, useRef, useState, type KeyboardEvent, type Ref, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { DbContext } from '../db/DbContext';
import { activeMention, applyMention, MENTION_KINDS, parseMentions, type MentionHit, type MentionKind } from '../domain/mentions';
import { searchMentions } from '../repo/mentions';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & { value: string; onChange(v: string): void; textareaRef?: Ref<HTMLTextAreaElement> };

// A text box where typing "@" and a few letters offers books, series, characters, narrators and authors to mention.
export default function MentionTextarea({ value, onChange, textareaRef, onKeyDown, onSelect, onClick, onKeyUp, ...rest }: Props) {
  const db = useContext(DbContext); // without a database the box is just a text box
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const [caret, setCaret] = useState(0);
  const [hits, setHits] = useState<MentionHit[]>([]);
  const [pick, setPick] = useState(0);
  const [dismissed, setDismissed] = useState<number | null>(null);
  const active = activeMention(value, caret);
  const open = !!db && !!active && dismissed !== active.start;
  const query = active?.query ?? null;

  useEffect(() => {
    if (!open || query === null || !db) { setHits([]); return; }
    let live = true;
    void searchMentions(db, query).then((h) => { if (live) { setHits(h); setPick(0); } }).catch(() => { if (live) setHits([]); });
    return () => { live = false; };
  }, [db, open, query]);

  const set = (el: HTMLTextAreaElement | null) => { inner.current = el; if (typeof textareaRef === 'function') textareaRef(el); else if (textareaRef) (textareaRef as { current: HTMLTextAreaElement | null }).current = el; };
  const sync = () => setCaret(inner.current?.selectionStart ?? 0);
  const choose = (hit: MentionHit) => {
    if (!active) return;
    const next = applyMention(value, caret, active.start, hit);
    onChange(next.text); setCaret(next.caret); setHits([]);
    setTimeout(() => { const el = inner.current; if (el) { el.focus(); el.setSelectionRange(next.caret, next.caret); } }, 0);
  };
  const keys = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && hits.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setPick((pick + 1) % hits.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setPick((pick - 1 + hits.length) % hits.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(hits[pick]); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDismissed(active!.start); return; }
    }
    onKeyDown?.(e);
  };
  return (
    <div className="mentionwrap">
      <textarea {...rest} ref={set} value={value}
        onChange={(e) => { onChange(e.target.value); setCaret(e.target.selectionStart); setDismissed(null); }}
        onKeyDown={keys} onKeyUp={(e) => { sync(); onKeyUp?.(e); }} onClick={(e) => { sync(); onClick?.(e); }} onSelect={(e) => { sync(); onSelect?.(e); }} />
      {open && (
        <div className="mentionpop" role="listbox" aria-label="Mention">
          {!hits.length && <div className="mentionnone">{query ? 'Nothing matches' : 'Type a name'}</div>}
          {MENTION_KINDS.map(({ kind, label }) => {
            const group = hits.filter((h) => h.kind === kind);
            return group.length ? (
              <div key={kind} role="group" aria-label={label}>
                <div className="mentionhead">{label}</div>
                {group.map((h) => (
                  <button key={h.id} type="button" role="option" aria-selected={hits[pick] === h} className={`mentionopt${hits[pick] === h ? ' on' : ''}`}
                    onMouseDown={(e) => e.preventDefault()} onPointerDown={(e) => e.preventDefault()} onClick={() => choose(h)}>
                    <span>{h.name}</span>{h.note && <span className="n">{h.note}</span>}
                  </button>
                ))}
              </div>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

/** Notes text with its mentions as links. `to` gives the page for a mention, or null when this app has none (then it is plain text). */
export function MentionText({ text, to }: { text: string; to(kind: MentionKind, id: string): string | null }) {
  return (
    <>
      {parseMentions(text).map((s, i) => {
        if ('text' in s) return <span key={i}>{s.text}</span>;
        const path = to(s.mention.kind, s.mention.id);
        return path
          ? <Link key={i} className={`mention ${s.mention.kind}`} to={path} onClick={(e) => e.stopPropagation()}>@{s.mention.name}</Link>
          : <span key={i} className={`mention ${s.mention.kind}`}>@{s.mention.name}</span>;
      })}
    </>
  );
}
