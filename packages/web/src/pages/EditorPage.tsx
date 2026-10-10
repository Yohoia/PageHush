import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Editor } from '@tiptap/react';
import { ArrowLeft, Images } from 'lucide-react';
import { EditorLayout } from '@/components/EditorLayout';
import { ArticleActions } from '@/components/ArticleActions';
import { ArticleToc, type ArticleTocVariant } from '@/components/ArticleToc';
import { useEditorFullscreen } from '@/hooks/use-editor-fullscreen';
import { useCoverUpload } from '@/hooks/use-cover-upload';
import { useArticleSave } from '@/hooks/use-article-save';
import { SimpleEditor } from '@/components/tiptap-templates/simple/simple-editor';
import { articleTopics, articles, defaultArticleContent, MAX_ARTICLE_TAGS } from '@/data/articles';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { articleIdFromShortId, countReadingUnits } from '@pagehush/shared';
import { TopicPicker } from '@/components/taxonomy/topic-picker';
import { TagPicker } from '@/components/taxonomy/tag-picker';
import { articlePath } from '@/lib/article-address';
import { motion } from 'motion/react';
import { clearArticleHandoff, getArticleHandoff } from '@/lib/article-handoff';
import { DEFAULT_ARTICLE_COVER } from '@/lib/article-cover';
import {
  deleteTopic as deleteTopicRequest,
  getArticle,
  listTopics,
  type ApiArticle,
} from '@/lib/api';

const newArticle = {
  title: '',
  topic: '学习',
  publishedAt: new Date().toLocaleDateString('sv-SE'),
  tags: [] as string[],
};

export function EditorPage() {
  const { articleSlug: legacySlug, articleKey } = useParams();
  const decodedId = articleKey ? articleIdFromShortId(articleKey) : null;
  const articleSlug = legacySlug ?? decodedId ?? articleKey;
  const location = useLocation();
  const navigate = useNavigate();
  const canonicalizeAddress = useEffectEvent((data: ApiArticle) => {
    const path = articlePath(data);
    if (!legacySlug || !path.startsWith('/a/')) return false;
    navigate(path + location.search + location.hash, {
      replace: true,
      state: location.state,
    });
    return true;
  });
  const [searchParams] = useSearchParams();
  const tocParam = searchParams.get('toc');
  const compactParam = searchParams.get('tocCompact');
  const compactVariant =
    compactParam === 'edge' ||
    compactParam === 'footer' ||
    compactParam === 'scrub' ||
    compactParam === 'stack'
      ? compactParam
      : undefined;
  const tocVariant: ArticleTocVariant | 'off' =
    tocParam === 'b' ||
    tocParam === 'c' ||
    tocParam === 'd' ||
    tocParam === 'e' ||
    tocParam === 'f' ||
    tocParam === 'g'
      ? tocParam
      : tocParam === 'off'
        ? 'off'
        : 'a';
  const selectedArticle = useMemo(
    () => articles.find((article) => article.slug === articleSlug),
    [articleSlug],
  );
  const incomingArticle = useMemo(() => getArticleHandoff(articleSlug), [articleSlug]);
  const article = incomingArticle ?? selectedArticle ?? newArticle;
  const fallbackContent =
    incomingArticle?.content ?? selectedArticle?.content ?? defaultArticleContent;
  const initialContentRef = useRef(fallbackContent);

  const [articleLoading, setArticleLoading] = useState(Boolean(articleSlug));
  const [articleError, setArticleError] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState(fallbackContent);
  const [editorContentVersion, setEditorContentVersion] = useState(0);
  const {
    coverInputId,
    cover,
    setCover,
    coverAssetId,
    setCoverAssetId,
    coverError,
    handleCoverChange,
  } = useCoverUpload(
    incomingArticle?.cover ?? selectedArticle?.cover ?? null,
    incomingArticle?.coverAssetId ?? null,
  );

  const [title, setTitle] = useState(article.title);
  const [topic, setTopic] = useState(article.topic ?? '');
  const [tags, setTags] = useState(article.tags);
  const [characterCount, setCharacterCount] = useState(() => countReadingUnits(fallbackContent));
  const {
    rootRef,
    isFullscreen,
    changeFullscreen,
    toggleFullscreen: toggleEditorFullscreen,
  } = useEditorFullscreen();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const [topicOptions, setTopicOptions] = useState(() =>
    articleTopics
      .filter((item) => item !== '全部')
      .map((name) => ({ id: undefined as string | undefined, name })),
  );

  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);

  const supportsFieldSizing = () =>
    typeof CSS !== 'undefined' && CSS.supports('field-sizing: content');

  const resizeTitleInput = useCallback(() => {
    const input = titleInputRef.current;
    if (!input) return;

    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }, []);

  useLayoutEffect(() => {
    if (supportsFieldSizing()) return;

    resizeTitleInput();
  }, [isFullscreen, resizeTitleInput, title]);

  useEffect(() => {
    if (supportsFieldSizing()) return;

    const handleResize = () => resizeTitleInput();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [resizeTitleInput]);

  useEffect(() => {
    if (!articleSlug) return;

    if (articleKey && !decodedId) {
      setArticleError('文章地址无效，请检查链接后重试');
      setArticleLoading(false);
      return;
    }

    let cancelled = false;
    setArticleLoading(true);
    setArticleError(null);

    getArticle(articleSlug)
      .then((data) => {
        if (cancelled) return;

        if (canonicalizeAddress(data)) return;

        setRemoteArticle(data);
        setTitle(data.title);
        setTopic(data.topic ?? '');
        setTags(data.tags);
        setCharacterCount(countReadingUnits(data.content));
        if (data.content !== initialContentRef.current) {
          initialContentRef.current = data.content;
          setEditorContent(data.content);
          setEditorContentVersion((version) => version + 1);
        }
        setCover(data.cover);
        setCoverAssetId(data.coverAssetId);
      })
      .catch(() => {
        if (cancelled) return;
        setArticleError('文章加载失败，请刷新后重试');
      })
      .finally(() => {
        if (!cancelled) {
          clearArticleHandoff(articleSlug);
          setArticleLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [articleSlug, articleKey, decodedId]);

  useEffect(() => {
    let cancelled = false;

    listTopics()
      .then((data) => {
        if (cancelled) return;
        setTopicOptions(data.map((topic) => ({ id: topic.id, name: topic.name })));
      })
      .catch(() => {
        // API 不可用时保留本地主题作为离线兜底。
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      changeFullscreen(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [changeFullscreen]);

  const handleEditorUpdate = useCallback((editor: Editor) => {
    editorRef.current = editor;
    setCharacterCount(countReadingUnits(editor.getText()));
  }, []);

  const getEditor = useCallback(() => editorRef.current, []);
  const handleSaved = useCallback(
    (saved: ApiArticle) => {
      setTitle(saved.title);
      setTopic(saved.topic ?? topic);
      setTags(saved.tags);
      setCover(saved.cover);
      setCoverAssetId(saved.coverAssetId);
    },
    [topic],
  );

  const {
    remoteArticle,
    setRemoteArticle,
    isSaving,
    saveError,
    saveState,
    saveArticle,
    removeArticle,
  } = useArticleSave({
    articleSlug,
    articleLoading,
    getEditor,
    title,
    topic,
    tags,
    coverAssetId,
    onSaved: handleSaved,
  });

  const toggleFullscreen = () => {
    toggleEditorFullscreen();
  };

  const returnToPreviousPage = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate('/');
  };

  const deleteTopic = async (nextTopic: string) => {
    if (topicOptions.length <= 1) return;

    const option = topicOptions.find((item) => item.name === nextTopic);

    try {
      if (option?.id) {
        await deleteTopicRequest(option.id);
      }

      setTopicOptions((current) => current.filter((item) => item.name !== nextTopic));

      if (topic === nextTopic) {
        setTopic(topicOptions.find((item) => item.name !== nextTopic)?.name ?? '');
      }
    } catch (error) {
      setArticleError(error instanceof Error ? error.message : '主题删除失败');
    }
  };

  return (
    <section
      ref={rootRef}
      className={`editor-page ${isFullscreen ? 'is-fullscreen' : ''} ${isScrolled ? 'is-scrolled' : ''}`}
      data-article-slug={articleSlug}
      data-article-key={articleKey ?? legacySlug}
      aria-busy={articleLoading}
    >
      {articleError ? (
        <div className="editor-status-banner editor-status-error" role="alert">
          {articleError}
        </div>
      ) : null}

      <div className="sr-only" role="status">
        {isSaving ? '处理中…' : saveState === 'saved' ? '已保存' : ''}
      </div>

      {saveError ? (
        <div className="editor-status-banner editor-status-error" role="alert">
          {saveError}
        </div>
      ) : null}

      <SimpleEditor
        key={`${articleSlug ?? 'new'}-${editorContentVersion}`}
        content={editorContent}
        contentType="markdown"
        editable={!articleLoading && !articleError}
        ariaLabel="正文编辑区"
        onCreate={(editor) => {
          editorRef.current = editor;
        }}
        onUpdate={handleEditorUpdate}
      >
        {({ toolbar, search, content }) => (
          <EditorLayout
            toolbarDisabled={articleLoading || Boolean(articleError)}
            back={
              <motion.button
                type="button"
                className="editor-floating-button editor-back-button"
                onClick={returnToPreviousPage}
                aria-label="返回上一页"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <ArrowLeft size={18} strokeWidth={1.7} aria-hidden="true" />
              </motion.button>
            }
            actions={
              <ArticleActions
                isFullscreen={isFullscreen}
                busy={isSaving}
                loading={articleLoading || Boolean(articleSlug && !remoteArticle)}
                saved={saveState !== 'idle'}
                exists={Boolean(remoteArticle)}
                title={title}
                onFullscreen={toggleFullscreen}
                onSave={() => {
                  void saveArticle();
                }}
                onDelete={removeArticle}
              />
            }
            toolbar={toolbar}
            search={search}
            headerBefore={
              <div
                className="editor-header-stage editor-header-before"
                inert={isFullscreen || articleLoading}
                aria-hidden={isFullscreen}
              >
                <div className="page-content editor-page-content">
                  <TopicPicker
                    topic={topic}
                    options={topicOptions}
                    onSelect={setTopic}
                    onDelete={deleteTopic}
                  />
                </div>
              </div>
            }
            title={
              <div className="editor-title-stage">
                <input
                  id={coverInputId}
                  ref={coverInputRef}
                  className="editor-cover-input"
                  type="file"
                  accept="image/*"
                  disabled={articleLoading}
                  onChange={handleCoverChange}
                />
                <textarea
                  className="editor-title-input"
                  value={title}
                  readOnly={articleLoading}
                  placeholder="标题"
                  aria-label="文章标题"
                  rows={1}
                  ref={titleInputRef}
                  onTransitionEnd={() => {
                    if (!supportsFieldSizing()) resizeTitleInput();
                  }}
                  onChange={(event) => setTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                    }
                  }}
                />
                <div className="editor-cover-stage" inert={isFullscreen} aria-hidden={isFullscreen}>
                  <div className="editor-cover-reveal">
                    <figure className={cover ? 'editor-cover' : 'editor-cover is-default'}>
                      <img
                        src={cover ?? DEFAULT_ARTICLE_COVER}
                        alt={cover ? '文章封面' : '默认封面占位图'}
                        referrerPolicy="no-referrer"
                      />
                      <label
                        className="editor-cover-action"
                        htmlFor={coverInputId}
                        aria-label={cover ? '更换封面' : '上传封面'}
                      >
                        <span className="editor-cover-action-icon" aria-hidden="true">
                          <Images size={20} strokeWidth={1.6} />
                        </span>
                        <span className="editor-cover-action-text">
                          {cover ? '更换封面' : '上传封面'}
                        </span>
                      </label>
                      {cover ? null : (
                        <figcaption className="editor-cover-default-note">
                          默认封面 · 点击上传
                        </figcaption>
                      )}
                    </figure>
                    {coverError ? (
                      <p className="editor-cover-error" role="alert">
                        {coverError}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            }
            headerAfter={
              <div
                className="editor-header-stage editor-header-after"
                inert={isFullscreen || articleLoading}
                aria-hidden={isFullscreen}
              >
                <div className="page-content editor-page-content">
                  <div className="editor-metadata">
                    <span
                      className="editor-publication-status"
                      data-status={remoteArticle?.status ?? 'draft'}
                    >
                      {remoteArticle?.status === 'published' ? '已发布' : '草稿'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={remoteArticle?.publishedAt ?? article.publishedAt}>
                      {(remoteArticle?.publishedAt ?? article.publishedAt).slice(0, 10)}
                    </time>
                    <span aria-hidden="true">·</span>
                    <span>{characterCount} 字</span>

                    <TagPicker tags={tags} maxTags={MAX_ARTICLE_TAGS} onChange={setTags} />
                  </div>

                  <div className="mt-3 h-px bg-line md:mt-4" aria-hidden="true" />
                </div>
              </div>
            }
          >
            {content}
          </EditorLayout>
        )}
      </SimpleEditor>

      {tocVariant !== 'off' ? (
        <ArticleToc variant={tocVariant} hidden={isFullscreen} compactVariant={compactVariant} />
      ) : null}
    </section>
  );
}
