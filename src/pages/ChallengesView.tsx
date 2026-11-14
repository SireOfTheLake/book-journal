import { useState } from 'react';
import { windowText } from './challenges/ActiveWindow';
import { Link } from 'react-router-dom';
import type { LayoutItem } from '../repo/challengeCategories';
import { ACCENTS, accentAt, splitPrompts } from '../domain/challenges';
import { hslToRgb, rgbToHex } from '../domain/colorConv';
import ColorField from '../ui/ColorField';
import type { BankSummary } from '../repo/bingo';
import type { ChallengeSummary, NewGrid, NewPyramid, NewSticker, StickerImage } from '../repo/challenges';
import type { NewWordBuilder } from '../repo/words';
import type { NewMap as NewUsMap } from '../repo/usmap';
import { MAPS, MAP_IDS, canSplitUk, hasBonusPlaces, mapPlaces, type BonusMode, type MapId } from '../domain/maps';
import LetterStickers from '../ui/LetterStickers';
import { fileToDataUrl } from '../ui/imageFile';
import StickerStaging, { type Staged } from './challenges/StickerStaging';
import TrackerBar from './challenges/TrackerBar';

const KIND: Record<string, string> = { grid: 'Grid', sticker: 'Sticker', bingo: 'Bingo' };
// What a new challenge is called until you type your own name.
const DEFAULT_NAME = { grid: 'Reading Challenge', sticker: 'Sticker Challenge', pyramid: 'Pyramid', word: 'Word Builder', bingo: 'Bingo' } as const;

// A color for a new challenge: chosen at random, from the ones no other challenge this year has when there are any left.
export function randomAccent(used: (string | null)[], rng: () => number = Math.random): string {
  const taken = new Set(used.filter((c): c is string => !!c).map((c) => c.toLowerCase()));
  const free = ACCENTS.filter((c) => !taken.has(c.toLowerCase()));
  if (free.length) return free[Math.min(free.length - 1, Math.floor(rng() * free.length))];
  // Every ready-made color is in use: make a new one that nobody has.
  for (;;) {
    const hex = rgbToHex(hslToRgb({ h: Math.floor(rng() * 360), s: 0.4 + rng() * 0.25, l: 0.42 + rng() * 0.12 }));
    if (!taken.has(hex)) return hex;
  }
}
// What the form hands over for a Bingo board: an existing bank, or the prompts for a new one.
export interface NewBingoForm { year: number; name: string; bankId: string | null; newBankPrompts: string[]; preferUnused: boolean; freeText: string; goal?: number | null }
export type NewWordForm = NewWordBuilder & { word: true };
export type NewMapForm = NewUsMap & { usMap: true };
export type NewPyramidForm = NewPyramid & { pyramid: true };
export type CreateInput = NewGrid | NewSticker | NewPyramidForm | NewBingoForm | NewWordForm | NewMapForm;

function NewChallenge({ year, banks, used, onCreate: onCreateWith, onCancel }: { year: number; banks: BankSummary[]; used: (string | null)[]; onCreate(input: CreateInput, description?: string): Promise<void>; onCancel(): void }) {
  const [name, setName] = useState<string>(DEFAULT_NAME.grid);
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(() => randomAccent(used));
  const [theme, setTheme] = useState('');
  const [target, setTarget] = useState('');
  const [letters, setLetters] = useState<Record<string, StickerImage>>({});
  const [main, setMain] = useState('');
  const [pyrRows, setPyrRows] = useState('');
  const [groups, setGroups] = useState<{ name: string; text: string }[]>([]);
  const [mapId, setMapId] = useState<MapId>('us');
  const [bonus, setBonus] = useState<BonusMode>('off');
  const [territories, setTerritories] = useState<BonusMode>('off'); // US map: what the territories do, apart from DC
  const [australia, setAustralia] = useState(false);
  const [ukSplit, setUkSplit] = useState(false);
  const [extras, setExtras] = useState(false);
  const [limited, setLimited] = useState(false);
  const [limit, setLimit] = useState('25');
  const pickMap = (id: MapId) => { setMapId(id); setBonus(id === 'us' ? 'off' : 'optional'); setTerritories('off'); setLimit(String(MAPS[id].defaultLimit)); if (!name.trim() || MAP_IDS.some((m) => MAPS[m].defaultName === name)) setName(MAPS[id].defaultName); };
  const [kind, setKind] = useState<'grid' | 'sticker' | 'pyramid' | 'word' | 'map' | 'bingo'>('grid');
  const [goal, setGoal] = useState('blackout'); // Bingo: a full blackout or a number of bingos
  const [reqOn, setReqOn] = useState(false); // a limited challenge needs only some of its prompts
  const [reqText, setReqText] = useState('');
  const [reqBonus, setReqBonus] = useState(false);
  const isDefaultName = (n: string) => !n.trim() || Object.values(DEFAULT_NAME).includes(n as never) || MAP_IDS.some((m) => MAPS[m].defaultName === n);
  const pickKind = (k: 'grid' | 'sticker' | 'pyramid' | 'word' | 'bingo') => { setKind(k); if (isDefaultName(name)) setName(DEFAULT_NAME[k]); };
  const [bankId, setBankId] = useState<string>(banks[0]?.id ?? 'new');
  const [bankText, setBankText] = useState('');
  const [prefer, setPrefer] = useState(true);
  const [freeText, setFreeText] = useState('');
  const bank = banks.find((b) => b.id === bankId) ?? null;
  const [staged, setStaged] = useState<Staged[]>([]);
  const [laterList, setLaterList] = useState('');
  const [stickerGroups, setStickerGroups] = useState<string[]>([]);
  const [newGroup, setNewGroup] = useState('');
  const addStickerGroup = () => { const n = newGroup.trim(); if (n && !stickerGroups.some((g) => g.toLowerCase() === n.toLowerCase())) setStickerGroups((g) => [...g, n]); setNewGroup(''); };
  const dropStickerGroup = (name: string) => { setStickerGroups((g) => g.filter((x) => x !== name)); setStaged((st) => st.map((x) => (x.group === name ? { ...x, group: '' } : x))); };
  const [error, setError] = useState<string | null>(null);
  const setGroup = (i: number, patch: Partial<{ name: string; text: string }>) => setGroups((g) => g.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const submit = async () => {
    try {
      const limitInput = reqOn ? { required: Number(reqText) || 0, allowBonus: reqBonus } : {};
      const onCreate = (i: CreateInput) => onCreateWith(i, description.trim() || undefined);
      if (kind === 'bingo') { await onCreate({ year, name, bankId: bank ? bank.id : null, newBankPrompts: bank ? [] : splitPrompts(bankText), preferUnused: bank?.lastYear ? prefer : false, freeText, goal: goal === 'blackout' ? null : Number(goal) }); return; }
      if (kind === 'map') { await onCreate({ usMap: true, year, name, color, region: mapId, bonus: hasBonusPlaces(mapId) ? bonus : mapId === 'us' ? 'off' : 'optional', territories: mapId === 'us' ? territories : undefined, australia, ukSplit, extras: limited && extras, limit: limited ? Number(limit) : null }); return; }
      if (kind === 'word') { await onCreate({ word: true, year, name, color, theme, target: target.trim() ? Number(target) : null, letters }); return; }
      if (kind === 'pyramid') { await onCreate({ ...limitInput, pyramid: true, year, name, color, rows: splitPrompts(pyrRows), extras: splitPrompts(main) }); return; }
      if (kind === 'sticker') { await onCreate({ ...limitInput, year, name, color, groups: stickerGroups.map((g, i) => ({ name: g, color: accentAt(i + 1) })), stickers: [...staged.map((s) => ({ prompt: s.prompt, image: s.image, group: s.group })), ...splitPrompts(laterList).map((prompt) => ({ prompt, image: null }))] }); return; }
      await onCreate({ ...limitInput, year, name, color, prompts: splitPrompts(main), groups: groups.map((g, i) => ({ name: g.name, color: accentAt(i + 1), prompts: splitPrompts(g.text) })) });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="bcard newchal">
      <div className="stack"><span className="lbl2">Kind</span>
        <div className="seg" role="group" aria-label="Kind">
          <button type="button" className={kind === 'grid' ? 'on' : ''} aria-pressed={kind === 'grid'} onClick={() => pickKind('grid')}>Grid</button>
          <button type="button" className={kind === 'pyramid' ? 'on' : ''} aria-pressed={kind === 'pyramid'} onClick={() => pickKind('pyramid')}>Pyramid</button>
          <button type="button" className={kind === 'sticker' ? 'on' : ''} aria-pressed={kind === 'sticker'} onClick={() => pickKind('sticker')}>Sticker</button>
          <button type="button" className={kind === 'word' ? 'on' : ''} aria-pressed={kind === 'word'} onClick={() => pickKind('word')}>Word builder</button>
          <button type="button" className={kind === 'map' ? 'on' : ''} aria-pressed={kind === 'map'} onClick={() => { setKind('map'); if (isDefaultName(name)) setName(MAPS[mapId].defaultName); }}>Map</button>
          <button type="button" className={kind === 'bingo' ? 'on' : ''} aria-pressed={kind === 'bingo'} onClick={() => pickKind('bingo')}>Bingo</button>
        </div>
      </div>
      <label className="stack"><span className="lbl2">Name</span><input className="field big" value={name} placeholder="100 Prompts" onChange={(e) => setName(e.target.value)} /></label>
      <label className="stack"><span className="lbl2">Description (optional)</span><textarea className="field" rows={2} aria-label="Description" placeholder="What this challenge is about" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      {kind !== 'bingo' && <div className="stack"><span className="lbl2">Color</span>
        <ColorField value={color} label="Challenge color" onPick={setColor} /></div>}
      {kind === 'bingo' ? (
        <>
          <label className="stack"><span className="lbl2">Prompt bank</span>
            <select className="field" aria-label="Prompt bank" value={bankId} onChange={(e) => setBankId(e.target.value)}>
              {banks.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.count} prompts)</option>)}
              <option value="new">A new bank from a list...</option>
            </select></label>
          {!bank && <label className="stack"><span className="lbl2">Prompts for the new bank, one per line (at least 24; more is better, so boards can be different each year)</span>
            <textarea className="field" rows={8} aria-label="Bank prompts" value={bankText} onChange={(e) => setBankText(e.target.value)} /></label>}
          {bank?.lastYear ? <label className="check"><input type="checkbox" role="switch" className="toggle" checked={prefer} onChange={(e) => setPrefer(e.target.checked)} /> Start with prompts that were not on your {bank.lastYear} board</label> : null}
          <label className="stack"><span className="lbl2">Free space prompt (optional; leave empty for a plain FREE)</span><input className="field" value={freeText} onChange={(e) => setFreeText(e.target.value)} /></label>
          <label className="stack"><span className="lbl2">Goal</span>
            <select className="field" aria-label="Bingo goal" value={goal} onChange={(e) => setGoal(e.target.value)}>
              <option value="blackout">Full blackout (all 25 squares)</option>
              {Array.from({ length: 11 }, (_, i) => i + 1).map((n) => <option key={n} value={String(n)}>{n} bingo{n === 1 ? '' : 's'}</option>)}
            </select></label>
          <span className="muted small">The board starts as a draft you can change before publishing. Pictures can be added in the bank or on the board.</span>
        </>
      ) : kind === 'map' ? (
        <>
          <label className="stack"><span className="lbl2">Map</span>
            <select className="field" aria-label="Map" value={mapId} onChange={(e) => pickMap(e.target.value as MapId)}>
              {MAP_IDS.map((m) => <option key={m} value={m}>{MAPS[m].title}</option>)}
            </select></label>
          {hasBonusPlaces(mapId) && <label className="stack"><span className="lbl2">{mapId === 'us' ? 'District of Columbia' : `Bonus prompts (${MAPS[mapId].bonusNote})`}</span>
            <select className="field" aria-label={mapId === 'us' ? 'District of Columbia' : 'Bonus prompts'} value={bonus} onChange={(e) => setBonus(e.target.value as BonusMode)}>
              <option value="optional">Optional (extra points, not part of the goal)</option>
              <option value="required">Required (part of the goal)</option>
              <option value="off">Not included</option>
            </select></label>}
          {mapId === 'us' && <label className="stack"><span className="lbl2">Territories (Puerto Rico, Guam and the others)</span>
            <select className="field" aria-label="Territories" value={territories} onChange={(e) => setTerritories(e.target.value as BonusMode)}>
              <option value="optional">Optional (extra points, not part of the goal)</option>
              <option value="required">Required (part of the goal)</option>
              <option value="off">Not included</option>
            </select></label>}
          {mapId === 'continents' && <label className="check"><input type="checkbox" role="switch" className="toggle" checked={australia} onChange={(e) => setAustralia(e.target.checked)} /> Call Oceania "Australia"</label>}
          {canSplitUk(mapId) && <label className="check"><input type="checkbox" role="switch" className="toggle" checked={ukSplit} onChange={(e) => setUkSplit(e.target.checked)} /> Separate the United Kingdom into England, Northern Ireland, Scotland and Wales</label>}
          <label className="check"><input type="checkbox" role="switch" className="toggle" checked={limited} onChange={(e) => setLimited(e.target.checked)} /> Limited: complete after a number of {MAPS[mapId].plural}</label>
          {limited && <label className="stack"><span className="lbl2">Complete after (1 to {mapPlaces(mapId, bonus, australia, ukSplit, mapId === 'us' ? territories : bonus).length})</span><input className="field small" type="number" min={1} aria-label="Complete after" value={limit} onChange={(e) => setLimit(e.target.value)} /></label>}
          {limited && <label className="check"><input type="checkbox" role="switch" className="toggle" checked={extras} onChange={(e) => setExtras(e.target.checked)} /> Allow more than {limit || 'N'}: each extra {MAPS[mapId].noun} counts as a bonus</label>}
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
      ) : kind === 'pyramid' ? (
        <>
          <label className="stack"><span className="lbl2">Pyramid rows, one title per line, top to bottom</span>
            <textarea className="field" rows={6} aria-label="Pyramid rows" placeholder={'Standalone\nDuology\nTrilogy'} value={pyrRows} onChange={(e) => setPyrRows(e.target.value)} /></label>
          <span className="muted small">{`Row 1 gets 1 prompt, row 2 gets 2, and so on. The second book of a row called Duology is "Duology slot 2". That is ${(() => { const n = splitPrompts(pyrRows).length; return (n * (n + 1)) / 2; })()} prompts.`}</span>
          <label className="stack"><span className="lbl2">Extra prompts, one per line (you can make any of them optional later)</span>
            <textarea className="field" rows={5} aria-label="Extra prompts" value={main} onChange={(e) => setMain(e.target.value)} /></label>
        </>
      ) : kind === 'sticker' ? (
        <>
          <div className="stack"><span className="lbl2">Sub-categories (optional)</span>
            {stickerGroups.length > 0 && <span className="chips">{stickerGroups.map((g) => <span key={g} className="chip">{g}<button type="button" className="x" aria-label={`Remove sub-category ${g}`} onClick={() => dropStickerGroup(g)}>&times;</button></span>)}</span>}
            <div className="addrow"><input className="field small" aria-label="New sub-category" placeholder="Main Character" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStickerGroup(); } }} />
              <button type="button" className="mini" onClick={addStickerGroup}>Add sub-category</button></div></div>
          <div className="stack"><span className="lbl2">Stickers and their prompts</span>
            <StickerStaging value={staged} onChange={setStaged} groups={stickerGroups.map((g) => ({ value: g, label: g }))} /></div>
          <label className="stack"><span className="lbl2">Prompts without stickers yet (one per line)</span>
            <textarea className="field" rows={4} aria-label="Prompts without stickers yet" placeholder="Paste the prompts now and add each sticker later, in Edit" value={laterList} onChange={(e) => setLaterList(e.target.value)} /></label>
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
      {(kind === 'grid' || kind === 'sticker' || kind === 'pyramid') && (
        <div className="notesettings">
          <div className="toggleline">
            <label className="inline"><input type="checkbox" role="switch" className="toggle" checked={reqOn} onChange={(e) => { setReqOn(e.target.checked); if (!reqText) setReqText(String(Math.max(1, kind === 'pyramid' ? (() => { const n = splitPrompts(pyrRows).length; return (n * (n + 1)) / 2 + splitPrompts(main).length; })() : kind === 'sticker' ? staged.length + splitPrompts(laterList).length : splitPrompts(main).length))); if (!e.target.checked) setReqBonus(false); }} /><span>Limited Challenge</span></label>
            {reqOn && <input className="field tiny" type="number" min={1} aria-label="Prompts needed" value={reqText} onChange={(e) => setReqText(e.target.value)} />}
          </div>
          {reqOn && <label className="inline"><input type="checkbox" role="switch" className="toggle" checked={reqBonus} onChange={(e) => setReqBonus(e.target.checked)} /><span>Bonus prompts</span></label>}
        </div>
      )}
      {error && <div className="muted" role="alert">{error}</div>}
      <div className="actions"><button type="button" className="btn" onClick={onCancel}>Cancel</button><span className="grow" /><button type="button" className="btn on" onClick={submit}>Create challenge</button></div>
    </div>
  );
}

export interface CategoryActions {
  layout: LayoutItem[];
  onPlace(id: string, categoryId: string | null, beforeId: string | null): Promise<void>;
  onMoveCategory(id: string, beforeId: string | null): Promise<void>;
  onAddCategory(name: string): Promise<void>;
  onRenameCategory(id: string, name: string): Promise<void>;
  onDeleteCategory(id: string): Promise<void>;
}
type Drag = { kind: 'challenge' | 'category'; id: string } | null;

export default function ChallengesView({ year, list, banks, onCreate, onNewBank, onDeleteBank, onDelete, onMove, categories }: { onDeleteBank?(id: string): Promise<void>; onMove?(id: string, beforeId: string | null): Promise<void>; categories?: CategoryActions; year: number; list: ChallengeSummary[]; banks: BankSummary[]; onCreate(input: CreateInput, description?: string): Promise<void>; onNewBank(name: string, prompts: string[]): Promise<void>; onDelete?(id: string): Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [over, setOver] = useState<string | null>(null); // 'c:<id>' a challenge card, 'g:<id>' a category, 'end' the end of the page
  const [addingCat, setAddingCat] = useState(false);
  const [catName, setCatName] = useState('');
  const [catError, setCatError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmCat, setConfirmCat] = useState<string | null>(null);
  const endDrag = () => { setDrag(null); setOver(null); };
  const byId = new Map(list.map((c) => [c.id, c]));
  // Without categories the page is one flat list, exactly as before.
  const layout: LayoutItem[] = categories?.layout ?? list.map((c) => ({ kind: 'challenge' as const, id: c.id }));
  const top = layout.map((i) => i.id);
  const place = (id: string, cat: string | null, before: string | null) => categories ? categories.onPlace(id, cat, before) : onMove?.(id, before);
  const canDrag = !!(categories || onMove);
  const guard = (fn: () => Promise<void> | undefined) => { void Promise.resolve(fn()).catch((e) => setCatError(e instanceof Error ? e.message : String(e))); };

  const dropChallengeOnCard = (targetId: string, cat: string | null) => {
    const d = drag; endDrag();
    if (!d || d.id === targetId) return;
    if (d.kind === 'challenge') guard(() => place(d.id, cat, targetId));
    else if (categories) guard(() => categories.onMoveCategory(d.id, cat ?? targetId)); // a category goes before the loose card, or before the category the card is in
  };
  const dropOnCategory = (catId: string) => {
    const d = drag; endDrag();
    if (!d || !categories) return;
    if (d.kind === 'challenge') guard(() => place(d.id, catId, null));
    else if (d.id !== catId) guard(() => categories.onMoveCategory(d.id, catId));
  };
  const dropAtEnd = () => {
    const d = drag; endDrag();
    if (!d) return;
    if (d.kind === 'challenge') guard(() => place(d.id, null, null));
    else if (categories) guard(() => categories.onMoveCategory(d.id, null));
  };
  const startDrag = (e: React.DragEvent, d: NonNullable<Drag>) => { e.stopPropagation(); setDrag(d); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', d.id); };

  // One challenge card. `cat` is the category it is in (null when it is loose); `siblings` are the ids it can move among.
  const card = (c: ChallengeSummary, cat: string | null, siblings: string[]) => {
    const i = siblings.indexOf(c.id);
    return (
      <div key={c.id} className={`chalwrap${drag?.id === c.id ? ' dragging' : ''}${over === `c:${c.id}` && drag?.id !== c.id ? ' dropbefore' : ''}`}
        draggable={canDrag} onDragStart={(e) => startDrag(e, { kind: 'challenge', id: c.id })}
        onDragOver={(e) => { if (drag) { e.preventDefault(); e.stopPropagation(); setOver(`c:${c.id}`); } }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dropChallengeOnCard(c.id, cat); }}
        onDragEnd={endDrag}>
        <Link to={`/journal/challenges/${c.id}`} className="bcard chalcard" style={{ ['--gc' as string]: c.color ?? accentAt(0) }}>
          <span className="gname-sm">{c.name}</span>
          <span className="muted small">{c.usMap ? 'Map' : c.word ? 'Word builder' : c.pyramid ? 'Pyramid' : KIND[c.kind]}{c.published ? '' : ' · Draft'}</span>
          {c.kind === 'bingo' && windowText(c.activeFrom, c.activeUntil) && <span className="muted small">Active {windowText(c.activeFrom, c.activeUntil)}</span>}
          <TrackerBar t={c} color={c.color ?? undefined} bonus={c.bonus} />
        </Link>
        <div className="chalbar">
          {canDrag && <span className="movebtns">
            <button type="button" className="mini" aria-label={`Move ${c.name} earlier`} disabled={i === 0} onClick={() => guard(() => place(c.id, cat, siblings[i - 1]))}>&#9664;</button>
            <button type="button" className="mini" aria-label={`Move ${c.name} later`} disabled={i === siblings.length - 1} onClick={() => guard(() => place(c.id, cat, siblings[i + 2] ?? null))}>&#9654;</button>
          </span>}
          <span className="grow" />
          {onDelete && (confirm === c.id
            ? <span className="movebtns"><button type="button" className="mini danger" onClick={() => { setConfirm(null); void onDelete(c.id); }}>Delete {c.name}</button><button type="button" className="mini" onClick={() => setConfirm(null)}>Keep</button></span>
            : <button type="button" className="mini" aria-label={`Delete challenge ${c.name}`} onClick={() => setConfirm(c.id)}>Delete</button>)}
        </div>
      </div>
    );
  };

  // The page: runs of loose cards sit in a grid, and each category is a labelled section.
  const blocks: React.ReactNode[] = [];
  let run: React.ReactNode[] = [];
  const flush = () => { if (run.length) { blocks.push(<div key={`run${blocks.length}`} className="chalgrid">{run}</div>); run = []; } };
  layout.forEach((item, idx) => {
    if (item.kind === 'challenge') {
      const c = byId.get(item.id);
      if (c) run.push(card(c, null, top));
      return;
    }
    flush();
    const members = item.members.map((m) => byId.get(m)).filter((x): x is ChallengeSummary => !!x);
    const looseTop = top;
    blocks.push(
      <section key={item.id} className={`chalcat${drag?.id === item.id ? ' dragging' : ''}${over === `g:${item.id}` && drag?.id !== item.id ? ' dropon' : ''}`} aria-label={`Category ${item.name}`}
        onDragOver={(e) => { if (drag) { e.preventDefault(); e.stopPropagation(); setOver(`g:${item.id}`); } }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dropOnCategory(item.id); }}>
        <header className="chalcathead" draggable={canDrag} onDragStart={(e) => startDrag(e, { kind: 'category', id: item.id })} onDragEnd={endDrag}>
          {renaming?.id === item.id ? (
            <form className="addrow" onSubmit={(e) => { e.preventDefault(); const r = renaming; guard(async () => { await categories!.onRenameCategory(r.id, r.name); setRenaming(null); }); }}>
              <input className="field small" aria-label="Category name" autoFocus value={renaming.name} onChange={(e) => setRenaming({ id: item.id, name: e.target.value })} />
              <button type="submit" className="mini">Save</button><button type="button" className="mini" onClick={() => setRenaming(null)}>Cancel</button>
            </form>
          ) : <h2 className="chalcatname">{item.name} <span className="muted small">{members.length} challenge{members.length === 1 ? '' : 's'}</span></h2>}
          <span className="grow" />
          {canDrag && categories && renaming?.id !== item.id && <span className="movebtns">
            <button type="button" className="mini" aria-label={`Move category ${item.name} earlier`} disabled={idx === 0} onClick={() => guard(() => categories.onMoveCategory(item.id, looseTop[idx - 1]))}>&#9664;</button>
            <button type="button" className="mini" aria-label={`Move category ${item.name} later`} disabled={idx === looseTop.length - 1} onClick={() => guard(() => categories.onMoveCategory(item.id, looseTop[idx + 2] ?? null))}>&#9654;</button>
            <button type="button" className="mini" aria-label={`Rename category ${item.name}`} onClick={() => setRenaming({ id: item.id, name: item.name })}>Rename</button>
            {confirmCat === item.id
              ? <><button type="button" className="mini danger" onClick={() => { setConfirmCat(null); guard(() => categories.onDeleteCategory(item.id)); }}>Delete category {item.name}</button><button type="button" className="mini" onClick={() => setConfirmCat(null)}>Keep</button></>
              : <button type="button" className="xbtn subtle" aria-label={`Delete category ${item.name}`} onClick={() => setConfirmCat(item.id)}>&times;</button>}
          </span>}
        </header>
        {confirmCat === item.id && <span className="muted small">{members.length ? `Its ${members.length} challenge${members.length === 1 ? ' stays' : 's stay'} on the page, no longer in a category.` : 'It is empty.'}</span>}
        {members.length > 0
          ? <div className="chalgrid">{members.map((c) => card(c, item.id, item.members))}</div>
          : <p className="muted small chalempty">Drag challenges here.</p>}
      </section>);
  });
  flush();
  return (
    <div className="chalpage">
      {!adding && <div className="actions"><button type="button" className="btn on" onClick={() => setAdding(true)}>+ New challenge</button>
        {categories && !addingCat && <button type="button" className="btn" onClick={() => { setAddingCat(true); setCatError(null); }}>+ New category</button>}</div>}
      {categories && addingCat && (
        <form className="bcard addrow" onSubmit={(e) => { e.preventDefault(); guard(async () => { await categories.onAddCategory(catName); setCatName(''); setAddingCat(false); setCatError(null); }); }}>
          <input className="field small" aria-label="New category name" placeholder="Maps" autoFocus value={catName} onChange={(e) => setCatName(e.target.value)} />
          <button type="submit" className="mini">Add category</button><button type="button" className="mini" onClick={() => { setAddingCat(false); setCatName(''); setCatError(null); }}>Cancel</button>
        </form>)}
      {catError && <div className="muted" role="alert">{catError} <button type="button" className="mini" onClick={() => setCatError(null)}>Dismiss</button></div>}
      {adding && <NewChallenge year={year} banks={banks} used={list.map((c) => c.color)} onCancel={() => setAdding(false)} onCreate={async (i, description) => { await onCreate(i, description); setAdding(false); }} />}
      {list.length === 0 && !adding && <p className="muted">No challenges for {year} yet. Create one to start placing books on prompts.</p>}
      {blocks}
      {drag && <div className={`chaldropend${over === 'end' ? ' dropon' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver('end'); }} onDrop={(e) => { e.preventDefault(); dropAtEnd(); }}>Drop here to put it last{drag.kind === 'challenge' ? ', outside any category' : ''}</div>}
      <Banks banks={banks} onNewBank={onNewBank} onDeleteBank={onDeleteBank} />
    </div>
  );
}

function Banks({ banks, onNewBank, onDeleteBank }: { banks: BankSummary[]; onNewBank(name: string, prompts: string[]): Promise<void>; onDeleteBank?(id: string): Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = async () => { try { await onNewBank(name, splitPrompts(text)); setAdding(false); setName(''); setText(''); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
  return (
    <section className="bcard" aria-label="Bingo prompt banks">
      <h2 className="gname-sm">Bingo prompt banks</h2>
      <span className="muted small">A bank is a big list of prompts. A Bingo board draws 24 of them at random, and next year's board can start with the ones you did not use.</span>
      <ul className="banklinks">{banks.map((b) => <li key={b.id}><Link className="l inline" to={`/journal/challenges/banks/${b.id}`}>{b.name}</Link>{onDeleteBank && (delId !== b.id) && <button type="button" className="xbtn subtle" aria-label={`Delete bank ${b.name}`} title="Delete this bank" onClick={() => setDelId(b.id)}>&times;</button>} <span className="muted small">{b.count} prompts</span>{onDeleteBank && delId === b.id && <span className="movebtns"> <button type="button" className="mini danger" onClick={async () => { await onDeleteBank(b.id); setDelId(null); }}>Delete {b.name}</button><button type="button" className="mini" onClick={() => setDelId(null)}>Keep</button></span>}</li>)}</ul>
      <span className="muted small">Deleting a bank does not change boards already made from it; they keep their own copies of the prompts.</span>
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
