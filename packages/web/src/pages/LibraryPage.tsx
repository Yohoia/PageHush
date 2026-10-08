import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpRight, Plus } from 'lucide-react';
import { articleCategories, articles, getArticleDisplayStatus } from '@/data/articles';

export function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showCreateAction, setShowCreateAction] = useState(false);
  const category = searchParams.get('category') ?? '全部';
  const activeCategory = articleCategories.includes(category) ? category : '全部';

  const visibleArticles = useMemo(
    () =>
      activeCategory === '全部'
        ? articles
        : articles.filter((article) => article.category === activeCategory),
    [activeCategory],
  );

  useEffect(() => {
    const handleScroll = () => setShowCreateAction(window.scrollY > 280);

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const selectCategory = (nextCategory: string) => {
    setSearchParams(nextCategory === '全部' ? {} : { category: nextCategory });
  };

  return (
    <section className="page-wide pb-32 pt-8">
      <div className="article-controls">
        <p className="article-count" aria-live="polite">
          <strong>{String(visibleArticles.length).padStart(2, '0')}</strong>
          篇文章
        </p>

        <div className="article-category-filters" role="group" aria-label="分类筛选">
          {articleCategories.map((item) => {
            const active = item === activeCategory;

            return (
              <button
                key={item}
                type="button"
                className="article-category-filter"
                aria-pressed={active}
                onClick={() => selectCategory(item)}
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
              key={article.id}
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
                to={`/articles/${article.id}`}
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
                    src={article.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="article-card-meta">
                    <span className="article-card-category">{article.category}</span>
                    <span
                      className="article-card-status"
                      data-status={getArticleDisplayStatus(article).status}
                    >
                      {getArticleDisplayStatus(article).label}
                    </span>
                  </div>
                  <h2 className="article-card-title">{article.title}</h2>
                  <p className="article-card-excerpt">{article.excerpt}</p>
                  <div className="article-card-tags">
                    {article.tags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                  <div className="article-card-spacer" aria-hidden="true" />
                  <div className="article-card-foot">
                    <span>
                      {article.date} · {article.readingTime}
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
