import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ACCENTS, accentAt, splitPrompts } from '../domain/challenges';
import type { BankSummary } from '../repo/bingo';
import type { ChallengeSummary, NewGrid, NewSticker, StickerImage } from '../repo/challenges';
import type { NewWordBuilder } from '../repo/words';
import type { NewMap as NewUsMap } from '../repo/usmap';
import { MAPS, MAP_IDS, hasBonusPlaces, mapPlaces, type BonusMode, type MapId } from '../domain/maps';
import LetterStickers from '../ui/LetterStickers';
import { fileToDataUrl } from '../ui/imageFile';
import StickerStaging, { type Staged } from './challenges/StickerStaging';
import TrackerBar from './challenges/TrackerBar';

const KIND: Record<string, string> = { grid: 'Grid', sticker: 'Sticker', bingo: 'Bingo' };

// A color for a new challenge: chosen at random, from the ones no other challenge this year has when there are any left.
export function randomAccent(used: (string | null)[], rng: () => number = Math.random): string {
  const taken = new Set(used.filter((c): c is string => !!c).map((c) => c.toLowerCase()));
  const free = ACCENTS.filter((c) => !taken.has(c.toLowerCase()));
  const pool = free.length ? free : ACCENTS;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}
// What the form hands over for a Bingo board: an existing bank, or the prompts for a new one.
export interface NewBingoForm { year: number; name: string; bankId: string | null; newBankPrompts: string[]; preferUnused: boolean; freeText: string }
export type NewWordForm = NewWordBuilder & { word: true };
export type NewMapForm = NewUsMap & { usMap: true };
export type CreateInput = NewGrid | NewSticker | NewBingoForm | NewWordForm | NewMapForm;

function NewChallenge({ year, banks, used, onCreate: onCreateWith, onCancel }: { year: number; banks: BankSummary[]; used: (string | null)[]; onCreate(input: CreateInput, description?: string): Promise<void>; onCancel(): void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(() => randomAccent(used));
  const [theme, setTheme] = useState('');
  const [target, setTarget] = useState('');
  const [letters, setLetters] = useState<Record<string, StickerImage>>({});
  const [main, setMain] = useState('');
  const [groups, setGroups] = useState<{ name: string; text: string }[]>([]);
  const [mapId, setMapId] = useState<MapId>('us');
  const [bonus, setBonus] = useState<BonusMode>('off');
  const [australia, setAustralia] = useState(false);
  const [limited, setLimited] = useState(false);
  const [limit, setLimit] = useState('25');
  const pickMap = (id: MapId) => { setMapId(id); setBonus(id === 'us' ? 'off' : 'optional'); setLimit(String(MAPS[id].defaultLimit)); if (!name.trim() || MAP_IDS.some((m) => MAPS[m].defaultName === name)) setName(MAPS[id].defaultName); };
  const [kind, setKind] = useState<'grid' | 'sticker' | 'word' | 'map' | 'bingo'>('grid');
  const [bankId, setBankId] = useState<string>(banks[0]?.id ?? 'new');
  const [bankText, setBankText] = useState('');
  const [prefer, setPrefer] = useState(true);
  const [freeText, setFreeText] = useState('');
  const bank = banks.find((b) => b.id === bankId) ?? null;
  const [staged, setStaged] = useState<Staged[]>([]);
  const [stickerGroups, setStickerGroups] = useState<string[]>([]);
  const [newGroup, setNewGroup] = useState('');
  const addStickerGroup = () => { const n = newGroup.trim(); if (n && !stickerGroups.some((g) => g.toLowerCase() === n.toLowerCase())) setStickerGroups((g) => [...g, n]); setNewGroup(''); };
  const dropStickerGroup = (name: string) => { setStickerGroups((g) => g.filter((x) => x !== name)); setStaged((st) => st.map((x) => (x.group === name ? { ...x, group: '' } : x))); };
  const [error, setError] = useState<string | null>(null);
  const setGroup = (i: number, patch: Partial<{ name: string; text: string }>) => setGroups((g) => g.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const submit = async () => {
    try {
      const onCreate = (i: CreateInput) => onCreateWith(i, description.trim() || undefined);
      if (kind === 'bingo') { await onCreate({ year, name, bankId: bank ? bank.id : null, newBankPrompts: bank ? [] : splitPrompts(bankText), preferUnused: bank?.lastYear ? prefer : false, freeText }); return; }
      if (kind === 'map') { await onCreate({ usMap: true, year, name, color, region: mapId, bonus: hasBonusPlaces(mapId) ? bonus : mapId === 'us' ? 'off' : 'optional', australia, limit: limited ? Number(limit) : null }); return; }
      if (kind === 'word') { await onCreate({ word: true, year, name, color, theme, target: target.trim() ? Number(target) : null, letters }); return; }
      if (kind === 'sticker') { await onCreate({ year, name, color, groups: stickerGroups.map((g, i) => ({ name: g, color: accentAt(i + 1) })), stickers: staged.map((s) => ({ prompt: s.prompt, image: s.image, group: s.group })) }); return; }
      await onCreate({ year, name, color, prompts: splitPrompts(main), groups: groups.map((g, i) => ({ name: g.name, color: accentAt(i + 1), prompts: splitPrompts(g.text) })) });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="bcard newchal">
      <div className="stack"><span className="lbl2">Kind</span>
        <div className="seg" role="group" aria-label="Kind">
          <button type="button" className={kind === 'grid' ? 'on' : ''} aria-pressed={kind === 'grid'} onClick={() => setKind('grid')}>Grid</button>
          <button type="button" className={kind === 'sticker' ? 'on' : ''} aria-pressed={kind === 'sticker'} onClick={() => setKind('sticker')}>Sticker</button>
          <button type="button" className={kind === 'word' ? 'on' : ''} aria-pressed={kind === 'word'} onClick={() => setKind('word')}>Word builder</button>
          <button type="button" className={kind === 'map' ? 'on' : ''} aria-pressed={kind === 'map'} onClick={() => { setKind('map'); if (!name.trim()) setName(MAPS[mapId].defaultName); }}>Map</button>
          <button type="button" className={kind === 'bingo' ? 'on' : ''} aria-pressed={kind === 'bingo'} onClick={() => setKind('bingo')}>Bingo</button>
        </div>
      </div>
      <label className="stack"><span className="lbl2">Name</span><input className="field big" value={name} placeholder="100 Prompts" onChange={(e) => setName(e.target.value)} /></label>
      <label className="stack"><span className="lbl2">Description (optional)</span><textarea className="field" rows={2} aria-label="Description" placeholder="What this challenge is about" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      {kind !== 'bingo' && <div className="stack"><span className="lbl2">Color</span>
        <span className="swatches" role="group" aria-label="Challenge color">{ACCENTS.map((c) => <button key={c} type="button" className={`swatch${c === color ? ' on' : ''}`} style={{ background: c }} aria-label={`Color ${c}`} aria-pressed={c === color} onClick={() => setColor(c)} />)}</span></div>}
      {kind === 'bingo' ? (
        <>
          <label className="stack"><span className="lbl2">Prompt bank</span>
            <select className="field" aria-label="Prompt bank" value={bankId} onChange={(e) => setBankId(e.target.value)}>
              {banks.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.count} prompts)</option>)}
              <option value="new">A new bank from a list...</option>
            </select></label>
          {!bank && <label className="stack"><span className="lbl2">Prompts for the new bank, one per line (at least 24; more is better, so boards can be different each year)</span>
            <textarea className="field" rows={8} aria-label="Bank prompts" value={bankText} onChange={(e) => setBankText(e.target.value)} /></label>}
          {bank?.lastYear ? <label className="check"><input type="checkbox" checked={prefer} onChange={(e) => setPrefer(e.target.checked)} /> Start with prompts that were not on your {bank.lastYear} board</label> : null}
          <label className="stack"><span className="lbl2">Free space prompt (optional; leave empty for a plain FREE)</span><input className="field" value={freeText} onChange={(e) => setFreeText(e.target.value)} /></label>
          <span className="muted small">The board starts as a draft you can change before publishing. Pictures can be added in the bank or on the board.</span>
        </>
      ) : kind === 'map' ? (
        <>
          <label className="stack"><span className="lbl2">Map</span>
            <select className="field" aria-label="Map" value={mapId} onChange={(e) => pickMap(e.target.value as MapId)}>
              {MAP_IDS.map((m) => <option key={m} value={m}>{MAPS[m].title}</option>)}
            </select></label>
          {hasBonusPlaces(mapId) && <label className="stack"><span className="lbl2">Bonus prompts ({MAPS[mapId].bonusNote})</span>
            <select className="field" aria-label="Bonus prompts" value={bonus} onChange={(e) => setBonus(e.target.value as BonusMode)}>
              <option value="optional">Optional (extra points, not part of the goal)</option>
              <option value="required">Required (part of the goal)</option>
              <option value="off">Not included</option>
            </select></label>}
          {mapId === 'continents' && <label className="check"><input type="checkbox" checked={australia} onChange={(e) => setAustralia(e.target.checked)} /> Call Oceania "Australia"</label>}
          <label className="check"><input type="checkbox" checked={limited} onChange={(e) => setLimited(e.target.checked)} /> Limited: complete after a number of {MAPS[mapId].plural}</label>
          {limited && <label className="stack"><span className="lbl2">Complete after (1 to {mapPlaces(mapId, bonus, australia).length})</span><input className="field small" type="number" min={1} aria-label="Complete after" value={limit} onChange={(e) => setLimit(e.target.value)} /></label>}
          <span className="muted small">{limited ? `You get ${limit || 'N'} boxes. Put a book in a box, then choose which ${MAPS[mapId].noun} it is for. A box counts once it has a place, and each place can be used once.` : `A card for every ${MAPS[mapId].noun}. Put a book on one and it fills in on the map.`}</span>
        </>
      ) : kind === 'word' ? (
        <>
          <label className="stack"><span className="lbl2">What the words are about (the theme)</span><input className="field" aria-label="Theme" placeholder="Countries" value={theme} onChange={(e) => setTheme(e.target.value)} /></label>
          <label className="stack"><span className="lbl2">Book limit (leave empty for no limit)</span><input className="field small" type="number" min={1} placeholder="No limit" aria-label="Book limit" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
          <div className="stack"><span className="lbl2">Letter stickers (you can add or change them later)</span>
            <LetterStickers letters={Object.fromEntries(Object.entries(letters).map(([l, i]) => [l, i.dataUrl]))}
              onSet={async (l, f) => { try { const img = await fileToDataUrl(f, 300); setLetters((x) => ({ ...x, [l]: img })); } catch { setError('That picture could not be read.'); } }}
              onRemove={(l) => setLetters((x) => { const n = { ...x }; delete n[l]; return n; })} /></div>
        </>
      ) : kind === 'sticker' ? (
        <>
          <div className="stack"><span className="lbl2">Sub-categories (optional)</span>
            {stickerGroups.length > 0 && <span className="chips">{stickerGroups.map((g) => <span key={g} className="chip">{g}<button type="button" className="x" aria-label={`Remove sub-category ${g}`} onClick={() => dropStickerGroup(g)}>&times;</button></span>)}</span>}
            <div className="addrow"><input className="field small" aria-label="New sub-category" placeholder="Main Character" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStickerGroup(); } }} />
              <button type="button" className="mini" onClick={addStickerGroup}>Add sub-category</button></div></div>
          <div className="stack"><span className="lbl2">Stickers and their prompts</span>
            <StickerStaging value={staged} onChange={setStaged} groups={stickerGroups.map((g) => ({ value: g, label: g }))} /></div>
        </>
      ) : <>
      <label className="stack"><span className="lbl2">{groups.length ? 'Main prompts (not in a sub-category), one per line' : 'Prompts, one per line'}</span>
        <textarea className="field" rows={groups.length ? 3 : 8} value={main} onChange={(e) => setMain(e.target.value)} /></label>
      {groups.map((g, i) => (
        <div key={i} className="bcard gcard" style={{ ['--gc' as string]: accentAt(i + 1) }}>
          <label className="stack"><span className="lbl2">Sub-category name</span><input className="field" value={g.name} placeholder="Main Character" onChange={(e) => setGroup(i, { name: e.target.value })} /></label>
          <label className="stack"><span className="lbl2">Prompts in {g.name || 'this sub-category'}, one per line</span><textarea className="field" rows={4} value={g.text} onChange={(e) => setGroup(i, { text: e.target.value })} /></label>
          <button type="button" className="mini" onClick={() => setGroups((x) => x.filter((_, j) => j !== i))}>Remove this sub-category</button>
        </div>
      ))}
      <button type="button" className="mini" onClick={() => setGroups((g) => [...g, { name: '', text: '' }])}>+ Add a sub-category</button></>}
      {error && <div className="muted" role="alert">{error}</div>}
      <div className="actions"><button type="button" className="btn" onClick={onCancel}>Cancel</button><span className="grow" /><button type="button" className="btn on" onClick={submit}>Create challenge</button></div>
    </div>
  );
}

export default function ChallengesView({ year, list, banks, onCreate, onNewBank, onDelete }: { year: number; list: ChallengeSummary[]; banks: BankSummary[]; onCreate(input: CreateInput, description?: string): Promise<void>; onNewBank(name: string, prompts: string[]): Promise<void>; onDelete?(id: string): Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <div className="chalpage">
      {!adding && <div><button type="button" className="btn on" onClick={() => setAdding(true)}>+ New challenge</button></div>}
      {adding && <NewChallenge year={year} banks={banks} used={list.map((c) => c.color)} onCancel={() => setAdding(false)} onCreate={async (i) => { await onCreate(i); setAdding(false); }} />}
      {list.length === 0 && !adding && <p className="muted">No challenges for {year} yet. Create one to start placing books on prompts.</p>}
      <div className="chalgrid">
        {list.map((c) => (
          <div key={c.id} className="chalwrap">
            <Link to={`/journal/challenges/${c.id}`} className="bcard chalcard" style={{ ['--gc' as string]: c.color ?? accentAt(0) }}>
              <span className="gname-sm">{c.name}</span>
              <span className="muted small">{c.usMap ? 'Map' : c.word ? 'Word builder' : KIND[c.kind]}{c.published ? '' : ' · Draft'}</span>
              <TrackerBar t={c} color={c.color ?? undefined} bonus={c.bonus} />
            </Link>
            {onDelete && (confirm === c.id
              ? <span className="movebtns"><button type="button" className="mini danger" onClick={() => { setConfirm(null); void onDelete(c.id); }}>Delete {c.name}</button><button type="button" className="mini" onClick={() => setConfirm(null)}>Keep</button></span>
              : <button type="button" className="mini" aria-label={`Delete challenge ${c.name}`} onClick={() => setConfirm(c.id)}>Delete</button>)}
          </div>
        ))}
      </div>
      <Banks banks={banks} onNewBank={onNewBank} />
    </div>
  );
}

function Banks({ banks, onNewBank }: { banks: BankSummary[]; onNewBank(name: string, prompts: string[]): Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = async () => { try { await onNewBank(name, splitPrompts(text)); setAdding(false); setName(''); setText(''); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
  return (
    <section className="bcard" aria-label="Bingo prompt banks">
      <h2 className="gname-sm">Bingo prompt banks</h2>
      <span className="muted small">A bank is a big list of prompts. A Bingo board draws 24 of them at random, and next year's board can start with the ones you did not use.</span>
      <ul className="banklinks">{banks.map((b) => <li key={b.id}><Link className="l inline" to={`/journal/challenges/banks/${b.id}`}>{b.name}</Link> <span className="muted small">{b.count} prompts</span></li>)}</ul>
      {banks.length === 0 && !adding && <span className="muted small">No banks yet. Making a Bingo challenge can create one for you.</span>}
      {adding ? (
        <div className="stack">
          <input className="field" aria-label="New bank name" placeholder="Fall" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea className="field" rows={6} aria-label="New bank prompts" placeholder="One prompt per line" value={text} onChange={(e) => setText(e.target.value)} />
          {error && <div className="muted" role="alert">{error}</div>}
          <div className="actions"><button type="button" className="btn" onClick={() => setAdding(false)}>Cancel</button><span className="grow" /><button type="button" className="btn on" onClick={save}>Create bank</button></div>
        </div>
      ) : <div><button type="button" className="mini" onClick={() => setAdding(true)}>+ New bank</button></div>}
    </section>
  );
}
