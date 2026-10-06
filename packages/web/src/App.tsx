import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { EditorPage } from './pages/EditorPage';
import { LibraryPage } from './pages/LibraryPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<LibraryPage />} />
        <Route path="editor" element={<EditorPage />} />
        <Route path="library" element={<Navigate to="/" replace />} />
        <Route path="settings" element={<Navigate to="/" replace />} />
        <Route path="articles/:articleId" element={<EditorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
