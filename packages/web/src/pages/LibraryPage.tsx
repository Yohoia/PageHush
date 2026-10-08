import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, Check, LoaderCircle, Plus, Undo2 } from 'lucide-react';
import {
  articleTopics,
  articles as fallbackArticles,
  getArticleDisplayStatus,
} from '@/data/articles';
import { ApiError, getArticle, listArticles, updateArticle, type ApiArticle } from '@/lib/api';

function formatReadingTime(content: string) {
  const normalized = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~\-[\]()!]/g, ' ')
    .trim();
  const cjk = normalized.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const latinWords = normalized
    .replace(/[\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  const units = cjk + latinWords;

  return `${Math.max(1, Math.ceil(units / 400))} 分钟阅读`;
}

function formatArticleDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCreateAction, setShowCreateAction] = useState(false);
  const [articles, setArticles] =
    useState<Array<ApiArticle | (typeof fallbackArticles)[number]>>(fallbackArticles);
  const [articlesLoading, setArticlesLoading] = useState(true);
  const [publishing, setPublishing] = useState<Set<string>>(() => new Set());
  const publishingRef = useRef(new Set<string>());
  const [recentlyPublished, setRecentlyPublished] = useState<Set<string>>(() => new Set());
  const feedbackTimersRef = useRef(new Map<string, number>());

  useEffect(() => {
    const timers = feedbackTimersRef.current;
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);
  const [publishErrors, setPublishErrors] = useState<Record<string, string>>({});
  const [publicationToast, setPublicationToast] = useState<{ id: number; message: string } | null>(
    null,
  );

  useEffect(() => {
    if (!publicationToast) return;
    const timer = window.setTimeout(() => setPublicationToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [publicationToast]);
  const topic = searchParams.get('topic') ?? '全部';
  const activeTopic = articleTopics.includes(topic) ? topic : '全部';

  useEffect(() => {
    let cancelled = false;
    setArticlesLoading(true);

    listArticles()
      .then((data) => {
        if (cancelled) return;
        setArticles(data);
      })
      .catch(() => {
        if (cancelled) return;
        setArticles(fallbackArticles);
      })
      .finally(() => {
        if (!cancelled) setArticlesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleArticles = useMemo(
    () =>
      activeTopic === '全部'
        ? articles
        : articles.filter((article) => article.topic === activeTopic),
    [activeTopic, articles],
  );

  useEffect(() => {
    const handleScroll = () => setShowCreateAction(window.scrollY > 280);

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const selectTopic = (nextTopic: string) => {
    setSearchParams(nextTopic === '全部' ? {} : { topic: nextTopic });
  };

  const isEmpty = !articlesLoading && visibleArticles.length === 0;

  const togglePublication = async (slug: string) => {
    if (publishingRef.current.has(slug)) return;
    publishingRef.current.add(slug);
    setPublishing(new Set(publishingRef.current));
    setPublishErrors((current) => ({ ...current, [slug]: '' }));
    try {
      // Read the latest record; publishing must not overwrite a newer edit.
      const latest = await getArticle(slug);
      const status = latest.status === 'published' ? 'draft' : 'published';
      if (status === 'published' && (!latest.title.trim() || !latest.content.trim())) {
        throw new Error('请先填写文章标题和正文');
      }
      const description =
        latest.description.trim() ||
        latest.content
          .replace(/[#>*_`[\]()!]/g, '')
          .trim()
          .slice(0, 500);
      const saved = await updateArticle(slug, {
        status,
        ...(status === 'published' ? { description, publishedAt: new Date().toISOString() } : {}),
      });
      setArticles((current) => current.map((article) => (article.slug === slug ? saved : article)));
      window.clearTimeout(feedbackTimersRef.current.get(slug));
      feedbackTimersRef.current.delete(slug);
      setRecentlyPublished((current) => {
        const next = new Set(current);
        if (saved.status === 'published') next.add(slug);
        else next.delete(slug);
        return next;
      });
      if (saved.status === 'published') {
        feedbackTimersRef.current.set(
          slug,
          window.setTimeout(() => {
            setRecentlyPublished((current) => {
              const next = new Set(current);
              next.delete(slug);
              return next;
            });
            feedbackTimersRef.current.delete(slug);
          }, 1800),
        );
      }
      setPublicationToast({
        id: Date.now(),
        message: saved.status === 'published' ? '文章当前已发布' : '文章已撤回发布',
      });
    } catch (error) {
      setPublishErrors((current) => ({
        ...current,
        [slug]:
          error instanceof Error && !(error instanceof ApiError)
            ? error.message
            : '操作失败，请重试',
      }));
    } finally {
      publishingRef.current.delete(slug);
      setPublishing(new Set(publishingRef.current));
    }
  };

  return (
    <section
      className={`page-wide article-library pt-4 ${isEmpty ? 'is-empty' : 'pb-32'}`}
      aria-busy={articlesLoading}
    >
      <AnimatePresence>
        {publicationToast ? (
          <motion.div
            key={publicationToast.id}
            className="article-publication-toast"
            role="status"
            style={{ x: '-50%' }}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <Check size={16} aria-hidden="true" />
            {publicationToast.message}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="article-controls">
        <p className="article-count" aria-live="polite">
          <strong>{String(visibleArticles.length).padStart(2, '0')}</strong>
          篇文章
        </p>

        <div className="article-topic-filters" role="group" aria-label="主题筛选">
          {articleTopics.map((item) => {
            const active = item === activeTopic;

            return (
              <button
                key={item}
                type="button"
                className="article-topic-filter"
                aria-pressed={active}
                onClick={() => selectTopic(item)}
              >
                {item}
              </button>
            );
          })}
        </div>
      </div>

      {isEmpty ? (
        <div className="article-empty-state" role="status">
          <img src="/illustrations/empty-articles.png" alt="" width="1536" height="1024" />
          <p>暂无文章</p>
        </div>
      ) : null}

      <div className="article-grid">
        <AnimatePresence initial={true} mode="popLayout">
          {visibleArticles.map((article, index) => (
            <motion.div
              key={article.slug}
              className="article-card-cell"
              layout="position"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{
                duration: 0.28,
                delay: index * 0.035,
                ease: 'easeOut',
              }}
            >
              <div className="article-card-link">
                <motion.article
                  className="article-card"
                  whileHover={{ y: -4 }}
                  whileTap={{ scale: 0.995 }}
                >
                  <Link
                    to={`/articles/${article.slug}`}
                    className="article-card-open-link"
                    aria-label={`进入文章：${article.title}`}
                  >
                    <span className="sr-only">{article.title}</span>
                  </Link>
                  <img
                    className="article-card-media"
                    src={article.cover ?? undefined}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="article-card-meta">
                    <span className="article-card-topic">{article.topic}</span>
                    <span
                      className="article-card-status"
                      data-status={getArticleDisplayStatus(article).status}
                    >
                      {getArticleDisplayStatus(article).label}
                    </span>
                  </div>
                  <h2 className="article-card-title">{article.title}</h2>
                  <p className="article-card-description">{article.description}</p>
                  <div className="article-card-tags">
                    {article.tags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                  <div className="article-card-spacer" aria-hidden="true" />
                  <div className="article-card-foot">
                    <span>
                      {formatArticleDate(article.publishedAt)} ·{' '}
                      {formatReadingTime(article.content)}
                    </span>
                    <button
                      type="button"
                      className="article-card-arrow"
                      data-publication-state={
                        recentlyPublished.has(article.slug) ? 'confirmed' : article.status
                      }
                      aria-label={`${article.status === 'published' ? '撤回发布' : '发布文章'}：${article.title}`}
                      title={article.status === 'published' ? '已发布，点击撤回发布' : '发布文章'}
                      disabled={publishing.has(article.slug)}
                      aria-busy={publishing.has(article.slug)}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void togglePublication(article.slug);
                      }}
                    >
                      {publishing.has(article.slug) ? (
                        <LoaderCircle
                          size={14}
                          className="animate-spin motion-reduce:animate-none"
                        />
                      ) : recentlyPublished.has(article.slug) ? (
                        <Check size={14} strokeWidth={1.8} />
                      ) : article.status === 'published' ? (
                        <Undo2 size={14} strokeWidth={1.8} />
                      ) : (
                        <ArrowUpRight size={14} strokeWidth={1.8} />
                      )}
                    </button>
                  </div>
                  {publishErrors[article.slug] ? (
                    <p className="article-card-publish-error" role="alert">
                      {publishErrors[article.slug]}
                    </p>
                  ) : null}
                </motion.article>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showCreateAction ? (
          <motion.div
            className="article-create-action"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <Link to="/editor" aria-label="新建文章">
              <Plus size={22} strokeWidth={1.8} aria-hidden="true" />
            </Link>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
