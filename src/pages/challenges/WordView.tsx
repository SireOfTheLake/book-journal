import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { hasLetters, missingLetters, wordLetters } from '../../domain/words';
import type { Candidate, Challenge } from '../../repo/challenges';
import LetterStickers from '../../ui/LetterStickers';
import WordTiles from '../../ui/WordTiles';
import { SaveText, Swatches } from './GridView';
import ReadPicker from './ReadPicker';
import Blurb from './Blurb';
import TrackerBar from './TrackerBar';

export interface WordActions {
  describe?(text: string): void;
  addWord(readId: string, word: string): void;
  clear(slotId: string): void;
  renameWord(slotId: string, word: string): void;
  search(query: string): Promise<Candidate[]>;
  rename(name: string): void;
  color(hex: string): void;
  theme(text: string): void;
  target(n: number | null): void;
  allowBonus(on: boolean): void; // words past the limit become bonus words
  bonusLimit(n: number | null): void; // the most bonus words (empty = no limit)
  presets(words: string[]): void; // words decided ahead of time; books are chosen for them later
  setLetter(letter: string, file: File): void | Promise<void>;
  removeLetter(letter: string): void;
  remove(): void;
}

// The challenge page of a Word Builder: the words you have spelled, a place to add one, and the letter stickers.
const COVER_COLORS = ['#5a1f3a', '#2f3a5a', '#3a2f5a', '#4a2f3a', '#2d4a3a', '#5a3a1f'];
const hue = (t: string) => COVER_COLORS[[...t].reduce((n, ch) => n + ch.charCodeAt(0), 0) % COVER_COLORS.length];

export default function WordView({ challenge: c, covers = {}, act }: { challenge: Challenge; covers?: Record<string, string>; act: WordActions }) {
  const [editing, setEditing] = useState(false);
  const [word, setWord] = useState('');
  const [picking, setPicking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [target, setTarget] = useState(c.target ? String(c.target) : '');
  useEffect(() => setTarget(c.target ? String(c.target) : ''), [c.target]);
  const [bonusText, setBonusText] = useState(c.bonusLimit ? String(c.bonusLimit) : '');
  useEffect(() => setBonusText(c.bonusLimit ? String(c.bonusLimit) : ''), [c.bonusLimit]);
  const [presetText, setPresetText] = useState('');
  const [pickingPreset, setPickingPreset] = useState<string | null>(null); // the word of a preset that is getting its book
  const words = c.loose;
  const bonusWords = words.filter((w) => w.is_bonus).length;
  const full = c.target !== null && words.length >= c.target && (!c.allowBonus || (c.bonusLimit !== null && bonusWords >= c.bonusLimit));
  const used = useMemo(() => words.map((w) => w.label), [words]);
  const missing = missingLetters([...used, word], c.letters);
  const ok = hasLetters(word);
  return (
    <div className="gridpage wordpage" style={{ ['--cc' as string]: c.color }}>
      <div className="gtop">
        <div className="gtitle">
          {editing ? <SaveText value={c.name} label="Challenge name" onSave={act.rename} className="field big" /> : <h2 className="pagetitle small2">{c.name}</h2>}
          <span className="muted small">{`Word builder · Journal ${c.year}${c.theme ? ` · ${c.theme}` : ''}${c.target ? ` · ${words.length} of ${c.target} books` : ''}`}</span>
        </div>
        <TrackerBar t={c} color={c.color} bonus={c.bonus} />
        <button type="button" className={`btn${editing ? ' on' : ''}`} aria-pressed={editing} onClick={() => setEditing((e) => !e)}>{editing ? 'Done editing' : 'Edit'}</button>
      </div>
      <Blurb text={c.description} editing={editing} onSave={act.describe} />

      {editing && (
        <div className="bcard gedit">
          <span className="lbl2">Challenge color</span><Swatches value={c.color} label="Challenge color" onPick={act.color} />
          <label className="stack"><span className="lbl2">What the words are about (the theme)</span>
            <SaveText value={c.theme ?? ''} label="Theme" onSave={act.theme} className="field" /></label>
          <label className="stack"><span className="lbl2">Book limit (leave empty for no limit)</span>
            <input className="field small" type="number" min={1} placeholder="No limit" aria-label="Book limit" value={target} onChange={(e) => setTarget(e.target.value)}
              onBlur={() => act.target(target.trim() ? Number(target) : null)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} /></label>
          <label className="inline"><input type="checkbox" role="switch" className="toggle" checked={c.allowBonus} onChange={(e) => act.allowBonus(e.target.checked)} /><span>Allow bonus words past the limit</span></label>
          {c.allowBonus && <label className="stack"><span className="lbl2">Most bonus words (leave empty for no limit)</span>
            <input className="field small" type="number" min={1} placeholder="No limit" aria-label="Bonus word limit" value={bonusText} onChange={(e) => setBonusText(e.target.value)}
              onBlur={() => act.bonusLimit(bonusText.trim() ? Number(bonusText) : null)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} /></label>}
          <label className="stack"><span className="lbl2">Words decided ahead of time (one per line; fill in the rest as you go)</span>
            <textarea className="field" rows={3} aria-label="Preset words" value={presetText} onChange={(e) => setPresetText(e.target.value)} /></label>
          <div><button type="button" className="mini" disabled={!presetText.trim()} onClick={() => { act.presets(presetText.split(/\r?\n/)); setPresetText(''); }}>Add these words</button></div>
          {deleting
            ? <span className="movebtns"><button type="button" className="mini danger" onClick={act.remove}>Delete the whole challenge</button><button type="button" className="mini" onClick={() => setDeleting(false)}>Keep</button></span>
            : <button type="button" className="mini" onClick={() => setDeleting(true)}>Delete challenge</button>}
          <span className="muted small">Deleting a challenge never deletes your books or reads.</span>
        </div>
      )}

      <section className="bcard gcard" aria-label="Add a word" style={{ ['--gc' as string]: c.color }}>
        <span className="lbl2">Add a word</span>
        {full && <span className="muted" role="status">{`This challenge is full: it is limited to ${c.target} book${c.target === 1 ? '' : 's'}. Take a book off to add another, or raise the limit in Edit.`}</span>}
        <input className="field big" disabled={full} aria-label="Word" placeholder={c.theme ? `A word for the book (${c.theme})` : 'A word for the book'} value={word} onChange={(e) => setWord(e.target.value)} />
        {word.trim() && <WordTiles word={word} letters={c.letters} size={44} />}
        {missing.length > 0 && <span className="muted small" role="note">{`No sticker yet for ${missing.join(', ')}. Those letters show as plain tiles until you add them (Edit, then Letter stickers).`}</span>}
        <div className="actions"><button type="button" className="btn on" disabled={!ok || full} onClick={() => setPicking(true)}>Choose the book...</button></div>
      </section>

      <section className="bcard gcard" aria-label="Words" style={{ ['--gc' as string]: c.color }}>
        <span className="lbl2">Words</span>
        {words.length === 0 && <span className="muted">No words yet. Add the first one above.</span>}
        <ul className="wordlist">
          {words.map((w) => (
            <li key={w.id} className="wordrow">
              {w.fill && (
                <Link to={`/book/${w.fill.book_id}/${w.fill.read_id}`} className="wordcover" aria-label={`Open ${w.fill.title}`} tabIndex={-1}>
                  {covers[w.fill.book_id] ? <img className="libimg" src={covers[w.fill.book_id]} alt="" /> : <span className="libgen" style={{ background: hue(w.fill.title) }}><span className="ttl">{w.fill.title.toUpperCase()}</span></span>}
                </Link>
              )}
              <WordTiles word={w.label} letters={c.letters} size={editing ? 34 : 44} />
              <span className="wordinfo">
                {editing ? <SaveText value={w.label} label={`Word: ${w.label}`} onSave={(v) => act.renameWord(w.id, v)} /> : <b className="wordtext">{w.label}</b>}
                {w.is_bonus && <span className="bonuschip">Bonus</span>}
                {w.fill ? <><Link className="l" to={`/book/${w.fill.book_id}/${w.fill.read_id}`}>{w.fill.title}</Link>
                  <button type="button" className="xbtn" aria-label={`Remove the word ${w.label}`} title="Remove this word (the book stays)" onClick={() => act.clear(w.id)}>&times;</button></>
                  : <><button type="button" className="mini" aria-label={`Choose the book for ${w.label}`} onClick={() => setPickingPreset(w.label)}>Choose the book...</button>
                    <button type="button" className="xbtn" aria-label={`Remove the word ${w.label}`} title="Remove this word" onClick={() => act.clear(w.id)}>&times;</button></>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="bcard gcard" aria-label="Letter stickers" style={{ ['--gc' as string]: c.color }}>
        <span className="lbl2">Letter stickers</span>
        <LetterStickers letters={c.letters} editable={editing} onSet={act.setLetter} onRemove={act.removeLetter} />
        {!editing && missing.length > 0 && <span className="muted small">{`Missing for your words: ${missing.join(', ')}. Choose Edit to add them.`}</span>}
      </section>

      {pickingPreset && <ReadPicker prompt={pickingPreset} search={act.search} onClose={() => setPickingPreset(null)} onPick={(readId) => { act.addWord(readId, pickingPreset); setPickingPreset(null); }} />}
      {picking && <ReadPicker prompt={`${word.trim()} (${wordLetters(word).filter(Boolean).length} letters)`} search={act.search} onClose={() => setPicking(false)}
        onPick={(readId) => { act.addWord(readId, word); setPicking(false); setWord(''); }} />}
    </div>
  );
}
