import { useEffect, useState } from 'react';
import QuickSearch from './QuickSearch';

// The header search. Clicking it, or pressing Ctrl+K anywhere, opens the quick search window.
export default function SearchBox({ onAddBook }: { onAddBook: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  return (
    <div className="searchwrap">
      <button type="button" className="search searchbtn" aria-label="Search" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span>Search everything</span><kbd>Ctrl K</kbd>
      </button>
      {open && <QuickSearch onClose={() => setOpen(false)} onAddBook={onAddBook} />}
    </div>
  );
}
