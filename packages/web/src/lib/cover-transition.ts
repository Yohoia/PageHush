let active: { transition?: ViewTransition; controller: AbortController } | undefined;

function openWithOverlayTransition(slug: string, source: HTMLImageElement, navigate: () => void) {
  const start = source.getBoundingClientRect();
  const cover = document.createElement('canvas');
  const scale = Math.min(1, 2048 / Math.max(source.naturalWidth, source.naturalHeight));
  cover.width = Math.max(1, Math.round(source.naturalWidth * scale));
  cover.height = Math.max(1, Math.round(source.naturalHeight * scale));
  const context = cover.getContext('2d');
  if (!context || !start.width) {
    navigate();
    return;
  }
  try {
    // Reuse the already decoded pixels, including cross-origin covers; no second image request.
    context.drawImage(source, 0, 0, cover.width, cover.height);
  } catch {
    navigate();
    return;
  }
  const sourceStyle = getComputedStyle(source);
  const sourceFilter = sourceStyle.filter;
  const sourceRadius = sourceStyle.borderRadius;
  const originalVisibility = source.style.visibility;
  const root = document.documentElement;
  const current = { controller: new AbortController() };
  active = current;
  let animation: Animation | undefined;
  let cleaned = false;
  cover.className = 'article-cover-flight';
  cover.setAttribute('aria-hidden', 'true');
  Object.assign(cover.style, {
    width: `${start.width}px`,
    height: `${start.height}px`,
    transform: `translate(${start.x}px, ${start.y}px)`,
    filter: sourceFilter,
  });
  root.dataset.articleTransitionEngine = 'overlay';
  root.dataset.articleTransition = 'preparing';
  source.style.visibility = 'hidden';
  document.body.append(cover);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    current.controller.abort();
    animation?.cancel();
    cover.remove();
    source.style.visibility = originalVisibility;
    window.removeEventListener('popstate', cleanup);
    window.removeEventListener('resize', cleanup);
    document.removeEventListener('visibilitychange', hidden);
    reduced.removeEventListener('change', cleanup);
    if (active === current) {
      active = undefined;
      delete root.dataset.articleTransition;
      delete root.dataset.articleTransitionEngine;
    }
  };
  const hidden = () => {
    if (document.hidden) cleanup();
  };
  window.addEventListener('popstate', cleanup);
  window.addEventListener('resize', cleanup);
  document.addEventListener('visibilitychange', hidden);
  reduced.addEventListener('change', cleanup);
  navigate();
  window.scrollTo({ top: 0, behavior: 'instant' });
  void waitForCover(slug, current.controller.signal).then((destination) => {
    if (current.controller.signal.aborted) return;
    if (!destination || destination.currentSrc !== source.currentSrc) {
      cleanup();
      return;
    }
    const end = destination.getBoundingClientRect();
    const destinationStyle = getComputedStyle(destination);
    const target = `translate(${end.x}px, ${end.y}px)`;
    Object.assign(cover.style, {
      width: `${end.width}px`,
      height: `${end.height}px`,
      transform: target,
    });
    try {
      animation = cover.animate(
        [
          {
            transform: `translate(${start.x}px, ${start.y}px) scale(${start.width / end.width}, ${start.height / end.height})`,
            borderRadius: sourceRadius,
            filter: sourceFilter,
          },
          {
            transform: `${target} scale(1, 1)`,
            borderRadius: '8px',
            filter: destinationStyle.filter,
          },
        ],
        { duration: 460, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' },
      );
      root.dataset.articleTransition = 'running';
      void animation.finished.then(cleanup, cleanup);
    } catch {
      cleanup();
    }
  });
}

function waitForCover(slug: string, signal: AbortSignal): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (image: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
      resolve(image);
    };
    const cancel = () => finish(null);
    const check = () => {
      const page = document.querySelector<HTMLElement>('.editor-page');
      const image = page?.querySelector<HTMLImageElement>('.editor-cover img');
      if (page?.dataset.articleKey !== slug || !image || !image.getBoundingClientRect().width)
        return;
      void image.decode().then(
        () => finish(image),
        () => finish(null),
      );
    };
    const observer = new MutationObserver(check);
    const timeout = setTimeout(cancel, 800);
    signal.addEventListener('abort', cancel, { once: true });
    observer.observe(document.getElementById('root') ?? document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    });
    check();
  });
}

/** The router stays in charge of navigation; snapshots only join the two image rectangles. */
export function openWithCoverTransition(
  slug: string,
  source: HTMLImageElement | null,
  navigate: () => void,
) {
  if (active) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches || !source?.complete || !source.naturalWidth) {
    navigate();
    window.scrollTo({ top: 0, behavior: 'instant' });
    return;
  }
  if (!document.startViewTransition) {
    openWithOverlayTransition(slug, source, navigate);
    return;
  }

  const root = document.documentElement;
  const previousName = source.style.viewTransitionName;
  const current = {
    controller: new AbortController(),
    transition: undefined as ViewTransition | undefined,
  };
  active = current;
  source.style.viewTransitionName = 'article-cover';
  root.dataset.articleTransition = 'preparing';
  let destinationImage: HTMLImageElement | null = null;
  let destinationName = '';
  let navigated = false;
  let historyChanged = false;
  const go = () => {
    if (navigated || historyChanged) return;
    navigated = true;
    navigate();
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const cancel = () => {
    current.controller.abort();
    current.transition?.skipTransition();
  };
  const hidden = () => {
    if (document.hidden) cancel();
  };
  const historyNavigation = () => {
    historyChanged = true;
    cancel();
  };
  window.addEventListener('popstate', historyNavigation);
  window.addEventListener('resize', cancel);
  document.addEventListener('visibilitychange', hidden);
  reduced.addEventListener('change', cancel);

  const cleanup = () => {
    current.controller.abort();
    source.style.viewTransitionName = previousName;
    if (destinationImage) destinationImage.style.viewTransitionName = destinationName;
    window.removeEventListener('popstate', historyNavigation);
    window.removeEventListener('resize', cancel);
    document.removeEventListener('visibilitychange', hidden);
    reduced.removeEventListener('change', cancel);
    if (active === current) {
      active = undefined;
      delete root.dataset.articleTransition;
    }
  };

  try {
    current.transition = document.startViewTransition(async () => {
      go();
      if (current.controller.signal.aborted) return;
      const destination = await waitForCover(slug, current.controller.signal);
      if (!destination || destination.currentSrc !== source.currentSrc) {
        current.transition?.skipTransition();
        return;
      }
      destinationImage = destination;
      destinationName = destination.style.viewTransitionName;
      destination.style.viewTransitionName = 'article-cover';
    });
    void current.transition.ready.then(
      () => {
        if (active === current) root.dataset.articleTransition = 'running';
      },
      () => undefined,
    );
    void current.transition.finished.then(cleanup, cleanup);
  } catch {
    cleanup();
    go();
  }
}
