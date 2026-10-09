import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowUpFromLine, ChevronsUp } from 'lucide-react';

export type ArticleTocVariant = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g';

interface ArticleTocProps {
  variant: ArticleTocVariant;
  hidden?: boolean;
}

interface TocEntry {
  id: string;
  level: number;
  text: string;
  element: HTMLElement;
}

const HEADING_SELECTOR = 'h1, h2, h3';
const ACTIVE_OFFSET_PX = 150;
const TOP_BUTTON_THRESHOLD = 0.7;

export function ArticleToc({ variant, hidden = false }: ArticleTocProps) {
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isTopButtonVisible, setIsTopButtonVisible] = useState(false);
  const entriesRef = useRef<TocEntry[]>([]);

  const syncEntries = useCallback(() => {
    const stage = document.querySelector('.simple-editor-content-stage');
    if (!stage) return;

    const next = Array.from(stage.querySelectorAll<HTMLElement>(HEADING_SELECTOR)).map(
      (element, index) => {
        const id = element.id || `article-heading-${index}`;
        element.id = id;
        return {
          id,
          level: Number(element.tagName.slice(1)),
          text: (element.textContent ?? '').trim(),
          element,
        };
      },
    );

    entriesRef.current = next;
    setEntries(next);
  }, []);

  useEffect(() => {
    if (hidden) return;

    syncEntries();
    const stage = document.querySelector('.simple-editor-content-stage');
    if (!stage) return;

    const observer = new MutationObserver(syncEntries);
    observer.observe(stage, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [hidden, syncEntries]);

  useEffect(() => {
    if (hidden) return;

    let frame = 0;

    const measure = () => {
      frame = 0;
      setIsTopButtonVisible(window.scrollY > window.innerHeight * TOP_BUTTON_THRESHOLD);

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
    return () => {
      window.removeEventListener('scroll', requestMeasure);
      window.removeEventListener('resize', requestMeasure);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [hidden, entries]);

  const jumpTo = useCallback((entry: TocEntry) => {
    entry.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const backToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  if (hidden) return null;

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
