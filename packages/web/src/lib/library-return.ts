import type { ApiArticle } from './api';
import type { articles } from '@/data/articles';

interface LibraryReturn {
  articles: Array<ApiArticle | (typeof articles)[number]>;
  url: string;
  slug: string;
  scrollY: number;
}

let previous: LibraryReturn | undefined;

export function rememberLibrary(value: LibraryReturn) {
  previous = value;
}

export function peekLibraryReturn(url?: string) {
  return !url || previous?.url === url ? previous : undefined;
}

export function clearLibraryReturn(url?: string) {
  if (!url || previous?.url === url) previous = undefined;
}
