import { Navigate, Route, Routes } from 'react-router';
import { HomeScreen } from './features/shell/home-screen';

/**
 * Route table (AGENTS.md §12.3). Screens for later milestones are added as
 * they land; unknown routes always redirect home.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
