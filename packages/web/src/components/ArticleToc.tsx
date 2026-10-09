import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowUp, ArrowUpFromLine, CircleArrowUp, ChevronsUp, ChevronDown } from 'lucide-react';
import { useSoftTocRail } from '@/hooks/use-soft-toc-rail';
import { CompactArticleToc, type CompactTocVariant } from './CompactArticleToc';

export type ArticleTocVariant = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g';

interface ArticleTocProps {
  variant: ArticleTocVariant;
  hidden?: boolean;
  compactVariant?: CompactTocVariant | 'stack';
}

export interface TocEntry {
  id: string;
  level: number;
  text: string;
  element: HTMLElement;
}

const HEADING_SELECTOR = 'h1, h2, h3';
const ACTIVE_OFFSET_PX = 150;
const TOP_BUTTON_THRESHOLD = 0.7;
const scrollBehavior = (): ScrollBehavior =>
  matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';

export function ArticleToc({ variant, hidden = false, compactVariant = 'edge' }: ArticleTocProps) {
  const compactLayout = compactVariant === 'stack' ? undefined : compactVariant;
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isTopButtonVisible, setIsTopButtonVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [canTop, setCanTop] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const entriesRef = useRef<TocEntry[]>([]);
  const nextHeadingId = useRef(0);
  const headingIds = useRef(new WeakMap<HTMLElement, string>());
  const navRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const suppressFocus = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listId = useId();
  const hasEntries = entries.length > 0;
  const { trackRef, pluck } = useSoftTocRail(variant === 'a' && !hidden && hasEntries, {
    expanded,
    activeId,
    progress,
  });

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const close = useCallback(() => {
    cancelClose();
    setExpanded(false);
  }, [cancelClose]);

  const syncEntries = useCallback(() => {
    const stage = document.querySelector('.simple-editor-content-stage');
    const next = Array.from(stage?.querySelectorAll<HTMLElement>(HEADING_SELECTOR) ?? [])
      .filter((element) => element.textContent?.trim())
      .map((element) => {
        let id = element.id || headingIds.current.get(element);
        if (!id) {
          do {
            id = `article-heading-${nextHeadingId.current++}`;
          } while (document.getElementById(id));
        }
        // ProseMirror owns heading attributes; assigning DOM ids triggers an editor redraw.
        headingIds.current.set(element, id);
        return {
          id,
          level: Number(element.tagName.slice(1)),
          text: (element.textContent ?? '').trim(),
          element,
        };
      });

    const previous = entriesRef.current;
    if (
      next.length === previous.length &&
      next.every((entry, index) => {
        const before = previous[index];
        return (
          before?.id === entry.id &&
          before.text === entry.text &&
          before.level === entry.level &&
          before.element === entry.element
        );
      })
    )
      return;
    entriesRef.current = next;
    setEntries(next);
  }, []);

  useEffect(() => {
    if (hidden) return;

    syncEntries();
    const page = document.querySelector('.editor-page');
    if (!page) return;
    let frame = 0;
    // The editor can remount after loading an article. Observe its stable page, not the old stage.
    const observer = new MutationObserver((mutations) => {
      const changed = mutations.some((mutation) => {
        const target =
          mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        return (
          target?.closest('.simple-editor-content-stage') ||
          [...mutation.addedNodes, ...mutation.removedNodes].some(
            (node) =>
              node instanceof Element &&
              (node.matches('.simple-editor-content-stage') ||
                node.querySelector('.simple-editor-content-stage')),
          )
        );
      });
      if (changed && !frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          syncEntries();
        });
    });
    observer.observe(page, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [hidden, syncEntries]);

  useEffect(() => {
    if (hidden) return;

    let frame = 0;

    const measure = () => {
      frame = 0;
      setIsTopButtonVisible(window.scrollY > window.innerHeight * TOP_BUTTON_THRESHOLD);
      const stage = document.querySelector('.simple-editor-content-stage');
      const editor = stage?.querySelector('.tiptap');
      const top = stage?.getBoundingClientRect().top ?? 0;
      // Editor bottom padding is writing space, not article content.
      const bottom = (editor?.lastElementChild ?? stage)?.getBoundingClientRect().bottom ?? 0;
      const distance = bottom - top - window.innerHeight;
      const value = stage?.textContent?.trim()
        ? distance > 0
          ? Math.max(0, Math.min(1, -top / distance))
          : bottom <= window.innerHeight
            ? 1
            : 0
        : 0;
      setProgress(Math.round(value * 100));
      setCanTop(window.scrollY > 2 && value > 0.02);

      let current: TocEntry | null = null;
      for (const entry of entriesRef.current) {
        if (entry.element.getBoundingClientRect().top <= ACTIVE_OFFSET_PX) current = entry;
        else break;
      }
      setActiveId(current ? current.id : (entriesRef.current[0]?.id ?? null));
    };

    const requestMeasure = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', requestMeasure, { passive: true });
    window.addEventListener('resize', requestMeasure);
    const resize = new ResizeObserver(requestMeasure);
    const page = document.querySelector('.editor-page');
    if (page) resize.observe(page);
    return () => {
      window.removeEventListener('scroll', requestMeasure);
      window.removeEventListener('resize', requestMeasure);
      if (frame) cancelAnimationFrame(frame);
      resize.disconnect();
    };
  }, [hidden, entries]);

  const jumpTo = useCallback(
    (entry: TocEntry) => {
      entry.element.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      setActiveId(entry.id);
      if (matchMedia('(max-width: 1199px)').matches) {
        if (!compactLayout) {
          suppressFocus.current = true;
          triggerRef.current?.focus({ preventScroll: true });
        }
        close();
      }
    },
    [close, compactLayout],
  );

  const backToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  }, []);

  useEffect(() => {
    if (!expanded || !activeId) return;
    const list = listRef.current;
    const link = Array.from(
      list?.querySelectorAll<HTMLButtonElement>('[data-heading-id]') ?? [],
    ).find((item) => item.dataset.headingId === activeId);
    if (!list || !link) return;
    const rect = link.getBoundingClientRect(),
      bounds = list.getBoundingClientRect();
    if (rect.top < bounds.top) list.scrollTop -= bounds.top - rect.top;
    else if (rect.bottom > bounds.bottom) list.scrollTop += rect.bottom - bounds.bottom;
  }, [expanded, activeId]);

  useEffect(() => {
    if (!expanded) return;
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || navRef.current?.contains(event.target)) return;
      close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (navRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        if (triggerRef.current !== document.activeElement) {
          suppressFocus.current = true;
          triggerRef.current?.focus({ preventScroll: true });
        }
      }
      close();
    };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', escape);
    };
  }, [expanded, close]);

  useEffect(() => {
    if (hidden) close();
  }, [hidden, close]);
  useEffect(() => cancelClose, [cancelClose]);

  if (hidden) return null;

  if (variant === 'a') {
    if (!hasEntries && !canTop) return null;
    return (
      <>
        {compactLayout ? (
          <CompactArticleToc
            variant={compactLayout}
            entries={entries}
            activeId={activeId}
            progress={progress}
            canTop={canTop}
            onJump={jumpTo}
            onTop={backToTop}
          />
        ) : null}
        <nav
          ref={navRef}
          className={`editor-soft-toc${expanded ? ' is-expanded' : ''}${hasEntries ? '' : ' is-empty'}${compactLayout ? ' has-compact-layout' : ''}`}
          aria-label="文章目录"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) close();
          }}
        >
          {hasEntries ? (
            <div
              className="editor-soft-toc-area"
              onPointerEnter={(event) => {
                if (event.pointerType === 'touch' || !matchMedia('(min-width: 1200px)').matches)
                  return;
                cancelClose();
                setExpanded(true);
              }}
              onPointerLeave={() => {
                if (!matchMedia('(min-width: 1200px)').matches) return;
                cancelClose();
                closeTimer.current = setTimeout(() => {
                  const focused = document.activeElement;
                  if (!navRef.current?.contains(focused) || !focused?.matches(':focus-visible')) {
                    setExpanded(false);
                  }
                }, 140);
              }}
            >
              <button
                ref={triggerRef}
                type="button"
                className="editor-soft-toc-trigger"
                aria-label={expanded ? '收起文章目录' : '展开文章目录'}
                aria-expanded={expanded}
                aria-controls={listId}
                onFocus={(event) => {
                  if (suppressFocus.current) {
                    suppressFocus.current = false;
                    return;
                  }
                  if (
                    event.currentTarget.matches(':focus-visible') &&
                    matchMedia('(min-width: 1200px)').matches
                  )
                    setExpanded(true);
                }}
                onClick={(event) => {
                  pluck(event.detail ? event.clientY : undefined);
                  if (matchMedia('(min-width: 1200px)').matches) setExpanded(true);
                  else setExpanded((value) => !value);
                }}
              >
                <span>目录</span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              <div className="editor-soft-toc-panel">
                <p className="editor-soft-toc-heading" aria-hidden={!expanded}>
                  目录
                </p>
                <div className="editor-soft-toc-track" ref={trackRef}>
                  <svg
                    className="editor-soft-toc-line"
                    viewBox="0 0 56 336"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path d="M20 0 L20 336" />
                    <path
                      className="soft-toc-read-path"
                      d="M20 0 L20 336"
                      pathLength="100"
                      style={{ strokeDashoffset: 100 - progress, opacity: progress > 0 ? 1 : 0 }}
                    />
                    <circle className="soft-toc-cursor" cx="20" cy="24" r="5" />
                    <circle className="soft-toc-glint" cx="20" cy="0" r="2.7" />
                  </svg>
                  <ol
                    ref={listRef}
                    id={listId}
                    className="editor-soft-toc-list"
                    inert={!expanded}
                    aria-hidden={!expanded}
                  >
                    {entries.map((entry) => (
                      <li key={entry.id} data-level={entry.level}>
                        <button
                          type="button"
                          data-heading-id={entry.id}
                          className={activeId === entry.id ? 'is-active' : undefined}
                          aria-current={activeId === entry.id ? 'location' : undefined}
                          onClick={() => jumpTo(entry)}
                        >
                          <span>{entry.text}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          ) : null}
          <div
            className="editor-soft-toc-dock"
            onFocus={close}
            onPointerEnter={() => {
              if (matchMedia('(min-width: 1200px)').matches) close();
            }}
          >
            <div
              className="editor-soft-toc-progress"
              role="progressbar"
              aria-label="阅读进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <svg viewBox="0 0 28 28" aria-hidden="true">
                <circle className="soft-progress-track" cx="14" cy="14" r="11" />
                <circle
                  className="soft-progress-fill"
                  cx="14"
                  cy="14"
                  r="11"
                  pathLength="100"
                  style={{ strokeDashoffset: 100 - progress }}
                />
              </svg>
              <span>{progress}%</span>
            </div>
            <button
              type="button"
              className="editor-soft-toc-top"
              disabled={!canTop}
              aria-label="返回顶部"
              onClick={(event) => {
                const button = event.currentTarget;
                button.classList.remove('is-returning');
                // Restart only the local arrow pulse; reduced motion is handled by CSS.
                void button.offsetWidth;
                button.classList.add('is-returning');
                pluck();
                close();
                backToTop();
              }}
              onAnimationEnd={(event) => event.currentTarget.classList.remove('is-returning')}
            >
              <CircleArrowUp size={18} strokeWidth={1.6} aria-hidden="true" />
              <span>返回顶部</span>
            </button>
          </div>
        </nav>
      </>
    );
  }

  const TopIcon = variant === 'b' ? ChevronsUp : variant === 'c' ? ArrowUpFromLine : ArrowUp;

  return (
    <>
      {entries.length > 0 ? (
        <nav className={`editor-toc editor-toc-${variant}`} aria-label="文章目录">
          <p className="editor-toc-heading">目录</p>
          <ol className="editor-toc-list">
            {entries.map((entry) => (
              <li key={entry.id} data-level={entry.level}>
                <a
                  href={`#${entry.id}`}
                  className={activeId === entry.id ? 'is-active' : undefined}
                  aria-current={activeId === entry.id ? 'true' : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    jumpTo(entry);
                  }}
                >
                  {entry.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <button
        type="button"
        className={`editor-back-to-top editor-back-to-top-${variant}${isTopButtonVisible ? ' is-visible' : ''}`}
        aria-label="返回顶部"
        title="返回顶部"
        tabIndex={isTopButtonVisible ? 0 : -1}
        onClick={backToTop}
      >
        <TopIcon size={variant === 'b' ? 19 : 17} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </>
  );
}
