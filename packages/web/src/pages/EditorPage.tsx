import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import type { Editor } from '@tiptap/react';
import { ArrowLeft, ChevronDown, Images, Maximize, Minimize, Plus, X } from 'lucide-react';
import { EditorLayout } from '@/components/EditorLayout';
import { SimpleEditor } from '@/components/tiptap-templates/simple/simple-editor';
import { articleTopics, articles, defaultArticleContent, MAX_ARTICLE_TAGS } from '@/data/articles';
import { useNavigate, useParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { editorLayoutTransition } from '../motionPresets';
import {
  ApiError,
  type ApiArticle,
  createArticle,
  deleteTopic as deleteTopicRequest,
  getArticle,
  listTopics,
  updateArticle,
  uploadCover,
} from '@/lib/api';

const newArticle = {
  title: '把日子，写慢一点',
  topic: '随笔',
  publishedAt: '2026-10-06',
  tags: ['写作', 'Markdown'],
};

function countWords(text: string): number {
  const normalized = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~\-[\] ()!]/g, ' ')
    .trim();
  const cjkCharacters = normalized.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const latinWords = normalized
    .replace(/[\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;

  return cjkCharacters + latinWords;
}

function normalizeTaxonomyValue(value: string): string {
  return value.replace(/^#+/, '').trim();
}

const MAX_COVER_FILE_SIZE = 5 * 1024 * 1024;

export function EditorPage() {
  const { articleSlug } = useParams();
  const navigate = useNavigate();
  const selectedArticle = useMemo(
    () => articles.find((article) => article.slug === articleSlug),
    [articleSlug],
  );
  const article = selectedArticle ?? newArticle;
  const fallbackContent = selectedArticle?.content ?? defaultArticleContent;
  const coverInputId = useId();

  const [remoteArticle, setRemoteArticle] = useState<ApiArticle | null>(null);
  const [articleLoading, setArticleLoading] = useState(Boolean(selectedArticle));
  const [articleError, setArticleError] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState(fallbackContent);
  const [editorContentVersion, setEditorContentVersion] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');

  const [cover, setCover] = useState<string | null>(selectedArticle?.cover ?? null);
  const [coverAssetId, setCoverAssetId] = useState<string | null>(null);
  const [coverObjectUrl, setCoverObjectUrl] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);

  const [title, setTitle] = useState(article.title);
  const [topic, setTopic] = useState(article.topic);
  const [tags, setTags] = useState(article.tags);
  const [characterCount, setCharacterCount] = useState(() => countWords(fallbackContent));
  const [isTopicMenuOpen, setIsTopicMenuOpen] = useState(false);
  const [topicQuery, setTopicQuery] = useState('');
  const [isTagInputVisible, setIsTagInputVisible] = useState(false);
  const [tagQuery, setTagQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [topicOptions, setTopicOptions] = useState(() =>
    articleTopics
      .filter((item) => item !== '全部')
      .map((name) => ({ id: undefined as string | undefined, name })),
  );

  const editorTopics = useMemo(() => topicOptions.map((item) => item.name), [topicOptions]);

  const availableTopics = useMemo(() => {
    const query = topicQuery.trim();
    return query ? editorTopics.filter((item) => item.includes(query)) : editorTopics;
  }, [topicQuery, editorTopics]);

  const topicButtonRef = useRef<HTMLButtonElement>(null);
  const topicMenuRef = useRef<HTMLDivElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
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

    let cancelled = false;
    setArticleLoading(true);
    setArticleError(null);

    getArticle(articleSlug)
      .then((data) => {
        if (cancelled) return;

        setRemoteArticle(data);
        setTitle(data.title);
        setTopic(data.topic ?? '');
        setTags(data.tags);
        setCharacterCount(countWords(data.content));
        setEditorContent(data.content);
        setEditorContentVersion((version) => version + 1);
        setCover(data.cover);
        setCoverAssetId(data.coverAssetId);
      })
      .catch((_error: unknown) => {
        if (cancelled) return;
        // API 不可用时继续使用静态兜底文章，避免破坏布局。
        setArticleError(null);
      })
      .finally(() => {
        if (!cancelled) setArticleLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [articleSlug]);

  useEffect(() => {
    let cancelled = false;
    setArticleError(null);

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
    const handleClickOutside = (event: MouseEvent) => {
      if (
        !topicMenuRef.current?.contains(event.target as Node) &&
        !topicButtonRef.current?.contains(event.target as Node)
      ) {
        setIsTopicMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      if (isTopicMenuOpen) {
        setIsTopicMenuOpen(false);
        topicButtonRef.current?.focus();
      }

      if (isTagInputVisible) {
        setIsTagInputVisible(false);
      }

      if (isFullscreen) {
        setIsFullscreen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isTopicMenuOpen, isFullscreen, isTagInputVisible]);

  useEffect(() => {
    if (isTagInputVisible) {
      tagInputRef.current?.focus();
    }
  }, [isTagInputVisible]);

  useEffect(() => {
    const objectUrl = coverObjectUrl;

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [coverObjectUrl]);

  const handleCoverChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setCoverError('请选择图片文件');
      return;
    }

    if (file.size > MAX_COVER_FILE_SIZE) {
      setCoverError('封面图片不能超过 5MB');
      return;
    }

    setCoverError(null);

    try {
      const asset = await uploadCover(file);
      setCover(asset.url);
      setCoverAssetId(asset.id);
    } catch (error) {
      const isValidationError = error instanceof ApiError && [400, 413, 415].includes(error.status);

      if (!isValidationError) {
        // API / MinIO 不可用时继续使用本地预览，保证编辑不中断。
        const nextObjectUrl = URL.createObjectURL(file);
        setCover(nextObjectUrl);
        setCoverObjectUrl(nextObjectUrl);
      } else {
        setCoverError(error instanceof Error ? error.message : '封面上传失败');
      }
    } finally {
      event.target.value = '';
    }
  };

  const handleEditorUpdate = useCallback((editor: Editor) => {
    editorRef.current = editor;
    setCharacterCount(countWords(editor.getText()));
  }, []);

  const saveArticle = useCallback(async () => {
    const editor = editorRef.current;

    if (!editor || isSaving || articleLoading) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveState('idle');

    try {
      const content = editor.getMarkdown();

      const payload = {
        title: title.trim() || '无标题',
        description: (
          editor
            .getText()
            .split(/\n{2,}/)
            .map((block) => block.trim())
            .find(Boolean) ?? ''
        ).slice(0, 500),
        content,
        format: 'md' as const,
        status: 'draft' as const,
        language: remoteArticle?.language ?? ('zh' as const),
        author: remoteArticle?.author ?? 'Yohoia',
        topicName: topic,
        coverAssetId: coverAssetId || null,
        coverAlt: remoteArticle?.coverAlt ?? null,
        tagNames: tags,
      };

      const saved = remoteArticle
        ? await updateArticle(remoteArticle.slug, payload)
        : await createArticle(payload);

      setRemoteArticle(saved);
      setTitle(saved.title);
      setTopic(saved.topic ?? topic);
      setTags(saved.tags);
      setCover(saved.cover);
      setCoverAssetId(saved.coverAssetId);
      setSaveState('saved');

      if (!remoteArticle) {
        navigate(`/articles/${saved.slug}`, { replace: true });
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  }, [articleLoading, topic, coverAssetId, isSaving, navigate, remoteArticle, tags, title]);

  const toggleFullscreen = () => {
    setIsTopicMenuOpen(false);
    setIsTagInputVisible(false);
    setIsFullscreen((current) => !current);
  };

  const returnToPreviousPage = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate('/');
  };

  const selectTopic = (nextTopic: string) => {
    const value = normalizeTaxonomyValue(nextTopic);
    if (!value) return;

    setTopic(value);
    setIsTopicMenuOpen(false);
    setTopicQuery('');
  };

  const deleteTopic = async (nextTopic: string) => {
    if (editorTopics.length <= 1) return;

    const option = topicOptions.find((item) => item.name === nextTopic);

    try {
      if (option?.id) {
        await deleteTopicRequest(option.id);
      }

      setTopicOptions((current) => current.filter((item) => item.name !== nextTopic));

      if (topic === nextTopic) {
        setTopic(editorTopics.find((item) => item !== nextTopic) ?? '');
      }
    } catch (error) {
      setArticleError(error instanceof Error ? error.message : '主题删除失败');
    }
  };

  const addTag = (nextTag: string): boolean => {
    const value = normalizeTaxonomyValue(nextTag);
    if (!value || tags.includes(value) || tags.length >= MAX_ARTICLE_TAGS) return false;

    setTags((currentTags) => [...currentTags, value]);
    setTagQuery('');
    return true;
  };

  const removeTag = (tag: string) => {
    setTags((currentTags) => currentTags.filter((item) => item !== tag));
  };

  const exactTopic = normalizeTaxonomyValue(topicQuery);
  const canCreateTopic =
    exactTopic.length > 0 &&
    !editorTopics.some((item) => item.toLowerCase() === exactTopic.toLowerCase());

  return (
    <section className={`editor-page ${isFullscreen ? 'is-fullscreen' : ''}`}>
      {articleLoading ? (
        <div className="editor-status-banner" role="status">
          正在加载文章…
        </div>
      ) : null}

      {articleError ? (
        <div className="editor-status-banner editor-status-error" role="alert">
          {articleError}
        </div>
      ) : null}

      {selectedArticle ? (
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
      ) : null}

      <motion.button
        type="button"
        className="editor-floating-button editor-fullscreen-toggle"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? '退出全屏' : '进入全屏'}
        aria-pressed={isFullscreen}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {isFullscreen ? (
          <Minimize size={17} strokeWidth={1.7} aria-hidden="true" />
        ) : (
          <Maximize size={17} strokeWidth={1.7} aria-hidden="true" />
        )}
      </motion.button>

      <motion.button
        type="button"
        className="editor-save-button"
        onClick={() => {
          void saveArticle();
        }}
        disabled={isSaving || articleLoading}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        {isSaving ? '保存中…' : saveState === 'saved' ? '已保存' : '保存文章'}
      </motion.button>

      {saveError ? (
        <div className="editor-status-banner editor-status-error" role="alert">
          {saveError}
        </div>
      ) : null}

      <SimpleEditor
        key={`${articleSlug ?? 'new'}-${editorContentVersion}`}
        content={editorContent}
        contentType="markdown"
        ariaLabel="正文编辑区"
        onCreate={(editor) => {
          editorRef.current = editor;
        }}
        onUpdate={handleEditorUpdate}
      >
        {({ toolbar, search, content }) => (
          <EditorLayout
            isFullscreen={isFullscreen}
            toolbar={toolbar}
            search={search}
            headerBefore={
              <AnimatePresence initial={false} mode="sync">
                {isFullscreen ? null : (
                  <motion.div
                    className="editor-header-stage editor-header-before"
                    layout="position"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={editorLayoutTransition}
                  >
                    <div className="page-content editor-page-content">
                      <div className="editor-taxonomy">
                        <div className="editor-topic-picker">
                          <button
                            ref={topicButtonRef}
                            type="button"
                            className="editor-topic-button"
                            aria-haspopup="menu"
                            aria-expanded={isTopicMenuOpen}
                            onClick={() => {
                              setIsTopicMenuOpen((open) => !open);
                              setIsTagInputVisible(false);
                            }}
                          >
                            {topic} · TOPIC
                            <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" />
                          </button>

                          {isTopicMenuOpen ? (
                            <div ref={topicMenuRef} className="editor-taxonomy-menu" role="menu">
                              <label className="editor-taxonomy-field">
                                <span>搜索或创建主题</span>
                                <input
                                  value={topicQuery}
                                  placeholder="输入主题名称"
                                  onChange={(event) => setTopicQuery(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault();
                                      selectTopic(availableTopics[0] ?? exactTopic);
                                    }
                                  }}
                                />
                              </label>

                              <div
                                className="editor-taxonomy-options"
                                role="group"
                                aria-label="可选择主题"
                              >
                                {availableTopics.map((item) => (
                                  <div
                                    key={item}
                                    className={`editor-taxonomy-option ${
                                      item === topic ? 'active' : ''
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="editor-taxonomy-option-label"
                                      onClick={() => selectTopic(item)}
                                    >
                                      {item}
                                    </button>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="editor-taxonomy-option-delete"
                                      aria-label={`删除主题 ${item}`}
                                      disabled={editorTopics.length <= 1}
                                      onClick={() => deleteTopic(item)}
                                    >
                                      <X size={12} strokeWidth={2} aria-hidden="true" />
                                    </button>
                                  </div>
                                ))}

                                {canCreateTopic ? (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="create"
                                    onClick={() => selectTopic(exactTopic)}
                                  >
                                    创建「{exactTopic}」并使用
                                  </button>
                                ) : null}

                                {availableTopics.length === 0 && !canCreateTopic ? (
                                  <span className="editor-taxonomy-empty">没有找到主题</span>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            }
            title={
              <div className="editor-title-stage">
                <input
                  id={coverInputId}
                  ref={coverInputRef}
                  className="editor-cover-input"
                  type="file"
                  accept="image/*"
                  onChange={handleCoverChange}
                />
                <motion.textarea
                  className="editor-title-input"
                  value={title}
                  placeholder="标题"
                  aria-label="文章标题"
                  rows={1}
                  ref={titleInputRef}
                  layout
                  transition={editorLayoutTransition}
                  onChange={(event) => setTitle(event.target.value)}
                  onTransitionEnd={resizeTitleInput}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                    }
                  }}
                />
                <AnimatePresence initial={false}>
                  {!isFullscreen ? (
                    <motion.div
                      className="editor-cover-stage"
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 24 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      transition={editorLayoutTransition}
                    >
                      {cover ? (
                        <figure className="editor-cover">
                          <img src={cover} alt="文章封面" />
                          <label
                            className="editor-cover-action"
                            htmlFor={coverInputId}
                            aria-label="更换封面"
                          >
                            <span className="editor-cover-action-icon" aria-hidden="true">
                              <Images size={20} strokeWidth={1.6} />
                            </span>
                            <span className="editor-cover-action-text">更换封面</span>
                          </label>
                        </figure>
                      ) : (
                        <label className="editor-cover-empty" htmlFor={coverInputId}>
                          <img
                            className="editor-cover-empty-art"
                            src="/covers/upload-cover.png"
                            alt=""
                          />
                          <span className="editor-cover-empty-title">上传封面</span>
                          <small>支持 JPG、PNG、WebP，最大 5MB</small>
                        </label>
                      )}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                {coverError && !isFullscreen ? (
                  <p className="editor-cover-error" role="alert">
                    {coverError}
                  </p>
                ) : null}
              </div>
            }
            headerAfter={
              <AnimatePresence initial={false} mode="sync">
                {isFullscreen ? null : (
                  <motion.div
                    className="editor-header-stage editor-header-after"
                    layout="position"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={editorLayoutTransition}
                  >
                    <div className="page-content editor-page-content">
                      <div className="editor-metadata">
                        <time dateTime={article.publishedAt}>{article.publishedAt}</time>
                        <span aria-hidden="true">·</span>
                        <span>{characterCount} 字</span>

                        <div className="editor-tags" aria-label="文章标签">
                          {tags.map((tag) => (
                            <span key={tag} className="editor-tag">
                              <span className="editor-tag-label">#{tag}</span>
                              <button
                                type="button"
                                onClick={() => removeTag(tag)}
                                aria-label={`移除标签 ${tag}`}
                              >
                                <X size={12} strokeWidth={2} aria-hidden="true" />
                              </button>
                            </span>
                          ))}

                          {tags.length < MAX_ARTICLE_TAGS ? (
                            <div className="editor-tag-picker">
                              {isTagInputVisible ? (
                                <input
                                  ref={tagInputRef}
                                  className="editor-tag-input"
                                  value={tagQuery}
                                  placeholder="标签"
                                  aria-label="新增标签"
                                  onBlur={() => setIsTagInputVisible(false)}
                                  onChange={(event) => setTagQuery(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Escape') {
                                      event.preventDefault();
                                      setIsTagInputVisible(false);
                                      return;
                                    }

                                    if (event.key !== 'Enter') return;

                                    event.preventDefault();
                                    if (addTag(tagQuery)) {
                                      setIsTagInputVisible(false);
                                    }
                                  }}
                                />
                              ) : (
                                <button
                                  type="button"
                                  className="editor-add-tag"
                                  aria-expanded={isTagInputVisible}
                                  onClick={() => {
                                    setIsTagInputVisible(true);
                                    setTagQuery('');
                                    setIsTopicMenuOpen(false);
                                  }}
                                >
                                  <Plus size={12} strokeWidth={2} aria-hidden="true" />
                                  标签
                                </button>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-3 h-px bg-line md:mt-4" aria-hidden="true" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            }
          >
            {content}
          </EditorLayout>
        )}
      </SimpleEditor>
    </section>
  );
}
