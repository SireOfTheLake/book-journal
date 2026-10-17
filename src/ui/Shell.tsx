import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { createContext, useContext, useEffect, useState } from 'react';
import { useDb } from '../db/DbContext';
import { ensureJournalYear, getSavedYear, listJournalYears, saveYear } from '../repo/goals';
import QuickAdd from './QuickAdd';
import SearchBox from './SearchBox';
import QuickLog from './QuickLog';
import QuickSeries from './QuickSeries';
import { Icon } from './icons';
import UpdateToast from '../update/UpdateToast';
import ChangelogModal, { useChangelog } from '../changelog/ChangelogModal';

const YearContext = createContext<number>(new Date().getFullYear());
export const useJournalYear = () => useContext(YearContext);

const link = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav cur' : 'nav');

export default function Shell() {
  const nav = useNavigate();
  const clog = useChangelog();
  const db = useDb();
  const now = new Date().getFullYear();
  const todayIso = `${now}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
  const [year, setYear] = useState(now);
  const [years, setYears] = useState<number[]>([now]);
  const [newYear, setNewYear] = useState<string | null>(null); // text while adding a year
  // The years come from your data, and the year you were last on is remembered.
  useEffect(() => {
    let live = true;
    Promise.all([listJournalYears(db, todayIso), getSavedYear(db)]).then(([list, saved]) => {
      if (!live) return;
      setYears(list);
      if (saved !== null && list.includes(saved)) setYear(saved);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [db, todayIso]);
  const choose = (y: number) => { setYear(y); saveYear(db, y).catch(() => undefined); };
  const addYear = async () => {
    const y = Number((newYear ?? '').trim());
    setNewYear(null);
    if (!Number.isInteger(y) || y < 1900 || y > 2200) return;
    await ensureJournalYear(db, y);
    setYears(await listJournalYears(db, todayIso).then((l) => (l.includes(y) ? l : [...l, y].sort((a, b) => b - a))));
    choose(y);
  };
  const [adding, setAdding] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addingSeries, setAddingSeries] = useState(false);
  const [logging, setLogging] = useState(false);
  const [refresh, setRefresh] = useState(0); // changes after a quick log, so the page you are on shows the new entry

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">BOOK JOURNAL</div>
        <button className="btn on" type="button" onClick={() => setAdding(true)}>+ New book</button>
        <div className="quickrow">
          <button className="btn quiet" type="button" onClick={() => setAddingSeries(true)}>New series</button>
          <button className="btn quiet" type="button" onClick={() => setLogging(true)}>Daily log</button>
        </div>
        <NavLink to="/" end className={link}><Icon name="home" />Home</NavLink>
        <span className="lbl">Library</span>
        <NavLink to="/library" className={link}><Icon name="books" />All books</NavLink>
        <NavLink to="/shelf" className={link}><Icon name="shelf" />TBR &amp; Up Next</NavLink>
        <NavLink to="/releases" className={link}><Icon name="releases" />Upcoming releases</NavLink>
        <NavLink to="/series" className={link}><Icon name="series" />Series</NavLink>
        <NavLink to="/authors" className={link}><Icon name="authors" />Authors</NavLink>
        <NavLink to="/narrators" className={link}><Icon name="narrators" />Narrators</NavLink>
        <NavLink to="/characters" className={link}><Icon name="characters" />Characters</NavLink>
        <NavLink to="/universes" className={link}><Icon name="universes" />Universes</NavLink>
        <NavLink to="/locations" className={link}><Icon name="pin" />Locations</NavLink>
        <div className="grouphead">
          <span className="lbl">Journal</span>
          {newYear === null ? (
            <select aria-label="Journal year" value={year} onChange={(e) => (e.target.value === 'add' ? setNewYear('') : choose(Number(e.target.value)))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
              <option value="add">Add a year...</option>
            </select>
          ) : (
            <input className="field yearinput" autoFocus type="number" aria-label="New journal year" placeholder="Year" value={newYear} onChange={(e) => setNewYear(e.target.value)}
              onBlur={addYear} onKeyDown={(e) => { if (e.key === 'Enter') addYear(); if (e.key === 'Escape') setNewYear(null); }} />
          )}
        </div>
        <NavLink to="/journal/book-list" className={link}><Icon name="list" />Book list</NavLink>
        <NavLink to="/journal/calendar" className={link}><Icon name="calendar" />Calendar</NavLink>
        <NavLink to="/journal/month-chart" className={link}><Icon name="grid" />Month chart</NavLink>
        <NavLink to="/journal/bracket" className={link}><Icon name="bracket" />Book bracket</NavLink>
        <NavLink to="/journal/overview" className={link}><Icon name="overview" />Overview and goals</NavLink>
        <NavLink to="/journal/dashboard" className={link}><Icon name="dashboard" />Dashboard</NavLink>
        <NavLink to="/journal/challenges" className={link}><Icon name="challenges" />Challenges</NavLink>
        <NavLink to="/journal/randomizer" className={link}><Icon name="dice" />Prompt randomizer</NavLink>
        <span className="spacer" />
        <button type="button" className="nav navbtn" onClick={clog.show}><Icon name="sparkle" />What's new{clog.unseen && <span className="newdot" role="img" aria-label="new" />}</button>
        <NavLink to="/import" className={link}><Icon name="import" />Import</NavLink>
        <NavLink to="/settings" className={link}><Icon name="settings" />Settings and themes</NavLink>
      </nav>
      <main className="main">
        <header className="topbar">
          <button className="ib" type="button" aria-label="Back" onClick={() => nav(-1)}>&#8249;</button>
          <button className="ib" type="button" aria-label="Forward" onClick={() => nav(1)}>&#8250;</button>
          <span className="spacer" />
          <SearchBox onAddBook={(t) => { setAddTitle(t); setAdding(true); }} />
        </header>
        <YearContext.Provider value={year}>
          <div className="content" key={refresh}><Outlet /></div>
        </YearContext.Provider>
        <UpdateToast />
      {clog.open && <ChangelogModal onClose={clog.close} />}
      </main>
      {adding && <QuickAdd initialTitle={addTitle} onClose={() => { setAdding(false); setAddTitle(''); }} />}
      {addingSeries && <QuickSeries onClose={() => setAddingSeries(false)} />}
      {logging && <QuickLog onClose={() => setLogging(false)} onSaved={() => setRefresh((n) => n + 1)} />}
    </div>
  );
}
