import { Navigate, Route, Routes } from 'react-router';
import { HomeScreen } from './features/shell/home-screen';
import { ImportScreen } from './features/import';

/**
 * Route table (AGENTS.md §12.3). Screens for later milestones are added as
 * they land; unknown routes always redirect home.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/import" element={<ImportScreen />} />
      <Route path="/chat/:chatId" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
