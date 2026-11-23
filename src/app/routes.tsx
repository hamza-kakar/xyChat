import { Navigate, Route, Routes } from 'react-router';
import { ImportScreen } from './features/import';
import { ChatViewScreen } from './features/chat-view';
import { SearchScreen } from './features/search';
import { BookmarksScreen } from './features/bookmarks';
import { MediaScreen } from './features/media';
import { SettingsScreen } from './features/settings';
import { ChatInfoScreen } from './features/chat-info';
import { AppErrorBoundary, ChatsLayout } from './features/shell';

/**
 * Route table. Each route renders inside its own error
 * boundary; unknown routes redirect home.
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
        path="/chat/:chatId/media"
        element={
          <AppErrorBoundary>
            <MediaScreen />
          </AppErrorBoundary>
        }
      />
      <Route
        path="/chat/:chatId/info"
        element={
          <AppErrorBoundary>
            <ChatInfoScreen />
          </AppErrorBoundary>
        }
      />
      <Route
        path="/settings"
        element={
          <AppErrorBoundary>
            <SettingsScreen />
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
