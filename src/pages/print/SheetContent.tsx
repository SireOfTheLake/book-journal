import { Route, Routes } from 'react-router-dom';
import type { SheetView } from '../../domain/printPlan';
import BookLogPage from '../BookLogPage';
import BracketPage from '../BracketPage';
import CalendarPage from '../CalendarPage';
import ChallengePage from '../ChallengePage';
import DashboardPage from '../DashboardPage';
import MonthChartPage from '../MonthChartPage';
import SeriesLedgerPage from '../series/SeriesLedgerPage';
import SeriesPageContainer from '../series/SeriesPageContainer';
import TrackerPage from '../TrackerPage';
import ChallengeTrackerSheet from './ChallengeTrackerSheet';

const BASE = '/journal/print';

/** One printed page: the same page you see in the app, shown for one month, book, challenge or series. */
export default function SheetContent({ view }: { view: SheetView }) {
  switch (view.kind) {
    case 'tracker': return <TrackerPage kind={view.tracker} />;
    case 'calendar': return <CalendarPage fixedMonth={view.month} />;
    case 'dashboardMonth': return <DashboardPage fixed={{ tab: 'monthly', month: view.month }} />;
    case 'dashboardYear': return <DashboardPage fixed={{ tab: 'yearly' }} />;
    case 'monthChart': return <MonthChartPage />;
    case 'bracket': return <BracketPage />;
    case 'challenges': return <ChallengeTrackerSheet />;
    case 'ledger': return <SeriesLedgerPage />;
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
