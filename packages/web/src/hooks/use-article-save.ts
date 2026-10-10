import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Editor } from '@tiptap/react';
import { ApiError, createArticle, deleteArticle, updateArticle, type ApiArticle } from '@/lib/api';
import { articlePath } from '@/lib/article-address';

export type SaveState = 'idle' | 'saved' | 'published' | 'unpublished';

interface UseArticleSaveOptions {
  articleSlug?: string;
  articleLoading: boolean;
  getEditor: () => Editor | null;
  title: string;
  topic: string;
  tags: string[];
  coverAssetId: string | null;
  onSaved: (article: ApiArticle) => void;
}

/** Owns the save/delete orchestration so the page only renders and edits state. */
export function useArticleSave(options: UseArticleSaveOptions) {
  const { articleSlug, articleLoading, getEditor, title, topic, tags, coverAssetId, onSaved } =
    options;
  const navigate = useNavigate();
  const [remoteArticle, setRemoteArticle] = useState<ApiArticle | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const actionLockRef = useRef(false);

  useEffect(() => {
    if (saveState === 'idle') return;

    const timer = window.setTimeout(() => setSaveState('idle'), 1800);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  const saveArticle = useCallback(async () => {
    const editor = getEditor();

    if (!editor || actionLockRef.current || articleLoading) return;
    if (articleSlug && !remoteArticle) {
      setSaveError('文章尚未加载成功，请刷新后重试');
      return;
    }

    actionLockRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    setSaveState('idle');

    try {
      const content = editor.getMarkdown();
      const status = remoteArticle?.status ?? 'draft';
      if (status === 'published' && (!title.trim() || !editor.getText().trim())) {
        throw new Error('请填写文章标题和正文后再发布');
      }

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
        status,
        language: remoteArticle?.language ?? ('zh' as const),
        author: remoteArticle?.author ?? 'Yohoia',
        topicName: topic,
        coverAssetId: coverAssetId || null,
        coverAlt: remoteArticle?.coverAlt ?? null,
        tagNames: tags,
      };

      const saved = remoteArticle
        ? await updateArticle(remoteArticle.id, payload)
        : await createArticle(payload);

      setRemoteArticle(saved);
      onSaved(saved);
      setSaveState('saved');

      if (!remoteArticle) {
        navigate(articlePath(saved), { replace: true });
      }
    } catch (error) {
      setSaveError(
        error instanceof ApiError
          ? '操作失败，请检查连接后重试'
          : error instanceof Error
            ? error.message
            : '保存失败',
      );
    } finally {
      actionLockRef.current = false;
      setIsSaving(false);
    }
  }, [
    articleLoading,
    articleSlug,
    coverAssetId,
    getEditor,
    navigate,
    onSaved,
    remoteArticle,
    tags,
    title,
    topic,
  ]);

  const removeArticle = useCallback(async () => {
    if (!remoteArticle || actionLockRef.current) return;
    actionLockRef.current = true;
    setIsSaving(true);
    try {
      await deleteArticle(remoteArticle.id);
      navigate('/', { replace: true });
    } catch {
      throw new Error('删除失败，请检查连接后重试');
    } finally {
      actionLockRef.current = false;
      setIsSaving(false);
    }
  }, [navigate, remoteArticle]);

  return {
    remoteArticle,
    setRemoteArticle,
    isSaving,
    saveError,
    saveState,
    saveArticle,
    removeArticle,
  };
}
