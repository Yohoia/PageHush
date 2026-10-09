import { Link, useNavigate } from 'react-router';
import type { ApiArticle } from '@/lib/api';
import { handoffArticle } from '@/lib/article-handoff';
import { preloadEditorPage } from '@/lib/editor-route';
import { openWithCoverTransition } from '@/lib/cover-transition';
import type { articles } from '@/data/articles';

export function ArticleOpenLink({
  article,
  onOpen,
}: {
  article: ApiArticle | (typeof articles)[number];
  onOpen: () => void;
}) {
  const navigate = useNavigate();
  const prepare = () => {
    void preloadEditorPage().catch(() => undefined);
  };
  return (
    <Link
      to={`/articles/${article.slug}`}
      className="article-card-open-link"
      aria-label={`进入文章：${article.title}`}
      onPointerEnter={prepare}
      onFocus={prepare}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        prepare();
        const image =
          event.currentTarget
            .closest('.article-card')
            ?.querySelector<HTMLImageElement>('.article-card-media') ?? null;
        openWithCoverTransition(article.slug, image, () => {
          onOpen();
          if ('coverAssetId' in article) handoffArticle(article);
          void navigate(`/articles/${article.slug}`);
        });
      }}
    >
      <span className="sr-only">{article.title}</span>
    </Link>
  );
}
