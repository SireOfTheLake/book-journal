import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb } from '../../db/DbContext';
import { createBook } from '../../repo/books';
import { createRead, ensurePlannedRead } from '../../repo/bookLog';
import { createSeries } from '../../repo/series';
import { bestMatch } from '../../domain/nameMatch';
import { urlToDataUrl } from '../../ui/imageFile';
import { fileToDataUrl } from '../../ui/imageFile';
import { Seg, useLoad } from '../kit';
import { setPhoneCover } from '../phoneCover';

type Where = 'tbr' | 'up_next' | 'reading';

export default function AddBook() {
  const db = useDb();
  const nav = useNavigate();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [series, setSeries] = useState('');
  const [number, setNumber] = useState('');
  const [where, setWhere] = useState<Where>('tbr');
  const [cover, setCover] = useState<{ dataUrl: string; label: string } | null>(null);
  const [linking, setLinking] = useState(false);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const lists = useLoad(async () => ({
    authors: await db.select<{ id: string; name: string; n: number }>(`SELECT a.id AS id, a.name AS name, (SELECT count(*) FROM book_author ba JOIN book b ON b.id = ba.book_id AND b.deleted_at IS NULL WHERE ba.author_id = a.id AND ba.deleted_at IS NULL) AS n FROM author a WHERE a.deleted_at IS NULL`),
    series: await db.select<{ id: string; title: string; n: number }>(`SELECT s.id AS id, s.title AS title, (SELECT count(*) FROM book b WHERE b.series_id = s.id AND b.deleted_at IS NULL) AS n FROM series s WHERE s.deleted_at IS NULL`),
  }), [db]);

  const authorMatch = author.trim() && lists.data ? lists.data.authors.find((a) => a.name === bestMatch(lists.data!.authors.map((x) => x.name), author.trim())) ?? null : null;
  const seriesMatch = series.trim() && lists.data ? lists.data.series.find((s) => s.title === bestMatch(lists.data!.series.map((x) => x.title), series.trim())) ?? null : null;

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    try { const img = await fileToDataUrl(f, 700); setCover({ dataUrl: img.dataUrl, label: 'Photo chosen' }); setError(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const useLink = async () => {
    try { const img = await urlToDataUrl(link, 700); setCover({ dataUrl: img.dataUrl, label: 'Picture from the link' }); setLinking(false); setError(null); }
    catch (e) { setError(`${e instanceof Error ? e.message : String(e)} Some sites do not allow this from a phone. Saving the picture and choosing it as a photo always works.`); }
  };

  const save = async () => {
    if (!title.trim()) { setError('A book needs a title.'); return; }
    setBusy(true);
    try {
      let seriesId: string | null = null;
      if (series.trim()) seriesId = seriesMatch ? seriesMatch.id : await createSeries(db, series.trim());
      const pos = number.trim() ? Number(number) : null;
      if (pos !== null && Number.isNaN(pos)) throw new Error('The series number should be a number, like 2 or 1.5.');
      const bookId = await createBook(db, { title, authors: author.trim() ? [authorMatch ? authorMatch.name : author.trim()] : [], seriesId, seriesPosition: pos, shelf: where === 'reading' ? null : where });
      if (where === 'up_next') await ensurePlannedRead(db, bookId);
      let readId: string | null = null;
      if (where === 'reading') readId = await createRead(db, bookId, 'reading');
      if (cover) await setPhoneCover(db, bookId, { dataUrl: cover.dataUrl });
      nav(`/book/${bookId}${readId ? `/${readId}` : ''}`, { replace: true });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };

  return (
    <>
      <div className="ph-top"><h1>ADD A BOOK</h1><button type="button" className="ph-btn" style={{ border: 0 }} onClick={() => nav(-1)}>Cancel</button></div>
      {error && <div className="ph-err" role="alert">{error}</div>}

      <label className="ph-field" style={{ display: 'block' }}><span className="ph-label">Title</span>
        <input className="ph-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" /></label>

      <label className="ph-field" style={{ display: 'block' }}><span className="ph-label">Author</span>
        <input className="ph-input" value={author} onChange={(e) => setAuthor(e.target.value)} aria-label="Author" style={authorMatch ? { borderColor: 'var(--accent)' } : undefined} /></label>
      {author.trim() && lists.data && (authorMatch
        ? <div className="ph-note" role="status">Existing author{authorMatch.name !== author.trim() ? `: ${authorMatch.name}` : ''} &middot; {authorMatch.n} book{authorMatch.n === 1 ? '' : 's'} in your library</div>
        : <div className="ph-note new" role="status">New author: it will be created</div>)}

      <div className="ph-row">
        <div>
          <label className="ph-field" style={{ display: 'block' }}><span className="ph-label">Series</span>
            <input className="ph-input" value={series} onChange={(e) => setSeries(e.target.value)} aria-label="Series" /></label>
          {series.trim() && lists.data && (seriesMatch
            ? <div className="ph-note" role="status">Existing series{seriesMatch.title !== series.trim() ? `: ${seriesMatch.title}` : ''} &middot; {seriesMatch.n} book{seriesMatch.n === 1 ? '' : 's'}</div>
            : <div className="ph-note new" role="status">New series: it will be created</div>)}
        </div>
        <label className="ph-field" style={{ display: 'block', maxWidth: 96 }}><span className="ph-label">Number</span>
          <input className="ph-input" inputMode="decimal" value={number} onChange={(e) => setNumber(e.target.value)} aria-label="Series number" /></label>
      </div>

      <div className="ph-field"><span className="ph-label">Put it on</span>
        <Seg<Where> label="Put it on" value={where} options={[{ value: 'tbr', label: 'TBR' }, { value: 'up_next', label: 'Up Next' }, { value: 'reading', label: 'Reading' }]} onChange={(v) => v && setWhere(v)} />
      </div>

      <div className="ph-field"><span className="ph-label">Cover</span>
        <div className="ph-seg">
          <button type="button" onClick={() => file.current?.click()}>Take or choose a photo</button>
          <button type="button" onClick={() => setLinking((v) => !v)}>Paste a link</button>
        </div>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ''; }} />
        {linking && (
          <div style={{ marginTop: 8 }}>
            <input className="ph-input" placeholder="https://..." value={link} onChange={(e) => setLink(e.target.value)} aria-label="Cover link" />
            <button type="button" className="ph-btn" style={{ marginTop: 8, width: '100%' }} onClick={() => void useLink()}>Use this picture</button>
          </div>
        )}
        {cover && <div className="ph-note" role="status">{cover.label} &middot; <button type="button" style={{ background: 'none', border: 0, color: 'var(--accent-text)', padding: 0 }} onClick={() => setCover(null)}>remove</button></div>}
      </div>

      <button type="button" className="ph-btn primary" style={{ marginTop: 20 }} disabled={busy} onClick={() => void save()}>Add to my library</button>
      <p className="ph-note" style={{ textAlign: 'center' }}>You can fill in genres, tropes and the rest on the book&rsquo;s page.</p>
    </>
  );
}
