import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, Plus } from 'lucide-react';
import {
  articleTopics,
  articles as fallbackArticles,
  getArticleDisplayStatus,
} from '@/data/articles';
import { listArticles, type ApiArticle } from '@/lib/api';

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
  const [articles, setArticles] = useState<ApiArticle[] | typeof fallbackArticles>(
    fallbackArticles,
  );
  const [articlesLoading, setArticlesLoading] = useState(true);
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
    [activeTopic],
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

  return (
    <section className="page-wide pb-32 pt-4">
      {articlesLoading ? (
        <div className="article-loading" role="status">
          正在加载文章…
        </div>
      ) : null}

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
              <Link
                to={`/articles/${article.slug}`}
                className="article-card-link"
                aria-label={`进入文章：${article.title}`}
              >
                <motion.article
                  className="article-card"
                  whileHover={{ y: -4 }}
                  whileTap={{ scale: 0.995 }}
                >
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
                    <span className="article-card-arrow" aria-hidden="true">
                      <ArrowUpRight size={14} strokeWidth={1.8} />
                    </span>
                  </div>
                </motion.article>
              </Link>
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
