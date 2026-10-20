import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import BookCsvImport from './BookCsvImport';
import BooksImport from './BooksImport';
import CharactersImport from './CharactersImport';
import CoversImport from './CoversImport';
import JournalImport from './JournalImport';

export default function ImportPage() {
  const [params] = useSearchParams();
  const first = params.get('tab');
  const [tab, setTab] = useState<'books' | 'spreadsheet' | 'characters' | 'journal' | 'covers'>(first === 'covers' || first === 'spreadsheet' || first === 'characters' || first === 'journal' ? first : 'books');
  return (
    <section>
      <h1 className="pagetitle">IMPORT <span className="muted small">from Notion, a spreadsheet of books, your journal pages, and covers from the web</span></h1>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'books'} className={tab === 'books' ? 'tab on' : 'tab'} onClick={() => setTab('books')}>Books</button>
        <button type="button" role="tab" aria-selected={tab === 'spreadsheet'} className={tab === 'spreadsheet' ? 'tab on' : 'tab'} onClick={() => setTab('spreadsheet')}>Book list (CSV)</button>
        <button type="button" role="tab" aria-selected={tab === 'characters'} className={tab === 'characters' ? 'tab on' : 'tab'} onClick={() => setTab('characters')}>Characters</button>
        <button type="button" role="tab" aria-selected={tab === 'journal'} className={tab === 'journal' ? 'tab on' : 'tab'} onClick={() => setTab('journal')}>Journal pages</button>
        <button type="button" role="tab" aria-selected={tab === 'covers'} className={tab === 'covers' ? 'tab on' : 'tab'} onClick={() => setTab('covers')}>Covers</button>
      </div>
      {tab === 'books' ? <BooksImport /> : tab === 'spreadsheet' ? <BookCsvImport /> : tab === 'characters' ? <CharactersImport /> : tab === 'journal' ? <JournalImport /> : <CoversImport />}
    </section>
  );
}
