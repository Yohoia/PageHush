import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { LibraryPage } from './pages/LibraryPage';

const EditorPage = lazy(async () => {
  const module = await import('./pages/EditorPage');
  return { default: module.EditorPage };
});

function EditorRouteFallback() {
  return (
    <div className="grid min-h-dvh place-items-center text-sm text-muted" role="status">
      正在打开编辑器…
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<LibraryPage />} />
        <Route
          path="editor"
          element={
            <Suspense fallback={<EditorRouteFallback />}>
              <EditorPage />
            </Suspense>
          }
        />
        <Route path="library" element={<Navigate to="/" replace />} />
        <Route path="settings" element={<Navigate to="/" replace />} />
        <Route
          path="articles/:articleId"
          element={
            <Suspense fallback={<EditorRouteFallback />}>
              <EditorPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
