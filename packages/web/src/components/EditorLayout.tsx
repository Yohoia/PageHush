import type { ReactNode } from 'react';

interface EditorLayoutProps {
  back: ReactNode;
  actions: ReactNode;
  headerBefore: ReactNode;
  title: ReactNode;
  headerAfter: ReactNode;
  toolbar: ReactNode;
  search: ReactNode;
  children: ReactNode;
}

export function EditorLayout({
  back,
  actions,
  headerBefore,
  title,
  headerAfter,
  toolbar,
  search,
  children,
}: EditorLayoutProps) {
  return (
    <>
      <header className="editor-topbar" aria-label="编辑工具与文章操作">
        {back}
        <div className="simple-editor-toolbar-stage">{toolbar}</div>
        {actions}
      </header>
      <div className="simple-editor-wrapper">
        {headerBefore}
        {title}
        {headerAfter}
        {search}
        <div className="simple-editor-content-stage">{children}</div>
      </div>
    </>
  );
}
