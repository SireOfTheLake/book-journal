import { Route, Routes, useResolvedPath } from 'react-router-dom';
import type { SheetView } from '../../domain/printPlan';
import BookLogPage from '../BookLogPage';
import BracketPage from '../BracketPage';
import CalendarPage from '../CalendarPage';
import ChallengePage from '../ChallengePage';
import MonthChartPage from '../MonthChartPage';
import SeriesPageContainer from '../series/SeriesPageContainer';
import TrackerPage from '../TrackerPage';
import PrintDashboard from './PrintDashboards';
import { LedgerPrint, QuotesPrint } from './ListPages';
import ChallengeTrackerSheet from './ChallengeTrackerSheet';


/** One printed page: the same page you see in the app, shown for one month, book, challenge or series. */
export default function SheetContent({ view }: { view: SheetView }) {
  const BASE = useResolvedPath('').pathname.replace(/\/$/, ''); // the address of the page this is shown on
  switch (view.kind) {
    case 'tracker': return <TrackerPage kind={view.tracker} />;
    case 'calendar': return <CalendarPage fixedMonth={view.month} />;
    case 'dashboardMonth': return <PrintDashboard month={view.month} />;
    case 'dashboardYear': return <PrintDashboard part={view.part} />;
    case 'monthChart': return <MonthChartPage />;
    case 'bracket': return <BracketPage />;
    case 'challenges': return <ChallengeTrackerSheet />;
    case 'ledger': return <LedgerPrint ids={view.ids} part={view.part} parts={view.parts} />;
    case 'quotes': return <QuotesPrint ids={view.ids} part={view.part} parts={view.parts} />;
    default: {
      // These pages read their book, challenge or series from the address, so they are given an address of their own.
      const path = view.kind === 'book' ? `book/${view.bookId}/${view.readId}` : view.kind === 'challenge' ? `challenge/${view.id}` : `series/${view.id}`;
      return (
        <Routes location={{ pathname: `${BASE}/${path}`, search: '', hash: '', state: null, key: path }}>
          <Route path="book/:bookId/:readId" element={<BookLogPage />} />
          <Route path="challenge/:id" element={<ChallengePage />} />
          <Route path="series/:seriesId" element={<SeriesPageContainer />} />
        </Routes>
      );
    }
  }
}
