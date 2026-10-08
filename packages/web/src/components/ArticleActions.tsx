import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, Maximize, Minimize, Save, Trash2 } from 'lucide-react';

interface ArticleActionsProps {
  isFullscreen: boolean;
  busy: boolean;
  loading: boolean;
  saved: boolean;
  exists: boolean;
  title: string;
  onFullscreen: () => void;
  onSave: () => void;
  onDelete: () => Promise<void>;
}

export function ArticleActions(props: ArticleActionsProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const disabled = props.busy || props.loading;

  useEffect(() => {
    if (confirmDelete) dialogRef.current?.showModal();
    else if (dialogRef.current?.open) {
      dialogRef.current.close();
      deleteButtonRef.current?.focus();
    }
  }, [confirmDelete]);

  const closeDialog = () => {
    if (props.busy) return;
    setConfirmDelete(false);
    setDeleteError(null);
  };

  return (
    <>
      <div className="editor-actions" aria-label="文章操作">
        <button
          className="editor-floating-button"
          aria-label="保存文章"
          title={props.saved ? '已保存' : '保存文章'}
          disabled={disabled}
          onClick={props.onSave}
        >
          {props.busy ? (
            <LoaderCircle size={17} className="animate-spin motion-reduce:animate-none" />
          ) : props.saved ? (
            <Check size={17} />
          ) : (
            <Save size={17} />
          )}
        </button>
        {props.exists ? (
          <button
            ref={deleteButtonRef}
            className="editor-floating-button editor-delete-button"
            aria-label="删除文章"
            title="删除文章"
            disabled={disabled}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={17} strokeWidth={1.7} aria-hidden="true" />
          </button>
        ) : null}
        <button
          className="editor-floating-button"
          aria-label={props.isFullscreen ? '退出全屏' : '进入全屏'}
          aria-pressed={props.isFullscreen}
          title={props.isFullscreen ? '退出全屏' : '进入全屏'}
          onClick={props.onFullscreen}
        >
          {props.isFullscreen ? (
            <Minimize size={17} strokeWidth={1.7} />
          ) : (
            <Maximize size={17} strokeWidth={1.7} />
          )}
        </button>
      </div>
      <dialog
        ref={dialogRef}
        className="article-delete-dialog"
        aria-labelledby="article-delete-title"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
      >
        <h2 id="article-delete-title">删除文章？</h2>
        <p>删除「{props.title || '无标题'}」后，文章将从列表移除，当前未保存的修改也会丢失。</p>
        {deleteError ? (
          <p className="article-action-error" role="alert">
            {deleteError}
          </p>
        ) : null}
        <div className="article-delete-dialog-actions">
          <button type="button" autoFocus disabled={props.busy} onClick={closeDialog}>
            取消
          </button>
          <button
            type="button"
            className="is-danger"
            disabled={props.busy}
            onClick={() => {
              setDeleteError(null);
              void props
                .onDelete()
                .catch((error: unknown) =>
                  setDeleteError(error instanceof Error ? error.message : '删除失败，请重试'),
                );
            }}
          >
            {props.busy ? '删除中…' : '删除文章'}
          </button>
        </div>
      </dialog>
    </>
  );
}
