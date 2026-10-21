import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useDb } from '../db/DbContext';
import { useSync } from '../sync/SyncContext';
import Nav from './Nav';
import AddBook from './screens/AddBook';
import BookLog from './screens/BookLog';
import Character from './screens/Character';
import Home from './screens/Home';
import People from './screens/People';
import Search from './screens/Search';
import Setup from './screens/Setup';
import SyncScreen from './screens/SyncScreen';

// Makes the app as tall as the whole screen. A Home Screen app on iPhone can report a window a little shorter than the screen, which left a gap under the bottom bar.
function useFullHeight() {
  useEffect(() => {
    const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
    const set = () => {
      let h = window.innerHeight;
      if (standalone) {
        const portrait = window.innerHeight >= window.innerWidth;
        const s = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
        if (s > h && s - h < 120) h = s;
      }
      document.documentElement.style.setProperty('--app-h', `${h}px`);
    };
    set();
    window.addEventListener('resize', set); window.addEventListener('orientationchange', set);
    return () => { window.removeEventListener('resize', set); window.removeEventListener('orientationchange', set); };
  }, []);
}

function Shell() {
  return (
    <div className="ph-app">
      <main className="ph-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/add" element={<AddBook />} />
          <Route path="/book/:bookId" element={<BookLog />} />
          <Route path="/book/:bookId/:readId" element={<BookLog />} />
          <Route path="/people" element={<People />} />
          <Route path="/character/:characterId" element={<Character />} />
          <Route path="/sync" element={<SyncScreen />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <Nav />
    </div>
  );
}

export default function App() {
  useFullHeight();
  const db = useDb();
  const sync = useSync();
  const [hasBooks, setHasBooks] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    db.select('SELECT 1 AS x FROM book LIMIT 1').then((r) => { if (live) setHasBooks(r.length > 0); }, () => { if (live) setHasBooks(false); });
    return () => { live = false; };
  }, [db, sync.dataVersion, sync.state]);

  if (hasBooks === null) return <div className="ph-boot"><h1>BOOK JOURNAL</h1></div>;
  // Nothing on the phone yet: set up, then wait for the first sync.
  if (!hasBooks && (sync.state === 'off' || sync.state === 'signed_out')) return <div className="ph-app"><main className="ph-main"><Setup /></main></div>;
  if (!hasBooks && (sync.state === 'idle' || sync.state === 'syncing') && !sync.lastSyncedAt) {
    return <div className="ph-boot"><h1>BOOK JOURNAL</h1><p>Bringing your journal onto this phone...</p><p className="ph-muted ph-small">The first time takes a minute. Keep this screen open.</p><div className="ph-progress" style={{ maxWidth: 260, margin: '16px auto' }}><i style={{ width: '40%' }} /></div></div>;
  }
  if (!hasBooks && sync.state === 'problem') return <div className="ph-app"><main className="ph-main"><div className="ph-err" role="alert">{sync.message}</div><button type="button" className="ph-btn" onClick={() => void sync.syncNow()}>Try again</button></main></div>;
  return <Shell />;
}
