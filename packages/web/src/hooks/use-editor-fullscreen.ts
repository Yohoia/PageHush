import { useCallback, useRef, useState } from 'react';

// The toolbar is independent of the document. Persistent document sections
// collapse together through CSS transitions and can reverse at any point.
export function useEditorFullscreen() {
  const rootRef = useRef<HTMLElement>(null);
  const requestedRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const changeFullscreen = useCallback((next: boolean) => {
    requestedRef.current = next;
    setIsFullscreen(next);
  }, []);

  const toggleFullscreen = useCallback(() => {
    changeFullscreen(!requestedRef.current);
  }, [changeFullscreen]);

  return { rootRef, isFullscreen, changeFullscreen, toggleFullscreen };
}
