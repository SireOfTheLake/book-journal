import { useEffect, useMemo, useState } from 'react';
import { useDb } from '../db/DbContext';
import { useFeatures } from '../features/FeaturesContext';
import { SITE_NAME, type BookClip } from '../clip/types';
import { kindWord, reviewClip, saveClip, TAG_KINDS, type ClipReview, type ClipSaved, type NameMatch, type TagKind } from '../repo/clip';

type Pick = TagKind | 'skip';
const fmtLength = (s: number) => `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;

function Badge({ match }: { match: unknown }) {
  return <span className={`clipbadge ${match ? 'have' : 'new'}`}>{match ? 'In your library' : 'New'}</span>;
}

// A book read off a web page by the browser extension: check it, change anything, and add it (to the TBR unless you say otherwise).
export default function AddFromWebDialog({ clip, onClose, onOpenBook }: { clip: BookClip; onClose(): void; onOpenBook(bookId: string): void }) {
  const db = useDb();
  const { flags } = useFeatures();
  const [review, setReview] = useState<ClipReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ClipSaved | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState(clip.title);
  const [authors, setAuthors] = useState<NameMatch[]>([]);
  const [narrators, setNarrators] = useState<NameMatch[]>([]);
  const [series, setSeries] = useState('');
  const [seriesId, setSeriesId] = useState<string | null>(null);
  const [position, setPosition] = useState(clip.seriesPosition !== undefined ? String(clip.seriesPosition) : '');
  const [pages, setPages] = useState(clip.pages ? String(clip.pages) : '');
  // An Audible date is when the audiobook came out, not when the book was first published.
  const [published, setPublished] = useState(clip.site === 'audible' ? '' : clip.published ?? '');
  const [heat, setHeat] = useState(clip.heat !== undefined ? String(clip.heat) : '');
  const [synopsis, setSynopsis] = useState(clip.description ?? '');
  const [useCover, setUseCover] = useState(true);
  const [shelf, setShelf] = useState<'tbr' | 'up_next'>('tbr');
  const [asNew, setAsNew] = useState(false);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [newAuthor, setNewAuthor] = useState('');

  const allowed = useMemo<Pick[]>(() => ['skip', ...TAG_KINDS.filter((k) => (k !== 'mood' && k !== 'pace') || flags.moodpace).filter((k) => k !== 'content_warning' || flags.warnings)], [flags.moodpace, flags.warnings]);

  useEffect(() => {
    let live = true;
    reviewClip(db, clip).then((r) => {
      if (!live) return;
      setReview(r);
      setAuthors(r.authors); setNarrators(r.narrators);
      setSeries(r.series?.match?.name ?? r.series?.name ?? ''); setSeriesId(r.series?.match?.id ?? null);
      const initial: Record<string, Pick> = {};
      for (const t of r.tags) {
        const want: Pick = t.known ?? (t.hint === 'genre' ? 'genre' : t.hint === 'mood' ? 'mood' : t.hint === 'pace' ? 'pace' : t.hint === 'content_warning' ? 'content_warning' : 'skip');
        initial[t.name] = allowed.includes(want) ? want : 'skip';
      }
      setPicks(initial);
    }, (e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, clip]);

  const filling = !!review?.existing && !asNew;
  const cycle = (name: string) => setPicks((p) => ({ ...p, [name]: allowed[(allowed.indexOf(p[name] ?? 'skip') + 1) % allowed.length] }));

  async function save() {
    if (!review || busy) return;
    if (!title.trim()) { setError('The book needs a title.'); return; }
    setBusy(true); setError(null);
    try {
      const n = Number(pages); const h = Number(heat); const pos = position.trim() === '' ? null : Number(position);
      setSaved(await saveClip(db, {
        mode: filling ? { kind: 'fill', bookId: review.existing!.id } : { kind: 'new' },
        title: title.trim(), authors: authors.map((a) => a.match?.name ?? a.name), narrators: narrators.map((a) => a.match?.name ?? a.name),
        series: series.trim() ? { id: seriesId, name: series.trim() } : null, position: pos !== null && Number.isFinite(pos) ? pos : null,
        pages: pages.trim() && Number.isFinite(n) && n > 0 ? Math.round(n) : null, published: published.trim() || null,
        heat: heat !== '' && Number.isFinite(h) ? h : null, synopsis: synopsis.trim() || null, cover: useCover ? clip.cover ?? null : null, shelf,
        plannedFormat: clip.format ?? null,
        tags: review.tags.filter((t) => (picks[t.name] ?? 'skip') !== 'skip').map((t) => ({ name: t.name, kind: picks[t.name] as TagKind })),
        ids: { isbn: clip.isbn, asin: clip.asin, sources: { [clip.site]: clip.url } }, authorLinks: clip.authorLinks ?? {},
      }));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  const facts = [clip.publisher, clip.isbn && `ISBN ${clip.isbn}`, clip.audioSeconds && fmtLength(clip.audioSeconds), clip.published && clip.site === 'audible' && `Audiobook released ${clip.published}`].filter(Boolean).join(' · ');

  if (saved) {
    return (
      <div className="overlay">
        <div className="dialog" role="dialog" aria-modal="true" aria-label="Added to your library">
          <h2 className="pagetitle small2">{saved.created ? 'ADDED' : 'UPDATED'}</h2>
          <p style={{ margin: 0 }}>{saved.created ? `"${title.trim()}" is on your ${shelf === 'tbr' ? 'TBR' : 'Up Next'} shelf.` : `"${review?.existing?.title}" was already in your library.${saved.added.length ? ` Filled in: ${saved.added.join(', ')}.` : ' Nothing new was needed.'}`}</p>
          {saved.coverError && <div className="bcard warn" role="alert">The cover could not be downloaded ({saved.coverError}). You can add one from the Book Log.</div>}
          <div className="actions dialogbtns">
            <button type="button" className="btn on" onClick={() => onOpenBook(saved.bookId)}>Open the book</button>
            <button type="button" className="btn" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay clipoverlay" onKeyDown={(e) => e.key === 'Escape' && !busy && onClose()}>
      <div className="dialog wide clipdlg" role="dialog" aria-modal="true" aria-label="Add to library">
        <h2 className="pagetitle small2">ADD TO LIBRARY <span className="muted small">from {SITE_NAME[clip.site]}</span></h2>
        {!review && !error && <p className="muted">Checking your library...</p>}
        {review?.existing && (
          <div className="bcard clipdup" role="note">
            <b>Already in your library:</b> {review.existing.title}{review.existing.authors ? ` by ${review.existing.authors}` : ''}.
            <div className="seg listseg" role="group" aria-label="What to do">
              <button type="button" aria-pressed={!asNew} className={!asNew ? 'on' : ''} onClick={() => setAsNew(false)}>Fill in what is missing</button>
              <button type="button" aria-pressed={asNew} className={asNew ? 'on' : ''} onClick={() => setAsNew(true)}>Add as another book</button>
            </div>
            {!asNew && <span className="muted small">Only blank details are filled in; nothing you already entered is changed.</span>}
          </div>
        )}
        {review && (
          <div className="clipbody">
            <div className="clipcover">
              {clip.cover ? <img src={clip.cover} alt="Cover found on the page" /> : <div className="muted">No cover found</div>}
              {clip.cover && <label className="small"><input type="checkbox" checked={useCover} onChange={(e) => setUseCover(e.target.checked)} /> Use this cover</label>}
              {facts && <span className="muted small">{facts}</span>}
            </div>
            <div className="clipform">
              <label className="stack"><span className="lbl2">Title</span><input className="field" aria-label="Title" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
              <div className="stack"><span className="lbl2">Authors</span>
                <div className="chips">{authors.map((a, i) => (
                  <span key={`${a.name}${i}`} className="chip cliprow">{a.match?.name ?? a.name} <Badge match={a.match} /><button type="button" className="x" aria-label={`Remove ${a.name}`} onClick={() => setAuthors(authors.filter((_, j) => j !== i))}>&times;</button></span>
                ))}</div>
                <input className="field small" placeholder="+ Add another author" aria-label="Add an author" value={newAuthor} onChange={(e) => setNewAuthor(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && newAuthor.trim()) { setAuthors([...authors, { name: newAuthor.trim(), match: null }]); setNewAuthor(''); } }} />
              </div>
              <div className="clipgrid">
                <label className="stack"><span className="lbl2">Series {series.trim() && <Badge match={seriesId} />}</span><input className="field" aria-label="Series" value={series} onChange={(e) => { setSeries(e.target.value); if (seriesId && e.target.value !== review.series?.match?.name) setSeriesId(null); }} /></label>
                <label className="stack"><span className="lbl2">Position</span><input className="field" aria-label="Position in series" inputMode="decimal" value={position} onChange={(e) => setPosition(e.target.value)} /></label>
                <label className="stack"><span className="lbl2">Pages</span><input className="field" aria-label="Pages" inputMode="numeric" value={pages} onChange={(e) => setPages(e.target.value)} /></label>
                <label className="stack"><span className="lbl2">First published</span><input className="field" aria-label="First published" placeholder="2026-02-27" value={published} onChange={(e) => setPublished(e.target.value)} /></label>
                <label className="stack"><span className="lbl2">Heat level</span>
                  <select aria-label="Heat level" value={heat} onChange={(e) => setHeat(e.target.value)}><option value="">Not set</option>{[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}{clip.heatLabel && String(clip.heat) === String(n) ? ` (${clip.heatLabel})` : ''}</option>)}</select></label>
                {!filling && <label className="stack"><span className="lbl2">Add to</span>
                  <select aria-label="Add to" value={shelf} onChange={(e) => setShelf(e.target.value as 'tbr' | 'up_next')}><option value="tbr">TBR</option><option value="up_next">Up Next</option></select></label>}
              </div>
              {narrators.length > 0 && (
                <div className="stack"><span className="lbl2">Narrators</span>
                  <div className="chips">{narrators.map((a, i) => <span key={`${a.name}${i}`} className="chip cliprow">{a.match?.name ?? a.name} <Badge match={a.match} /><button type="button" className="x" aria-label={`Remove ${a.name}`} onClick={() => setNarrators(narrators.filter((_, j) => j !== i))}>&times;</button></span>)}</div>
                </div>
              )}
              <label className="stack"><span className="lbl2">Synopsis</span><textarea className="field" rows={4} aria-label="Synopsis" value={synopsis} onChange={(e) => setSynopsis(e.target.value)} /></label>
              {review.tags.length > 0 && (
                <div className="stack"><span className="lbl2">Tags <span className="muted small">click a tag to choose what it is; tags left as "skip" are not added</span></span>
                  <div className="chips cliptags">{review.tags.map((t) => {
                    const pick = picks[t.name] ?? 'skip';
                    return <button type="button" key={t.name} className={`chip cliptag ${pick === 'skip' ? 'skip' : 'on'}`} aria-label={`${t.name}: ${pick === 'skip' ? 'skip' : kindWord(pick)}`} onClick={() => cycle(t.name)}>
                      {t.name}{t.votes ? <span className="muted small"> {t.votes}</span> : null}<span className="clipkind">{pick === 'skip' ? 'skip' : kindWord(pick)}</span></button>;
                  })}</div>
                </div>
              )}
            </div>
          </div>
        )}
        {error && <div className="bcard warn" role="alert">{error}</div>}
        <div className="actions dialogbtns">
          <button type="button" className="btn on" disabled={!review || busy} onClick={() => void save()}>{busy ? 'Saving...' : filling ? 'Fill in missing details' : `Add to ${shelf === 'tbr' ? 'TBR' : 'Up Next'}`}</button>
          <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
