import { useEffect, useRef } from 'react';

interface RailState {
  expanded: boolean;
  activeId: string | null;
  progress: number;
}

interface Spring {
  value: number;
  target: number;
  speed: number;
  stiffness: number;
  damping: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const spring = (stiffness: number, damping: number): Spring => ({
  value: 0,
  target: 0,
  speed: 0,
  stiffness,
  damping,
});

/** SVG geometry stays outside React's render loop; all listeners and frames belong to this mount. */
export function useSoftTocRail(enabled: boolean, state: RailState) {
  const trackRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const controllerRef = useRef<{ update: () => void; pluck: (clientY?: number) => void } | null>(
    null,
  );

  useEffect(() => {
    stateRef.current = state;
    controllerRef.current?.update();
  }, [state.expanded, state.activeId, state.progress]);

  useEffect(() => {
    const track = trackRef.current;
    if (!enabled || !track) return;
    const svg = track.querySelector<SVGSVGElement>('svg');
    const path = svg?.querySelector<SVGPathElement>('path');
    const readPath = svg?.querySelector<SVGPathElement>('.soft-toc-read-path');
    const cursor = svg?.querySelector<SVGCircleElement>('.soft-toc-cursor');
    const glint = svg?.querySelector<SVGCircleElement>('.soft-toc-glint');
    const list = track.querySelector<HTMLOListElement>('ol');
    if (!svg || !path || !cursor || !glint || !list) return;
    const area = track.closest<HTMLElement>('.editor-soft-toc-area') ?? track;

    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const desktop = matchMedia('(min-width: 1200px)');
    const phases = Array.from({ length: 3 }, () => Math.random() * Math.PI * 2);
    const position = spring(260, 22);
    const depth = spring(320, 23);
    const presence = spring(260, 28);
    const reading = spring(220, 28);
    const attraction = spring(180, 23);
    const springs = [position, depth, presence, reading, attraction];
    let height = 1,
      frame = 0,
      last = 0,
      visible = true,
      hovering = false;
    let nearY = 0,
      pulseTime = -10,
      pulseY = 0;

    function amount(y: number, time: number) {
      const ratio = y / height;
      const taper = clamp(Math.min(y, height - y) / 20, 0, 1);
      const wave = reduce.matches
        ? 0
        : (Math.sin(ratio * 8.3 + time * 0.83 + phases[0]!) * 5.5 +
            Math.sin(ratio * 13.6 - time * 0.51 + phases[1]!) * 2.7 +
            Math.sin(ratio * 20.8 + time * 0.32 + phases[2]!) * 1.4) *
          Math.sin(Math.PI * ratio);
      const indent =
        depth.value *
        Math.exp(-(((y - position.value) / 38) ** 2)) *
        taper *
        taper *
        (3 - 2 * taper);
      const bend = attraction.value * Math.exp(-(((y - nearY) / 52) ** 2));
      const age = time - pulseTime;
      const pulse =
        !reduce.matches && age >= 0 && age < 2
          ? Math.sin((Math.abs(y - pulseY) - age * 145) / 18) *
            Math.exp(-(((Math.abs(y - pulseY) - age * 145) / 34) ** 2)) *
            10 *
            Math.exp(-age * 1.9) *
            Math.sin(Math.PI * ratio)
          : 0;
      return (wave + bend) * (1 - clamp(presence.value, 0, 1)) + indent + pulse;
    }

    function draw(time: number) {
      const points: [number, number][] = [];
      for (let y = 0; y < height; y += 6) points.push([20 + amount(y, time), y]);
      points.push([20, height]);
      let curve = `M${points[0]![0].toFixed(2)} 0`;
      for (let i = 0; i < points.length - 1; i++) {
        const prev = points[Math.max(0, i - 1)]!,
          a = points[i]!,
          b = points[i + 1]!;
        const next = points[Math.min(points.length - 1, i + 2)]!;
        curve += ` C${(a[0] + (b[0] - prev[0]) / 6).toFixed(2)} ${(a[1] + (b[1] - prev[1]) / 6).toFixed(2)} ${(
          b[0] -
          (next[0] - a[0]) / 6
        ).toFixed(2)} ${(b[1] - (next[1] - a[1]) / 6).toFixed(2)} ${b[0].toFixed(
          2,
        )} ${b[1].toFixed(2)}`;
      }
      path!.setAttribute('d', curve);
      readPath?.setAttribute('d', curve);
      cursor!.setAttribute('cx', (20 + amount(position.value, time)).toFixed(2));
      cursor!.setAttribute('cy', position.value.toFixed(2));
      const y = height * clamp(reading.value, 0, 1);
      glint!.setAttribute('cx', (20 + amount(y, time)).toFixed(2));
      glint!.setAttribute('cy', y.toFixed(2));
    }

    function allowed() {
      return visible && !document.hidden && (desktop.matches || stateRef.current.expanded);
    }

    function animate(time: number) {
      frame = 0;
      if (!allowed()) {
        last = 0;
        return;
      }
      const elapsed = last ? Math.min((time - last) / 1000, 0.032) : 1 / 60;
      last = time;
      const steps = Math.ceil(elapsed / 0.008),
        dt = elapsed / steps;
      for (let i = 0; i < steps; i++) {
        for (const s of springs) {
          s.speed += ((s.target - s.value) * s.stiffness - s.speed * s.damping) * dt;
          s.value += s.speed * dt;
        }
        position.value = clamp(position.value, 0, height);
      }
      draw(time / 1000);
      const unsettled = springs.some(
        (s) => Math.abs(s.value - s.target) > 0.04 || Math.abs(s.speed) > 0.08,
      );
      if (unsettled || !stateRef.current.expanded || time / 1000 - pulseTime < 2) {
        frame = requestAnimationFrame(animate);
      } else last = 0;
    }

    function start() {
      if (reduce.matches) {
        cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
        for (const s of springs) {
          s.value = s.target;
          s.speed = 0;
        }
        draw(0);
      } else if (!frame && allowed()) frame = requestAnimationFrame(animate);
    }

    function update() {
      const { activeId, expanded, progress } = stateRef.current;
      if (!expanded) hovering = false;
      presence.target = expanded ? 1 : 0;
      depth.target = expanded ? 19 : 0;
      reading.target = progress / 100;
      if (!hovering) {
        const link = Array.from(
          list!.querySelectorAll<HTMLButtonElement>('[data-heading-id]'),
        ).find((item) => item.dataset.headingId === activeId);
        const rect = link?.getBoundingClientRect();
        position.target = rect
          ? clamp(rect.top - track!.getBoundingClientRect().top + rect.height / 2, 16, height - 16)
          : 24;
      }
      start();
    }

    function measure() {
      height = Math.max(1, track!.clientHeight);
      svg!.setAttribute('viewBox', `0 0 56 ${height}`);
      update();
    }

    function point(event: PointerEvent) {
      if (event.pointerType === 'touch') return;
      hovering = true;
      position.target = clamp(event.clientY - track!.getBoundingClientRect().top, 16, height - 16);
      depth.target = stateRef.current.expanded ? 19 : 0;
      start();
    }
    function leave() {
      hovering = false;
      update();
    }
    function near(event: PointerEvent) {
      if (!desktop.matches || event.pointerType === 'touch' || stateRef.current.expanded) return;
      const rect = track!.getBoundingClientRect();
      const dx = event.clientX - (rect.left + 20),
        y = event.clientY - rect.top;
      nearY = clamp(y, 0, height);
      attraction.target =
        y >= 0 && y <= height && Math.abs(dx) < 90
          ? Math.sign(dx) * 9 * (1 - Math.abs(dx) / 90)
          : 0;
      start();
    }
    function pluck(clientY?: number) {
      if (reduce.matches) return;
      pulseY =
        clientY === undefined
          ? height
          : clamp(clientY - track!.getBoundingClientRect().top, 0, height);
      pulseTime = performance.now() / 1000;
      start();
    }
    function tap(event: PointerEvent) {
      if (!desktop.matches || stateRef.current.expanded || event.button !== 0) return;
      const rect = track!.getBoundingClientRect();
      if (
        Math.abs(event.clientX - rect.left - 20) < 90 &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      )
        pluck(event.clientY);
    }
    function focus(event: FocusEvent) {
      const link = event.target;
      if (!(link instanceof HTMLButtonElement)) return;
      const rect = link.getBoundingClientRect();
      position.target = clamp(
        rect.top - track!.getBoundingClientRect().top + rect.height / 2,
        16,
        height - 16,
      );
      depth.target = 19;
      start();
    }
    function suspend() {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      start();
    }
    const resize = new ResizeObserver(measure);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry!.isIntersecting;
      suspend();
    });
    resize.observe(track);
    intersection.observe(track);
    area.addEventListener('pointermove', point);
    area.addEventListener('pointerleave', leave);
    list.addEventListener('focusin', focus);
    list.addEventListener('scroll', update, { passive: true });
    window.addEventListener('pointermove', near, { passive: true });
    window.addEventListener('pointerdown', tap, { passive: true });
    desktop.addEventListener('change', suspend);
    reduce.addEventListener('change', suspend);
    document.addEventListener('visibilitychange', suspend);
    controllerRef.current = { update, pluck };
    measure();
    return () => {
      controllerRef.current = null;
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      area.removeEventListener('pointermove', point);
      area.removeEventListener('pointerleave', leave);
      list.removeEventListener('focusin', focus);
      list.removeEventListener('scroll', update);
      window.removeEventListener('pointermove', near);
      window.removeEventListener('pointerdown', tap);
      desktop.removeEventListener('change', suspend);
      reduce.removeEventListener('change', suspend);
      document.removeEventListener('visibilitychange', suspend);
    };
  }, [enabled]);

  return { trackRef, pluck: (clientY?: number) => controllerRef.current?.pluck(clientY) };
}
