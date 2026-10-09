import type { EditorPage } from '../pages/EditorPage';

let pending: Promise<{ EditorPage: typeof EditorPage }> | undefined;

export function preloadEditorPage() {
  pending ??= import('../pages/EditorPage').catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
  return pending;
}
