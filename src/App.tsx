import LocationsPage from './pages/LocationsPage';
import BookMergePage from './pages/BookMergePage';
import { Route, Routes } from 'react-router-dom';
import Shell from './ui/Shell';
import BookListPage from './pages/BookListPage';
import BookLogPage from './pages/BookLogPage';
import BracketPage from './pages/BracketPage';
import CalendarPage from './pages/CalendarPage';
import HomePage from './pages/HomePage';
import SettingsPage from './pages/SettingsPage';
import LibraryPage from './pages/LibraryPage';
import RandomizerPage from './pages/RandomizerPage';
import ChallengesPage from './pages/ChallengesPage';
import BankPage from './pages/BankPage';
import ChallengePage from './pages/ChallengePage';
import ReleasesPage from './pages/ReleasesPage';
import ShelfPage from './pages/ShelfPage';
import DashboardPage from './pages/DashboardPage';
import MonthChartPage from './pages/MonthChartPage';
import { AuthorPage, AuthorsPage, NarratorPage, NarratorsPage } from './pages/people/PeoplePages';
import CharacterPageContainer from './pages/characters/CharacterPageContainer';
import CharactersPage from './pages/characters/CharactersPage';
import SeriesLedgerPage from './pages/series/SeriesLedgerPage';
import { UniversePageContainer, UniversesPage } from './pages/universes/UniversePages';
import OverviewPage from './pages/journal/OverviewPage';
import SeriesPageContainer from './pages/series/SeriesPageContainer';
import LocationDetailPage from './pages/locations/LocationDetailPage';
import QuotesPage from './pages/QuotesPage';
import ImportPage from './pages/ImportPage';
import Placeholder from './pages/Placeholder';

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<HomePage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="shelf" element={<ShelfPage />} />
        <Route path="releases" element={<ReleasesPage />} />
        <Route path="series" element={<SeriesLedgerPage />} />
        <Route path="series/:seriesId" element={<SeriesPageContainer />} />
        <Route path="authors" element={<AuthorsPage />} />
        <Route path="authors/:authorId" element={<AuthorPage />} />
        <Route path="narrators" element={<NarratorsPage />} />
        <Route path="narrators/:narratorId" element={<NarratorPage />} />
        <Route path="characters" element={<CharactersPage />} />
        <Route path="characters/:characterId" element={<CharacterPageContainer />} />
        <Route path="universes" element={<UniversesPage />} />
        <Route path="quotes" element={<QuotesPage />} />
        <Route path="locations" element={<LocationsPage />} />
        <Route path="locations/:placeId" element={<LocationDetailPage />} />
        <Route path="universes/:universeId" element={<UniversePageContainer />} />
        <Route path="book/:bookId" element={<BookLogPage />} />
        <Route path="book/:bookId/merge/:otherId" element={<BookMergePage />} />
        <Route path="book/:bookId/:readId" element={<BookLogPage />} />
        <Route path="journal/overview" element={<OverviewPage />} />
        <Route path="journal/book-list" element={<BookListPage />} />
        <Route path="journal/calendar" element={<CalendarPage />} />
        <Route path="journal/month-chart" element={<MonthChartPage />} />
        <Route path="journal/bracket" element={<BracketPage />} />
        <Route path="journal/dashboard" element={<DashboardPage />} />
        <Route path="journal/challenges" element={<ChallengesPage />} />
        <Route path="journal/randomizer" element={<RandomizerPage />} />
        <Route path="journal/challenges/banks/:id" element={<BankPage />} />
        <Route path="journal/challenges/:id" element={<ChallengePage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Placeholder title="Not found" />} />
      </Route>
    </Routes>
  );
}
