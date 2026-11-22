import { Navigate, Route, Routes } from 'react-router';
import { ImportScreen } from './features/import';
import { ChatViewScreen } from './features/chat-view';
import { SearchScreen } from './features/search';
import { BookmarksScreen } from './features/bookmarks';
import { AppErrorBoundary, ChatsLayout } from './features/shell';

/**
 * Route table (AGENTS.md §12.3). Each route renders inside its own error
 * boundary; unknown routes redirect home. Screens for later milestones are
 * added as they land.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<ChatsLayout />}>
        <Route index element={null} />
        <Route path="/chat/:chatId" element={<ChatViewScreen />} />
      </Route>
      <Route
        path="/import"
        element={
          <AppErrorBoundary>
            <ImportScreen />
          </AppErrorBoundary>
        }
      />
      <Route
        path="/search"
        element={
          <AppErrorBoundary>
            <SearchScreen />
          </AppErrorBoundary>
        }
      />
      <Route
        path="/bookmarks"
        element={
          <AppErrorBoundary>
            <BookmarksScreen />
          </AppErrorBoundary>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
