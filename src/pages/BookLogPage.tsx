import { assignVoice, unassignVoice } from '../repo/voicing';
import { addLocationToBook, listPickablePlaces, savePlace } from '../repo/places';
import { listMergeCandidates } from '../repo/bookMerge';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDb } from '../db/DbContext';
import * as repo from '../repo/bookLog';
import { fileToDataUrl, urlToDataUrl } from '../ui/imageFile';
import { downloadCover } from '../lookup/download';
import { addCharacterToBook, createCharacter, listCharacterOptions, removeCharacterFromBook } from '../repo/characters';
import { createSeries, listSeriesOptions, setBookSeries, listUniverses, createUniverse } from '../repo/series';
import { setBookUniverse } from '../repo/universes';
import { renameEntry } from '../repo/lists';
import { setWord } from '../repo/words';
import { fillSlot, clearSlot, listChallengeChoices, listReadChallenges } from '../repo/challenges';
import { getReason, setReason, setReasonPrompt, type Reason } from '../repo/reason';
import { listShelf, type ShelfBook } from '../repo/shelf';
import { discardDraft, nameDraftBook, chooseShelfBook } from '../repo/randomizer';
import { useFeatures } from '../features/FeaturesContext';
import { addQuote, deleteQuote, listBookQuotes, setQuoteFavorite, updateQuote, type Quote } from '../repo/quotes';
import DraftBook from './bookLog/DraftBook';
import type { QuoteActions } from './bookLog/QuotesCard';
import BookLogView, { type Actions, type ChallengeInfo, type Lists } from './bookLog/BookLogView';

export default function BookLogPage() {
  const db = useDb();
  const nav = useNavigate();
  const { bookId = '', readId } = useParams();
  const [log, setLog] = useState<repo.BookLog | null | undefined>(undefined);
  const [lists, setLists] = useState<Lists>({ sources: [], timePeriods: [], accents: [], places: [], genres: [], themes: [], tropes: [], series: [], universes: [], characters: [], authors: [], narrators: [] });
  const [neighbors, setNeighbors] = useState<repo.Neighbors>({ prev: null, next: null });
  const [chData, setChData] = useState<{ items: Awaited<ReturnType<typeof listReadChallenges>>; choices: Awaited<ReturnType<typeof listChallengeChoices>> }>({ items: [], choices: [] });
  const [reason, setReasonState] = useState<Reason>({ kind: null, sub: null, prompt: null });
  const [shelf, setShelf] = useState<ShelfBook[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const { flags } = useFeatures();
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [l, sources, timePeriods, accents, places, genres, themes, tropes, moods, paces, warnings, series, universes, characters, authors, narrators] = await Promise.all([
      repo.getBookLog(db, bookId, readId), repo.listItems(db, 'source'), repo.listItems(db, 'time_period'), repo.listItems(db, 'accent'), listPickablePlaces(db),
      repo.listTagOptions(db, 'genre'), repo.listTagOptions(db, 'theme'), repo.listTagOptions(db, 'trope'), repo.listTagOptions(db, 'mood'), repo.listTagOptions(db, 'pace'), repo.listTagOptions(db, 'content_warning'), listSeriesOptions(db), listUniverses(db), listCharacterOptions(db), repo.listAuthorOptions(db), repo.listNarratorOptions(db),
    ]);
    setLog(l);
    setQuotes(flags.quotes ? await listBookQuotes(db, bookId) : []);
    if (l?.read) {
      const r = l.read;
      const years = [...new Set([r.finish_date, r.start_date, new Date().toLocaleDateString('en-CA')].filter((d): d is string => !!d).map((d) => Number(d.slice(0, 4))))];
      setReasonState(await getReason(db, r.id));
      setChData({ items: await listReadChallenges(db, r.id), choices: await listChallengeChoices(db, r.id, years) });
    } else setChData({ items: [], choices: [] });
    setShelf(l?.book.is_draft ? await listShelf(db) : []);
    setNeighbors(await repo.getNeighbors(db, l?.read?.id ?? null));
    setLists({ sources, timePeriods, accents, places, genres, themes, tropes, moods, paces, warnings, series, universes, characters, authors, narrators });
  }, [db, bookId, readId, flags.quotes]);
  useEffect(() => { reload().catch((e) => setError(String(e))); }, [reload]);

  const act = useMemo<Actions | null>(() => {
    if (!log) return null;
    const rid = log.read?.id ?? null;
    const run = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
    return {
      setStatus: (s) => run(async () => { const id = await repo.setStatus(db, bookId, rid, s); if (id && id !== rid) nav(`/book/${bookId}/${id}`, { replace: true }); }),
      updateBook: (f) => run(() => repo.updateBook(db, bookId, f)),
      updateRead: (f) => run(() => (rid ? repo.updateRead(db, rid, f) : Promise.resolve())),
      addTag: (t, n) => run(() => repo.addTag(db, bookId, t, n)),
      removeTag: (t, id) => run(() => repo.removeTag(db, bookId, t, id)),
      renameTag: (t, id, name) => run(() => repo.renameTag(db, t, id, name)),
      narratorRating: (id, r) => run(() => repo.setNarratorRating(db, id, r)),
      addNarratorAccent: (id, n) => run(() => repo.addNarratorAccent(db, id, n)),
      removeNarratorAccent: (id, a) => run(() => repo.removeNarratorAccent(db, id, a)),
      renameAccent: (id, n) => run(() => renameEntry(db, 'accent', id, n)),
      saveEntry: (e) => run(() => (rid ? repo.saveDayEntry(db, rid, e) : Promise.resolve())),
      deleteEntry: (id) => run(() => repo.deleteDayEntry(db, id)),
      deleteRead: () => run(async () => { if (!rid) return; const r = await repo.deleteRead(db, rid); nav(`/book/${r.bookId}${r.nextReadId ? `/${r.nextReadId}` : ''}`, { replace: true }); }),
      deleteBook: () => run(async () => { await repo.deleteBook(db, bookId); nav('/library', { replace: true }); }),
      saveLocation: async (id, input) => { if (id) await savePlace(db, id, input); else await addLocationToBook(db, bookId, input); await reload(); },
      mergeCandidates: () => listMergeCandidates(db, bookId), startMerge: (other) => nav(`/book/${bookId}/merge/${other}`),
      newRead: () => run(async () => { const id = await repo.createRead(db, bookId); nav(`/book/${bookId}/${id}`); }),
      // a new source or time period is also chosen for this read / book straight away
      createItem: (table, name) => run(async () => {
        const id = await repo.createListItem(db, table, name);
        if (table === 'source') { if (rid) await repo.updateRead(db, rid, { source_id: id }); } else await repo.updateBook(db, bookId, { time_period_id: id, time_period_detail: null });
      }),
      startReading: () => run(async () => { const id = await repo.setStatus(db, bookId, null, 'reading'); if (id) nav(`/book/${bookId}/${id}`, { replace: true }); }),
      renameItem: (t, id, n) => run(() => repo.renameListItem(db, t, id, n)),
      removeSource: (id) => run(() => repo.removeSource(db, id)),
      voiceAdd: (rn, c) => run(() => assignVoice(db, rn, c)),
      voiceRemove: (rn, c) => run(() => unassignVoice(db, rn, c)),
      removeTimePeriod: (id) => run(() => repo.removeTimePeriod(db, id)),
      createCharacter: (name) => run(async () => addCharacterToBook(db, await createCharacter(db, name), bookId, 'side')),
      addCharacter: (cid, r) => run(() => addCharacterToBook(db, cid, bookId, r)),
      removeCharacter: (bc) => run(() => removeCharacterFromBook(db, bc)),
      addAuthor: (aid) => run(() => repo.addBookAuthor(db, bookId, { id: aid })),
      createAuthor: (name) => run(() => repo.addBookAuthor(db, bookId, { name })),
      removeAuthor: (aid) => run(() => repo.removeBookAuthor(db, bookId, aid)),
      addNarrator: (nid) => run(async () => { if (rid) await repo.addNarratorToRead(db, rid, nid); }),
      createNarrator: (name) => run(async () => { if (rid) await repo.addNarratorToRead(db, rid, await repo.createNarrator(db, name)); }),
      removeNarrator: (rnid) => run(() => repo.removeNarratorFromRead(db, rnid)),
      setCoverFile: (file) => run(async () => repo.setBookCover(db, bookId, await fileToDataUrl(file, 900))),
      setCoverUrl: async (url) => { const img = await urlToDataUrl(url, 900); await repo.setBookCover(db, bookId, img); await reload(); },
      setCoverCandidate: async (c) => { await repo.setBookCover(db, bookId, await downloadCover(c)); await reload(); },
      removeCover: () => run(() => repo.removeBookCover(db, bookId)),
      setSeries: (id) => run(() => setBookSeries(db, bookId, id)),
      createSeries: (name) => run(async () => setBookSeries(db, bookId, await createSeries(db, name))),
      setUniverse: (id) => run(() => setBookUniverse(db, bookId, id)),
      createUniverse: (name) => run(async () => setBookUniverse(db, bookId, await createUniverse(db, name))),
    };
  }, [db, log, bookId, nav, reload]);

  const challenges = useMemo<ChallengeInfo | undefined>(() => {
    const rid = log?.read?.id;
    if (!rid) return undefined;
    const run = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
    return { ...chData, act: { assign: (slotId) => void run(() => fillSlot(db, slotId, rid)), remove: (slotId) => void run(() => clearSlot(db, slotId)), setWord: (cid, w) => void run(() => setWord(db, cid, rid, w)) },
      reason, reasonAct: { set: (r) => void run(() => setReason(db, rid, r)), setPrompt: (t) => void run(() => setReasonPrompt(db, rid, t)) } };
  }, [db, log, chData, reason, reload]);

  const quoteAct = useMemo<QuoteActions>(() => {
    const run = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
    return {
      add: async (i) => { await addQuote(db, bookId, i); await reload(); },
      update: async (id, i) => { await updateQuote(db, id, i); await reload(); },
      favorite: (id, fav) => void run(() => setQuoteFavorite(db, id, fav)),
      remove: (id) => void run(() => deleteQuote(db, id)),
    };
  }, [db, bookId, reload]);

  if (log === undefined) return <p className="muted">Loading...</p>;
  if (log === null) return <p className="muted">That book could not be found.</p>;
  if (log.book.is_draft && log.read && challenges) {
    const rid = log.read.id;
    const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
    return (
      <>
        {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
        <DraftBook reason={challenges.reason ?? { kind: null, sub: null, prompt: null }} items={challenges.items} choices={challenges.choices} challengeAct={challenges.act}
          reasonAct={challenges.reasonAct ?? { set: () => undefined, setPrompt: () => undefined }} shelf={shelf}
          act={{
            chooseShelf: (id) => { chooseShelfBook(db, bookId, id).then(() => nav(`/book/${id}/${rid}`, { replace: true }), fail); },
            name: (title, authors) => { nameDraftBook(db, bookId, { title, authors }).then(reload, fail); },
            discard: () => { discardDraft(db, bookId).then(() => nav('/journal/randomizer'), fail); },
          }} />
      </>
    );
  }
  return (
    <>
      {error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}
      <BookLogView log={log} lists={lists} act={act!} neighbors={neighbors} challenges={challenges} quotes={{ items: quotes, act: quoteAct }} />
    </>
  );
}
