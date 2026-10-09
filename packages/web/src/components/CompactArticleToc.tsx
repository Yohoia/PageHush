import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUp, ChevronUp, X } from 'lucide-react';
import type { TocEntry } from './ArticleToc';
import './compact-article-toc.css';

export type CompactTocVariant = 'edge' | 'footer' | 'scrub';

interface CompactArticleTocProps {
  variant: CompactTocVariant;
  entries: TocEntry[];
  activeId: string | null;
  progress: number;
  canTop: boolean;
  onJump: (entry: TocEntry) => void;
  onTop: () => void;
}

const STRAND = 'M12 0 C4 25 20 42 12 60 C4 84 20 104 12 124 C7 139 17 150 12 160';

function BookmarkStrand({ progress }: { progress: number }) {
  return (
    <svg
      className="compact-edge-strand"
      viewBox="0 0 24 160"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path className="compact-strand-base" d={STRAND} />
      <path
        className="compact-strand-read"
        d={STRAND}
        pathLength="100"
        style={{ strokeDashoffset: 100 - progress, opacity: progress > 0 ? 1 : 0 }}
      />
    </svg>
  );
}

/** Narrow-screen reading controls; the side bookmark is the default surface. */
export function CompactArticleToc({
  variant,
  entries,
  activeId,
  progress,
  canTop,
  onJump,
  onTop,
}: CompactArticleTocProps) {
  const [expanded, setExpanded] = useState(false);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const [animating, setAnimating] = useState(!document.hidden);
  const navRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const gesture = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const listId = useId();
  const activeIndex = Math.max(
    0,
    entries.findIndex((entry) => entry.id === activeId),
  );
  const selectedIndex = scrubIndex ?? activeIndex;
  const current = entries[selectedIndex];
  const hasEntries = entries.length > 0;

  function select(entry: TocEntry) {
    onJump(entry);
    setExpanded(false);
    setScrubIndex(null);
    triggerRef.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    const visibility = () => setAnimating(!document.hidden);
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);

  useEffect(() => {
    const viewport = matchMedia('(min-width: 1200px)');
    const changed = () => {
      if (viewport.matches) {
        setExpanded(false);
        setScrubIndex(null);
      }
    };
    viewport.addEventListener('change', changed);
    return () => viewport.removeEventListener('change', changed);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !navRef.current?.contains(event.target))
        setExpanded(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setExpanded(false);
      setScrubIndex(null);
      if (navRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', escape);
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const list = listRef.current;
    const item = list?.querySelectorAll('button')[activeIndex];
    if (!list || !item) return;
    const bounds = list.getBoundingClientRect(),
      rect = item.getBoundingClientRect();
    if (rect.top < bounds.top) list.scrollTop -= bounds.top - rect.top;
    else if (rect.bottom > bounds.bottom) list.scrollTop += rect.bottom - bounds.bottom;
  }, [expanded, activeIndex]);

  if (!hasEntries && !canTop) return null;

  const topControl = (
    <button
      className="compact-toc-top"
      type="button"
      aria-label="返回顶部"
      title="返回顶部"
      disabled={!canTop}
      onClick={(event) => {
        const button = event.currentTarget;
        button.classList.remove('is-returning');
        void button.offsetWidth;
        button.classList.add('is-returning');
        setExpanded(false);
        setScrubIndex(null);
        onTop();
      }}
      onAnimationEnd={(event) => event.currentTarget.classList.remove('is-returning')}
    >
      <ArrowUp size={17} strokeWidth={1.6} aria-hidden="true" />
    </button>
  );

  return (
    <nav
      ref={navRef}
      className={`compact-toc compact-toc-${variant}${expanded ? ' is-expanded' : ''}${scrubIndex !== null ? ' is-scrubbing' : ''}${animating ? '' : ' is-paused'}${hasEntries ? '' : ' is-empty'}`}
      aria-label="文章目录"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setExpanded(false);
          setScrubIndex(null);
        }
      }}
    >
      {hasEntries ? (
        <section
          className="compact-toc-panel"
          inert={!expanded}
          aria-hidden={!expanded}
          aria-label="本篇目录"
        >
          <header>
            <span>目录</span>
            <span className="compact-toc-panel-progress">已读 {progress}%</span>
            <button
              type="button"
              aria-label="关闭文章目录"
              onClick={() => {
                setExpanded(false);
                triggerRef.current?.focus({ preventScroll: true });
              }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <ol id={listId} ref={listRef}>
            {entries.map((entry, index) => (
              <li key={entry.id} data-level={entry.level}>
                <button
                  type="button"
                  aria-current={entry.id === activeId ? 'location' : undefined}
                  className={entry.id === activeId ? 'is-active' : undefined}
                  onClick={() => select(entry)}
                >
                  <span className="compact-toc-number">{String(index + 1).padStart(2, '0')}</span>
                  <span>{entry.text}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {hasEntries ? (
        <button
          type="button"
          ref={triggerRef}
          className="compact-toc-entry"
          aria-label={expanded ? '收起文章目录' : '展开文章目录'}
          aria-expanded={expanded}
          aria-controls={listId}
          onPointerDown={(event) => {
            gesture.current = { x: event.clientX, y: event.clientY, moved: false };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = gesture.current;
            if (!start || start.moved) return;
            const dx = event.clientX - start.x,
              dy = event.clientY - start.y;
            const shouldOpen =
              variant === 'edge'
                ? dx < -28 && Math.abs(dx) > Math.abs(dy)
                : dy < -28 && Math.abs(dy) > Math.abs(dx);
            if (shouldOpen) {
              start.moved = true;
              setExpanded(true);
            }
          }}
          onPointerCancel={() => {
            gesture.current = null;
          }}
          onClick={(event) => {
            const moved = gesture.current?.moved && event.detail > 0;
            gesture.current = null;
            if (!moved) setExpanded((value) => !value);
          }}
        >
          {variant === 'edge' ? (
            <BookmarkStrand progress={progress} />
          ) : (
            <>
              <span className="compact-current-number">
                {String(selectedIndex + 1).padStart(2, '0')}
                <span> / {String(entries.length).padStart(2, '0')}</span>
              </span>
              <span className="compact-current-title">{current?.text}</span>
              <ChevronUp size={14} aria-hidden="true" />
            </>
          )}
        </button>
      ) : null}
      {!hasEntries && variant === 'edge' ? (
        <div className="compact-toc-empty-strand">
          <BookmarkStrand progress={progress} />
        </div>
      ) : null}
      {variant === 'scrub' && hasEntries ? (
        <div className="compact-toc-scrub-track">
          <svg viewBox="0 0 320 28" preserveAspectRatio="none" aria-hidden="true">
            <path
              className="compact-strand-horizontal"
              d="M0 14 C45 6 70 22 110 14 C150 6 180 22 220 14 C260 6 280 22 320 14"
            />
          </svg>
          <span
            className="compact-toc-knob"
            style={{
              left: `${entries.length > 1 ? (selectedIndex / (entries.length - 1)) * 100 : 0}%`,
            }}
            aria-hidden="true"
          />
          <input
            type="range"
            min={0}
            max={Math.max(1, entries.length - 1)}
            step={1}
            value={selectedIndex}
            disabled={entries.length < 2}
            aria-label="拖动切换章节"
            aria-valuetext={current?.text}
            onPointerDown={(event) => setScrubIndex(Number(event.currentTarget.value))}
            onChange={(event) => setScrubIndex(Number(event.currentTarget.value))}
            onPointerUp={(event) => {
              const entry = entries[Number(event.currentTarget.value)];
              if (entry) {
                onJump(entry);
                setScrubIndex(null);
              }
            }}
            onPointerCancel={() => setScrubIndex(null)}
            onKeyUp={(event) => {
              if (
                ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(
                  event.key,
                )
              ) {
                const entry = entries[Number(event.currentTarget.value)];
                if (entry) {
                  onJump(entry);
                  setScrubIndex(null);
                }
              } else if (event.key === 'Escape') setScrubIndex(null);
            }}
          />
        </div>
      ) : null}
      <div
        className="compact-toc-reading"
        role="progressbar"
        aria-label="阅读进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <span style={{ width: `${progress}%` }} />
      </div>
      {topControl}
    </nav>
  );
}
