import { assignVoice, unassignVoice } from '../../repo/voicing';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { mergeNarrators, narratorMergePlan } from '../../repo/narratorMerge';
import NarratorMenu from './NarratorMenu';
import EntityMenu from '../EntityMenu';
import { authorDeletePreview, authorMergePlan, deleteAuthor, mergeAuthors } from '../../repo/authorMerge';
import { useDb } from '../../db/DbContext';
import { listItems, type Item } from '../../repo/bookLog';
import { listBookOptions } from '../../repo/characters';
import * as repo from '../../repo/people';
import AuthorView from './AuthorView';
import NarratorView, { type NarratorActions } from './NarratorView';
import PeopleListView from './PeopleListView';
import { personActions } from './personActions';

export function AuthorsPage() {
  const db = useDb();
  const [rows, setRows] = useState<repo.PersonListRow[] | null>(null);
  useEffect(() => { repo.listAuthors(db).then(setRows); }, [db]);
  return <section><h1 className="pagetitle">AUTHORS <span className="muted small">Everyone whose books you have added</span></h1>{rows ? <PeopleListView kind="author" rows={rows} /> : <p className="muted">Loading...</p>}</section>;
}

export function NarratorsPage() {
  const db = useDb();
  const [rows, setRows] = useState<repo.PersonListRow[] | null>(null);
  useEffect(() => { repo.listNarrators(db).then(setRows); }, [db]);
  return <section><h1 className="pagetitle">NARRATORS <span className="muted small">Audiobook narrators you have listened to</span></h1>{rows ? <PeopleListView kind="narrator" rows={rows} /> : <p className="muted">Loading...</p>}</section>;
}

export function AuthorPage() {
  const db = useDb();
  const { authorId = '' } = useParams();
  const nav = useNavigate();
  const [others, setOthers] = useState<Item[]>([]);
  const [d, setD] = useState<repo.AuthorDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => { setD(await repo.getAuthor(db, authorId)); setOthers((await repo.listAuthors(db)).map((a) => ({ id: a.id, name: a.name }))); }, [db, authorId]);
  useEffect(() => { reload().catch((e) => setError(String(e))); }, [reload]);
  const act = useMemo(() => personActions(db, 'author', authorId, async (fn) => { try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }), [db, authorId, reload]);
  if (d === undefined) return <p className="muted">Loading...</p>;
  if (d === null) return <p className="muted">That author could not be found.</p>;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  return <section><div className="titlerow"><h1 className="pagetitle">AUTHOR</h1><EntityMenu noun="author" self={{ id: d.core.id, name: d.core.name }} others={others} merge={{
    plan: (keep, dup) => authorMergePlan(db, keep, dup),
    merge: async (keep, dup, choice) => { await mergeAuthors(db, keep, dup, choice); if (keep === authorId) await reload(); else nav(`/authors/${keep}`); },
  }} remove={{
    describe: async () => { const p = await authorDeletePreview(db, authorId); return `Their ${plural(p.books, 'book')} and ${plural(p.series, 'series')} stay in your journal, just without this author.`; },
    run: async () => { await deleteAuthor(db, authorId); nav('/authors'); },
  }} /></div>{error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}<AuthorView d={d} act={act} /></section>;
}

export function NarratorPage() {
  const db = useDb();
  const { narratorId = '' } = useParams();
  const nav = useNavigate();
  const [others, setOthers] = useState<Item[]>([]);
  const [d, setD] = useState<repo.NarratorDetail | null | undefined>(undefined);
  const [accents, setAccents] = useState<Item[]>([]);
  const [books, setBooks] = useState<(Item & { authors: string | null })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => { setD(await repo.getNarrator(db, narratorId)); setAccents(await listItems(db, 'accent')); setBooks(await listBookOptions(db)); setOthers((await repo.listNarrators(db)).map((n) => ({ id: n.id, name: n.name }))); }, [db, narratorId]);
  useEffect(() => { reload().catch((e) => setError(String(e))); }, [reload]);
  const act = useMemo<NarratorActions>(() => {
    const run = async (fn: () => Promise<unknown>) => { try { await fn(); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
    return { ...personActions(db, 'narrator', narratorId, run), addUsualAccent: (n) => run(() => repo.addUsualAccent(db, narratorId, n)), removeUsualAccent: (a) => run(() => repo.removeUsualAccent(db, narratorId, a)), voiceAdd: (rn, c) => run(() => assignVoice(db, rn, c)), voiceRemove: (rn, c) => run(() => unassignVoice(db, rn, c)), addBook: (b) => run(() => repo.addBookToNarrator(db, narratorId, b)), removeBook: (b) => run(() => repo.removeBookFromNarrator(db, narratorId, b)) };
  }, [db, narratorId, reload]);
  if (d === undefined) return <p className="muted">Loading...</p>;
  if (d === null) return <p className="muted">That narrator could not be found.</p>;
  return <section><div className="titlerow"><h1 className="pagetitle">NARRATOR</h1><NarratorMenu self={{ id: d.core.id, name: d.core.name }} narrators={others} api={{
    plan: (keep, dup) => narratorMergePlan(db, keep, dup),
    merge: async (keep, dup, choice) => { await mergeNarrators(db, keep, dup, choice); if (keep === narratorId) await reload(); else nav(`/narrators/${keep}`); },
  }} /></div>{error && <div className="bcard warn" role="alert">{error} <button type="button" className="mini" onClick={() => setError(null)}>Dismiss</button></div>}<NarratorView d={d} accents={accents} books={books} act={act} /></section>;
}
