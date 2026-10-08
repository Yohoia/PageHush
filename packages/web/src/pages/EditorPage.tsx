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
import {
  articleCategories,
  articles,
  defaultArticleMarkdown,
  MAX_ARTICLE_TAGS,
} from '@/data/articles';
import { useNavigate, useParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { editorLayoutTransition } from '../motionPresets';
import {
  ApiError,
  type ApiArticle,
  createArticle,
  deleteCategory as deleteCategoryRequest,
  getArticle,
  listCategories,
  updateArticle,
  uploadCover,
} from '@/lib/api';

const newArticle = {
  title: '把日子，写慢一点',
  category: '随笔',
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
  const { articleId } = useParams();
  const navigate = useNavigate();
  const selectedArticle = useMemo(
    () => articles.find((article) => article.id === articleId),
    [articleId],
  );
  const article = selectedArticle ?? newArticle;
  const fallbackMarkdown = selectedArticle?.markdown ?? defaultArticleMarkdown;
  const coverInputId = useId();

  const [remoteArticle, setRemoteArticle] = useState<ApiArticle | null>(null);
  const [articleLoading, setArticleLoading] = useState(Boolean(selectedArticle));
  const [articleError, setArticleError] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState(fallbackMarkdown);
  const [editorContentVersion, setEditorContentVersion] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');

  const [coverImage, setCoverImage] = useState<string | null>(selectedArticle?.image ?? null);
  const [coverAssetId, setCoverAssetId] = useState<string | null>(null);
  const [coverObjectUrl, setCoverObjectUrl] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);

  const [title, setTitle] = useState(article.title);
  const [category, setCategory] = useState(article.category);
  const [tags, setTags] = useState(article.tags);
  const [characterCount, setCharacterCount] = useState(() => countWords(fallbackMarkdown));
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [categoryQuery, setCategoryQuery] = useState('');
  const [isTagInputVisible, setIsTagInputVisible] = useState(false);
  const [tagQuery, setTagQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [categoryOptions, setCategoryOptions] = useState(() =>
    articleCategories
      .filter((item) => item !== '全部')
      .map((name) => ({ id: undefined as string | undefined, name })),
  );

  const editorCategories = useMemo(
    () => categoryOptions.map((item) => item.name),
    [categoryOptions],
  );

  const availableCategories = useMemo(() => {
    const query = categoryQuery.trim();
    return query ? editorCategories.filter((item) => item.includes(query)) : editorCategories;
  }, [categoryQuery, editorCategories]);

  const categoryButtonRef = useRef<HTMLButtonElement>(null);
  const categoryMenuRef = useRef<HTMLDivElement>(null);
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
    if (!articleId) return;

    let cancelled = false;
    setArticleLoading(true);
    setArticleError(null);

    getArticle(articleId)
      .then((data) => {
        if (cancelled) return;

        setRemoteArticle(data);
        setTitle(data.title);
        setCategory(data.category ?? '');
        setTags(data.tags);
        setCharacterCount(countWords(data.content));
        setEditorContent(data.content);
        setEditorContentVersion((version) => version + 1);
        setCoverImage(data.image);
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
  }, [articleId]);

  useEffect(() => {
    let cancelled = false;
    setArticleError(null);

    listCategories()
      .then((data) => {
        if (cancelled) return;
        setCategoryOptions(data.map((category) => ({ id: category.id, name: category.name })));
      })
      .catch(() => {
        // API 不可用时保留本地分类作为离线兜底。
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        !categoryMenuRef.current?.contains(event.target as Node) &&
        !categoryButtonRef.current?.contains(event.target as Node)
      ) {
        setIsCategoryMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      if (isCategoryMenuOpen) {
        setIsCategoryMenuOpen(false);
        categoryButtonRef.current?.focus();
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
  }, [isCategoryMenuOpen, isFullscreen, isTagInputVisible]);

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
      setCoverImage(asset.url);
      setCoverAssetId(asset.id);
    } catch (error) {
      const isValidationError = error instanceof ApiError && [400, 413, 415].includes(error.status);

      if (!isValidationError) {
        // API / MinIO 不可用时继续使用本地预览，保证编辑不中断。
        const nextObjectUrl = URL.createObjectURL(file);
        setCoverImage(nextObjectUrl);
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
        excerpt: '',
        content,
        format: 'md' as const,
        status: 'draft' as const,
        categoryName: category,
        coverAssetId: coverAssetId || null,
        tagNames: tags,
      };

      const saved = remoteArticle
        ? await updateArticle(remoteArticle.id, payload)
        : await createArticle(payload);

      setRemoteArticle(saved);
      setTitle(saved.title);
      setCategory(saved.category ?? category);
      setTags(saved.tags);
      setCoverImage(saved.image);
      setCoverAssetId(saved.coverAssetId);
      setSaveState('saved');

      if (!remoteArticle) {
        navigate(`/articles/${saved.id}`, { replace: true });
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  }, [articleLoading, category, coverAssetId, isSaving, navigate, remoteArticle, tags, title]);

  const toggleFullscreen = () => {
    setIsCategoryMenuOpen(false);
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

  const selectCategory = (nextCategory: string) => {
    const value = normalizeTaxonomyValue(nextCategory);
    if (!value) return;

    setCategory(value);
    setIsCategoryMenuOpen(false);
    setCategoryQuery('');
  };

  const deleteCategory = async (nextCategory: string) => {
    if (editorCategories.length <= 1) return;

    const option = categoryOptions.find((item) => item.name === nextCategory);

    try {
      if (option?.id) {
        await deleteCategoryRequest(option.id);
      }

      setCategoryOptions((current) => current.filter((item) => item.name !== nextCategory));

      if (category === nextCategory) {
        setCategory(editorCategories.find((item) => item !== nextCategory) ?? '');
      }
    } catch (error) {
      setArticleError(error instanceof Error ? error.message : '分类删除失败');
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

  const exactCategory = normalizeTaxonomyValue(categoryQuery);
  const canCreateCategory =
    exactCategory.length > 0 &&
    !editorCategories.some((item) => item.toLowerCase() === exactCategory.toLowerCase());

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
        key={`${articleId ?? 'new'}-${editorContentVersion}`}
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
                        <div className="editor-category-picker">
                          <button
                            ref={categoryButtonRef}
                            type="button"
                            className="editor-category-button"
                            aria-haspopup="menu"
                            aria-expanded={isCategoryMenuOpen}
                            onClick={() => {
                              setIsCategoryMenuOpen((open) => !open);
                              setIsTagInputVisible(false);
                            }}
                          >
                            {category} · ESSAY
                            <ChevronDown size={14} strokeWidth={1.8} aria-hidden="true" />
                          </button>

                          {isCategoryMenuOpen ? (
                            <div ref={categoryMenuRef} className="editor-taxonomy-menu" role="menu">
                              <label className="editor-taxonomy-field">
                                <span>搜索或创建分类</span>
                                <input
                                  value={categoryQuery}
                                  placeholder="输入分类名称"
                                  onChange={(event) => setCategoryQuery(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault();
                                      selectCategory(availableCategories[0] ?? exactCategory);
                                    }
                                  }}
                                />
                              </label>

                              <div
                                className="editor-taxonomy-options"
                                role="group"
                                aria-label="可选择分类"
                              >
                                {availableCategories.map((item) => (
                                  <div
                                    key={item}
                                    className={`editor-taxonomy-option ${
                                      item === category ? 'active' : ''
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="editor-taxonomy-option-label"
                                      onClick={() => selectCategory(item)}
                                    >
                                      {item}
                                    </button>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="editor-taxonomy-option-delete"
                                      aria-label={`删除分类 ${item}`}
                                      disabled={editorCategories.length <= 1}
                                      onClick={() => deleteCategory(item)}
                                    >
                                      <X size={12} strokeWidth={2} aria-hidden="true" />
                                    </button>
                                  </div>
                                ))}

                                {canCreateCategory ? (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="create"
                                    onClick={() => selectCategory(exactCategory)}
                                  >
                                    创建「{exactCategory}」并使用
                                  </button>
                                ) : null}

                                {availableCategories.length === 0 && !canCreateCategory ? (
                                  <span className="editor-taxonomy-empty">没有找到分类</span>
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
                      {coverImage ? (
                        <figure className="editor-cover">
                          <img src={coverImage} alt="文章封面" />
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
                                    setIsCategoryMenuOpen(false);
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
