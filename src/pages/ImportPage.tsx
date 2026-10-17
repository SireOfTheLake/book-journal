import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import BooksImport from './BooksImport';
import CharactersImport from './CharactersImport';
import CoversImport from './CoversImport';
import JournalImport from './JournalImport';

export default function ImportPage() {
  const [params] = useSearchParams();
  const first = params.get('tab');
  const [tab, setTab] = useState<'books' | 'characters' | 'journal' | 'covers'>(first === 'covers' || first === 'characters' || first === 'journal' ? first : 'books');
  return (
    <section>
      <h1 className="pagetitle">IMPORT <span className="muted small">from Notion, your journal pages, and covers from the web</span></h1>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'books'} className={tab === 'books' ? 'tab on' : 'tab'} onClick={() => setTab('books')}>Books</button>
        <button type="button" role="tab" aria-selected={tab === 'characters'} className={tab === 'characters' ? 'tab on' : 'tab'} onClick={() => setTab('characters')}>Characters</button>
        <button type="button" role="tab" aria-selected={tab === 'journal'} className={tab === 'journal' ? 'tab on' : 'tab'} onClick={() => setTab('journal')}>Journal pages</button>
        <button type="button" role="tab" aria-selected={tab === 'covers'} className={tab === 'covers' ? 'tab on' : 'tab'} onClick={() => setTab('covers')}>Covers</button>
      </div>
      {tab === 'books' ? <BooksImport /> : tab === 'characters' ? <CharactersImport /> : tab === 'journal' ? <JournalImport /> : <CoversImport />}
    </section>
  );
}
