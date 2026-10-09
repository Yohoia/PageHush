import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { LibraryPage } from './pages/LibraryPage';
import { preloadEditorPage } from './lib/editor-route';
import './styles/article-transition.css';

const EditorPage = lazy(async () => {
  const module = await preloadEditorPage();
  return { default: module.EditorPage };
});

function EditorRouteFallback() {
  return (
    <div className="grid min-h-dvh place-items-center text-sm text-muted" role="status">
      正在打开编辑器…
    </div>
  );
}

function EditorRoute() {
  const { articleSlug } = useParams();
  return <EditorPage key={articleSlug ?? 'new'} />;
}

export function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<AppShell />}>
        <Route index element={<LibraryPage />} />
        <Route
          path="editor"
          element={
            <Suspense fallback={<EditorRouteFallback />}>
              <EditorRoute />
            </Suspense>
          }
        />
        <Route path="library" element={<Navigate to="/" replace />} />
        <Route path="settings" element={<Navigate to="/" replace />} />
        <Route
          path="articles/:articleSlug"
          element={
            <Suspense fallback={<EditorRouteFallback />}>
              <EditorRoute />
            </Suspense>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
