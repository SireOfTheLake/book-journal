import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDb } from '../../db/DbContext';
import { chooseWild, completeTile, finishIndex, generateBoard, linkedReadIds, needsChoice, progressOf, promptOf, rerollTile, rollDice, SIZES, takeTurn, TOKEN_LABEL, toggleQuest, type Board, type Pools, type StretchLevel, type TokenName } from '../../domain/boardGame/board';
import { FAMILY_LABEL, promptCapacity, type Extras } from '../../domain/boardGame/prompts';
import { newSeed, seeded } from '../../domain/boardGame/rng';
import { deleteBoard, findReads, listBoards, loadExtras, loadPools, saveBoard, type ReadChoice } from '../../repo/boardGame';
import { useJournalYear } from '../../ui/Shell';
import BoardMap, { TYPE_NAME } from './BoardMap';
import Die from './Dice';

const STRETCH: { id: StretchLevel; label: string; note: string }[] = [
  { id: 'gentle', label: 'Gentle', note: 'About 1 in 10 prompts steps outside your usual' },
  { id: 'balanced', label: 'Balanced', note: 'About 1 in 5' },
  { id: 'adventurous', label: 'Adventurous', note: 'More than 1 in 3' },
];

export default function BoardGamePage() {
  const db = useDb();
  const year = useJournalYear();
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [extras, setExtras] = useState<Extras>({});
  const [pools, setPools] = useState<Pools>({ series: [], tbr: [] });
  const [selected, setSelected] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [size, setSize] = useState<25 | 40 | 60>(40);
  const [stretch, setStretch] = useState<StretchLevel>('balanced');
  const [useDie, setUseDie] = useState(false);
  const [rolling, setRolling] = useState<number[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [b, e, p] = await Promise.all([listBoards(db), loadExtras(db, year), loadPools(db)]);
    setBoards(b); setExtras(e); setPools(p);
    setId((cur) => (cur && b.some((x) => x.id === cur) ? cur : (b.find((x) => x.phase !== 'won') ?? b[0])?.id ?? null));
  }, [db, year]);
  useEffect(() => { load().catch((e) => setError(String(e))); }, [load]);

  const board = boards?.find((b) => b.id === id) ?? null;
  const update = async (next: Board) => {
    setBoards((all) => (all ?? []).map((b) => (b.id === next.id ? next : b)));
    try { await saveBoard(db, next); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const create = async () => {
    try {
      const fresh = await Promise.all([loadExtras(db, year), loadPools(db)]);
      const b = generateBoard({ seed: newSeed(), size, stretch, extras: fresh[0], pools: fresh[1] });
      await saveBoard(db, b);
      setExtras(fresh[0]); setPools(fresh[1]);
      setBoards((all) => [b, ...(all ?? [])]); setId(b.id); setSelected(null); setCreating(false);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const roll = () => {
    if (!board || board.phase !== 'roll' || rolling) return;
    const dice = rollDice(seeded(newSeed()), useDie && board.tokens.die > 0 ? 2 : 1);
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const finish = () => { setRolling(null); const next = takeTurn(board, dice, useDie); setUseDie(false); setSelected(next.pos); void update(next); };
    if (reduce) { finish(); return; }
    let n = 0;
    const timer = setInterval(() => { setRolling(dice.map(() => 1 + Math.floor(Math.random() * 6))); if (++n >= 9) { clearInterval(timer); finish(); } }, 80);
  };

  if (!boards) return <section><h1 className="pagetitle">BOARD GAME</h1>{error ? <div className="bcard warn" role="alert">{error}</div> : <p className="muted">Loading...</p>}</section>;
  const capacity = promptCapacity(extras);
  return (
    <section className="boardgame">
      <h1 className="pagetitle">BOARD GAME <span className="muted small">Roll the dice, land on a prompt, read your way to the finish</span></h1>
      {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      <div className="bg-bar">
        {boards.length > 0 && (
          <select aria-label="Board" value={id ?? ''} onChange={(e) => { setId(e.target.value); setSelected(null); setConfirmDelete(false); }}>
            {boards.map((b) => <option key={b.id} value={b.id}>{b.name}{b.phase === 'won' ? ' (beaten)' : ''}</option>)}
          </select>
        )}
        <button type="button" className="btn on" onClick={() => setCreating(!creating)} aria-expanded={creating}>{creating ? 'Cancel' : boards.length ? 'New board' : 'Make my first board'}</button>
      </div>
      {(creating || boards.length === 0) && (
        <div className="bcard bg-new">
          <span className="lbl2">A new board</span>
          <p className="muted">Every board is made fresh: its path, its zones, its prompts and its surprises. This list can draw on about {Math.round(capacity / 100) * 100} different prompts, so boards rarely repeat.</p>
          <div className="seg" role="group" aria-label="Board size">
            {SIZES.map((s) => <button key={s.size} type="button" className={size === s.size ? 'on' : ''} aria-pressed={size === s.size} onClick={() => setSize(s.size)}>{s.label}</button>)}
          </div>
          <div className="seg" role="group" aria-label="How adventurous">
            {STRETCH.map((s) => <button key={s.id} type="button" className={stretch === s.id ? 'on' : ''} aria-pressed={stretch === s.id} onClick={() => setStretch(s.id)}>{s.label}</button>)}
          </div>
          <span className="muted small">{STRETCH.find((s) => s.id === stretch)!.note}. Prompts from your unfinished challenges, your own saved prompts, and real picks from your series and TBR are mixed in.</span>
          <div><button type="button" className="btn on" onClick={create}>Generate board</button></div>
        </div>
      )}
      {board && <BoardView key={board.id} board={board} extras={extras} pools={pools} selected={selected} setSelected={setSelected} update={update} roll={roll} rolling={rolling}
        useDie={useDie} setUseDie={setUseDie} onNew={() => setCreating(true)} onDelete={async () => { await deleteBoard(db, board.id); setConfirmDelete(false); await load(); }} confirmDelete={confirmDelete} setConfirmDelete={setConfirmDelete} />}
      {boards.some((b) => b.phase === 'won') && (
        <div className="bcard">
          <span className="lbl2">Boards you have beaten</span>
          <ul className="bg-hall">
            {boards.filter((b) => b.phase === 'won').map((b) => (
              <li key={b.id}><button type="button" className="quiet" onClick={() => { setId(b.id); setSelected(null); }}>{b.name}</button>
                <span className="muted small"> {b.size} spaces · {b.stats.rolls} rolls{b.titles.length ? ` · ${b.titles.join(', ')}` : ''}{b.finishedAt ? ` · ${b.finishedAt.slice(0, 10)}` : ''}</span></li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function BoardView({ board, extras, pools, selected, setSelected, update, roll, rolling, useDie, setUseDie, onNew, onDelete, confirmDelete, setConfirmDelete }: {
  board: Board; extras: Extras; pools: Pools; selected: number | null; setSelected(i: number | null): void; update(b: Board): Promise<void>; roll(): void; rolling: number[] | null;
  useDie: boolean; setUseDie(v: boolean): void; onNew(): void; onDelete(): Promise<void>; confirmDelete: boolean; setConfirmDelete(v: boolean): void;
}) {
  const p = progressOf(board);
  const tile = board.current !== null ? board.tiles[board.current] : null;
  const shown = selected !== null ? board.tiles[selected] : null;
  const dice = rolling ?? board.lastRoll ?? [];
  const tokens = (Object.keys(board.tokens) as TokenName[]);
  return (
    <div className="bg-layout" style={Object.fromEntries(board.zones.map((z) => [`--bgz-${z.color}`, ZONE_COLOR[z.color]])) as React.CSSProperties}>
      <div className="bg-left">
        <div className="bcard bg-head">
          <div><span className="gname-sm">{board.name}</span><br /><span className="muted small">{board.size} spaces · {board.zones.length} zones · {FAMILY_LABEL.stretch.toLowerCase()} level: {board.stretch}</span></div>
          <div className="bg-prog" role="group" aria-label="Progress"><b>{p.done}/{p.spaces}</b><span className="muted small"> spaces done · space {board.pos} of {finishIndex(board)}</span>
            <span className="cbar" aria-hidden="true"><span style={{ width: `${Math.round((board.pos / finishIndex(board)) * 100)}%` }} /></span></div>
        </div>
        <div className="bg-scroll"><BoardMap board={board} selected={selected} onSelect={setSelected} /></div>
        <div className="bg-legend muted small" aria-label="Legend">
          <span>{'▲'} bonus</span><span>{'▼'} penalty</span><span>{'◆'} item</span><span>{'✦'} wild</span><span>{'❯❯'} next in series</span><span>{'▤'} TBR</span><span>{'♛'} boss</span><span>! side quest</span>
        </div>
        <div className="bg-zones">
          {board.zones.map((z, i) => <span key={i} className="bg-zchip" style={{ ['--zc' as string]: ZONE_COLOR[z.color] }} title={z.blurb}><i />{z.name}{board.tiles[z.to].done ? ' ✓' : ''}</span>)}
        </div>
      </div>
      <aside className="bg-right">
        {board.phase === 'won' ? (
          <div className="bcard bg-won" role="status">
            <span className="gname-sm">You beat the board!</span>
            <p>{p.done} spaces, {board.stats.rolls} rolls, {board.stats.rerolls} rerolls{board.titles.length ? `. Titles: ${board.titles.join(', ')}` : ''}.</p>
            <div><button type="button" className="btn on" onClick={onNew}>Start a new board</button></div>
          </div>
        ) : (
          <div className="bcard bg-turn">
            <span className="lbl2">{board.phase === 'roll' ? 'Your turn' : `Space ${tile!.i}: ${TYPE_NAME[tile!.type]}`}</span>
            <div className="bg-dice" aria-live="polite">{dice.length > 0 ? dice.map((d, i) => <Die key={i} value={d} rolling={!!rolling} />) : <span className="muted">Roll to move.</span>}</div>
            {board.phase === 'roll' && (
              <>
                {board.tokens.die > 0 && <label className="inline"><input type="checkbox" role="switch" className="toggle" checked={useDie} onChange={(e) => setUseDie(e.target.checked)} /><span>Use an extra die ({board.tokens.die})</span></label>}
                <button type="button" className="btn on" onClick={roll} disabled={!!rolling}>{rolling ? 'Rolling...' : 'Roll the dice'}</button>
              </>
            )}
            {board.phase === 'play' && tile && <PlayTurn board={board} tile={tile} extras={extras} pools={pools} update={update} />}
          </div>
        )}
        <div className="bcard">
          <span className="lbl2">Tokens</span>
          <div className="bg-tokens">{tokens.map((t) => <span key={t} className="bg-tok" title={TOKEN_HELP[t]}><b>{board.tokens[t]}</b> {TOKEN_LABEL[t]}</span>)}</div>
          <span className="muted small">Rerolls change a prompt. A shield blocks one slide back. An extra die adds a second die to one roll. Side quests earn rerolls. Bosses block the way until you beat them.</span>
        </div>
        {shown && (
          <div className="bcard">
            <span className="lbl2">Space {shown.i}: {TYPE_NAME[shown.type]}</span>
            <p>{shown.chosen ?? shown.text}</p>
            {shown.note && <span className="muted small">{shown.note}</span>}
            {shown.choices && !shown.chosen && <ul className="bg-choices">{shown.choices.map((c) => <li key={c}>{c}</li>)}</ul>}
            {shown.picks && <ul className="bg-choices">{shown.picks.map((c) => <li key={c.title}>{c.title}{c.detail ? <span className="muted small"> · {c.detail}</span> : null}</li>)}</ul>}
            {shown.quest && <span className="muted small">Side quest: {shown.quest.text}{shown.quest.done ? ' (done)' : ''}</span>}
            {shown.reward && <span className="muted small">Beat it to earn the title "{shown.reward}"</span>}
            {shown.done && 'title' in shown.done && shown.done.title && <span className="muted small">Done with {shown.done.title}</span>}
          </div>
        )}
        <div className="bcard">
          <span className="lbl2">What happened</span>
          <ol className="bg-log">{board.log.slice(0, 8).map((l, i) => <li key={i} className={i === 0 ? '' : 'muted'}>{l}</li>)}</ol>
          {confirmDelete
            ? <div className="movebtns"><button type="button" className="mini danger" onClick={() => void onDelete()}>Delete {board.name}</button><button type="button" className="mini" onClick={() => setConfirmDelete(false)}>Keep</button></div>
            : <button type="button" className="mini" onClick={() => setConfirmDelete(true)}>Delete this board</button>}
        </div>
      </aside>
    </div>
  );
}

const ZONE_COLOR = ['#b0603a', '#5b7e8e', '#8a9a5e', '#9a6aa0', '#c79a45', '#a0505e', '#4f8a7a', '#7a7ab0'];
const TOKEN_HELP: Record<TokenName, string> = { reroll: 'Change a prompt', shield: 'Blocks one slide back', die: 'A second die for one roll' };

function PlayTurn({ board, tile, extras, pools, update }: { board: Board; tile: Board['tiles'][number]; extras: Extras; pools: Pools; update(b: Board): Promise<void> }) {
  const db = useDb();
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<ReadChoice[]>([]);
  const used = useMemo(() => linkedReadIds(board), [board]);
  useEffect(() => {
    if (!finding) return;
    let live = true;
    findReads(db, query, board.createdAt.slice(0, 10), used).then((r) => live && setFound(r), () => undefined);
    return () => { live = false; };
  }, [db, finding, query, board.createdAt, used]);
  if (needsChoice(tile)) {
    return (
      <div className="bg-wild">
        <p>{tile.text}</p>
        {tile.choices!.map((c, i) => <button key={c} type="button" className="btn" onClick={() => void update(chooseWild(board, i))}>{c}</button>)}
        <RerollButton board={board} extras={extras} pools={pools} update={update} />
      </div>
    );
  }
  const done = (link: { readId: string | null; title: string | null }) => { setFinding(false); setQuery(''); void update(completeTile(board, link)); };
  return (
    <div className="bg-prompt">
      <p className="bg-text">{promptOf(tile)}</p>
      {tile.note && <span className="muted small">{tile.note}</span>}
      {tile.picks && <ul className="bg-choices">{tile.picks.map((c) => <li key={c.title}><button type="button" className="quiet" onClick={() => { setFinding(true); setQuery(c.title); }}>{c.title}</button>{c.detail ? <span className="muted small"> · {c.detail}</span> : null}</li>)}</ul>}
      {tile.quest && (
        <label className="inline"><input type="checkbox" className="toggle" role="switch" checked={tile.quest.done} onChange={() => void update(toggleQuest(board, tile.i))} /><span>Side quest: {tile.quest.text} <span className="muted small">(earns a reroll)</span></span></label>
      )}
      {tile.type === 'boss' && <span className="muted small">Beat it for the title "{tile.reward}", a reroll, and a shield.</span>}
      {!finding ? (
        <div className="bg-actions">
          <button type="button" className="btn on" onClick={() => setFinding(true)}>I finished a book for this</button>
          <RerollButton board={board} extras={extras} pools={pools} update={update} />
        </div>
      ) : (
        <div className="bg-find">
          <input className="field" placeholder="Find a book you read" aria-label="Find a book" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          <ul className="bg-reads">
            {found.map((r) => <li key={r.readId}><button type="button" className="quiet" onClick={() => done({ readId: r.readId, title: r.title })}><b>{r.title}</b><span className="muted small"> {r.authors ?? ''}{r.date ? ` · ${r.date}` : ''}{r.status === 'reading' ? ' · reading now' : ''}</span></button></li>)}
            {found.length === 0 && <li className="muted small">{query ? 'No book by that name.' : 'Nothing finished since this board began. Type a title to find any book.'}</li>}
          </ul>
          <div className="bg-actions"><button type="button" className="mini" onClick={() => done({ readId: null, title: null })}>Done without linking a book</button><button type="button" className="mini" onClick={() => setFinding(false)}>Back</button></div>
        </div>
      )}
    </div>
  );
}

function RerollButton({ board, extras, pools, update }: { board: Board; extras: Extras; pools: Pools; update(b: Board): Promise<void> }) {
  const tile = board.tiles[board.current!];
  if (tile.type === 'boss') return null;
  return <button type="button" className="btn" disabled={board.tokens.reroll < 1} onClick={() => void update(rerollTile(board, seeded(newSeed()), extras, pools))}>Reroll ({board.tokens.reroll} left)</button>;
}
