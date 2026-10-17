import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDb } from '../db/DbContext';
import * as repo from '../repo/challenges';
import { fileToDataUrl } from '../ui/imageFile';
import { getCovers } from '../repo/library';
import * as bingo from '../repo/bingo';
import { fileToSquare } from '../ui/imageFile';
import BingoView, { type BingoActions } from './challenges/BingoView';
import type { AvailablePrompt } from './challenges/SquareEditor';
import WordView, { type WordActions } from './challenges/WordView';
import * as words from '../repo/words';
import * as usmap from '../repo/usmap';
import MapView, { type MapActions } from './challenges/MapView';
import GridView, { type GridActions } from './challenges/GridView';

export default function ChallengePage() {
  const db = useDb();
  const nav = useNavigate();
  const { id = '' } = useParams();
  const [c, setC] = useState<repo.Challenge | null | undefined>(undefined);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [available, setAvailable] = useState<AvailablePrompt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const got = await repo.getChallenge(db, id);
    setC(got);
    setAvailable(got?.kind === 'bingo' ? await bingo.listAvailablePrompts(db, id) : []);
    const ids = [...new Set([...(got?.loose ?? []), ...(got?.groups.flatMap((g) => g.slots) ?? [])].flatMap((s) => (s.fill ? [s.fill.book_id] : [])))];
    if (ids.length) setCovers(await getCovers(db, ids));
  }, [db, id]);
  useEffect(() => { reload().catch((e) => setError(String(e))); }, [reload]);
  const act = useMemo<GridActions>(() => {
    const run = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
    return {
      fill: (s, r, note) => run(async () => { await repo.fillSlot(db, s, r); if (note) await repo.setPromptNote(db, s, note); }), clear: (s) => run(() => repo.clearSlot(db, s)),
      search: (q) => repo.searchReads(db, id, q),
      describe: (t) => run(() => repo.setChallengeDescription(db, id, t)), rename: (n) => run(() => repo.renameChallenge(db, id, n)), color: (h) => run(() => repo.setChallengeColor(db, id, h)),
      remove: () => { repo.deleteChallenge(db, id).then(() => nav('/journal/challenges'), (e) => setError(String(e))); },
      addGroup: (n) => run(() => repo.addGroup(db, id, n)), renameGroup: (g, n) => run(() => repo.renameGroup(db, g, n)),
      groupColor: (g, h) => run(() => repo.setGroupColor(db, g, h)), removeGroup: (g) => run(() => repo.deleteGroup(db, g)),
      addPrompt: (g, l) => run(() => repo.addPrompt(db, id, g, l)), renamePrompt: (s, l) => run(() => repo.renamePrompt(db, s, l)),
      removePrompt: (s) => run(() => repo.deletePrompt(db, s)),
      askAll: (ask, label) => run(() => repo.setChallengeNotes(db, id, ask, label)), askPrompt: (s, ask) => run(() => repo.setPromptAsk(db, s, ask)), note: (s, t) => run(() => repo.setPromptNote(db, s, t)),
      cardCols: (k, n) => run(() => repo.setCardCols(db, id, k, n)), moveCard: (k, b) => run(() => repo.moveCard(db, id, k, b)),
      shuffleCards: () => run(() => repo.shuffleCards(db, id)), movePrompt: (s, g, b) => run(() => repo.movePrompt(db, s, g, b)),
      shufflePrompts: (g) => run(() => repo.shufflePrompts(db, id, g)),
      addStickers: async (items) => { await repo.addStickers(db, id, items); await reload(); },
      replaceSticker: (s, f) => run(async () => repo.replaceSticker(db, s, await fileToDataUrl(f, 400))),
    };
  }, [db, id, nav, reload]);
  const bact = useMemo<BingoActions>(() => {
    const run = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
    return {
      fill: (s, r) => run(() => repo.fillSlot(db, s, r)), clear: (s) => run(() => repo.clearSlot(db, s)), search: (q) => repo.searchReads(db, id, q),
      describe: (t) => run(() => repo.setChallengeDescription(db, id, t)), rename: (n) => run(() => repo.renameChallenge(db, id, n)),
      remove: () => { repo.deleteChallenge(db, id).then(() => nav('/journal/challenges'), (e) => setError(String(e))); },
      publish: () => run(() => bingo.publishBingo(db, id)), regenerate: () => run(() => bingo.regenerateBoard(db, id)),
      setText: (s, t) => run(() => bingo.setSquareText(db, s, t)), setImage: (s, f) => run(async () => bingo.setSquareImage(db, s, f ? await fileToSquare(f) : null)),
      setColor: (s, h) => run(() => bingo.setSquareColor(db, s, h)), setPalette: (cols) => run(() => bingo.setPalette(db, id, cols)),
      rerollColors: () => run(() => bingo.rerollColors(db, id)), swapForAnother: (s) => run(() => bingo.swapForAnother(db, s)),
      pickBankPrompt: (s, p) => run(() => bingo.pickBankPrompt(db, s, p)), swapSquares: (a, b) => run(() => bingo.swapSquares(db, a, b)),
      shuffleBoard: () => run(() => bingo.shuffleBoard(db, id)), size: (n) => run(() => repo.setCardCols(db, id, 'board', n)),
    };
  }, [db, id, nav, reload]);
  const wact = useMemo<WordActions>(() => {
    const run = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
    return {
      addWord: (r, w) => run(() => words.setWord(db, id, r, w)), clear: (s) => run(() => repo.clearSlot(db, s)), renameWord: (s, w) => run(() => repo.renamePrompt(db, s, w)),
      search: (q) => repo.searchReads(db, id, q), describe: (t) => run(() => repo.setChallengeDescription(db, id, t)), rename: (n) => run(() => repo.renameChallenge(db, id, n)), color: (h) => run(() => repo.setChallengeColor(db, id, h)),
      theme: (t) => run(() => words.setWordSettings(db, id, { theme: t })), target: (n) => run(() => words.setWordSettings(db, id, { target: n })),
      setLetter: async (l, f) => { try { await words.setLetter(db, id, l, await fileToDataUrl(f, 300)); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } },
      removeLetter: (l) => run(() => words.removeLetter(db, id, l)),
      remove: () => { repo.deleteChallenge(db, id).then(() => nav('/journal/challenges'), (e) => setError(String(e))); },
    };
  }, [db, id, nav, reload]);
  const mact = useMemo<MapActions>(() => {
    const run = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
    return {
      fill: (s, r) => run(() => repo.fillSlot(db, s, r)), clear: (s) => run(() => repo.clearSlot(db, s)), search: (q) => repo.searchReads(db, id, q),
      reroll: (s) => run(() => usmap.rerollStateColor(db, s)),
      describe: (t) => run(() => repo.setChallengeDescription(db, id, t)), rename: (n) => run(() => repo.renameChallenge(db, id, n)), color: (h) => run(() => repo.setChallengeColor(db, id, h)),
      remove: () => { repo.deleteChallenge(db, id).then(() => nav('/journal/challenges'), (e) => setError(String(e))); },
    };
  }, [db, id, nav, reload]);
  return (
    <section>
      <p className="small"><Link className="l inline" to="/journal/challenges">&larr; All challenges</Link></p>
      {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      {c === undefined ? <p className="muted">Loading...</p> : c === null ? <p className="muted">That challenge no longer exists.</p> : c.usMap ? <MapView challenge={c} covers={covers} act={mact} /> : c.word ? <WordView challenge={c} covers={covers} act={wact} /> : c.kind === 'bingo' ? <BingoView challenge={c} covers={covers} available={available} act={bact} /> : <GridView challenge={c} covers={covers} act={act} />}
    </section>
  );
}
