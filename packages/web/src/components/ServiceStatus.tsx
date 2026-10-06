import { useEffect, useState } from 'react';
import { CloudOff, LoaderCircle, ShieldCheck } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { statusIconTransition, statusIconVariants } from '../motionPresets';

type ServiceState = 'checking' | 'online' | 'offline';

export function ServiceStatus() {
  const [state, setState] = useState<ServiceState>('checking');

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);

    fetch('/v1/health', { signal: controller.signal, cache: 'no-store' })
      .then((response) => setState(response.ok ? 'online' : 'offline'))
      .catch(() => setState('offline'))
      .finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  const label =
    state === 'online' ? 'API 已连接' : state === 'checking' ? 'API 检查中' : 'API 未启动';
  const Icon = state === 'online' ? ShieldCheck : state === 'checking' ? LoaderCircle : CloudOff;

  return (
    <span
      className="hidden min-h-9 items-center gap-2 rounded-[3px] border border-line px-3 text-xs text-muted md:flex"
      aria-live="polite"
    >
      <span className="relative flex size-4 items-center justify-center" aria-hidden>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={state}
            className="absolute inset-0 flex items-center justify-center"
            variants={statusIconVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={statusIconTransition}
          >
            <Icon size={16} strokeWidth={1.7} />
          </motion.span>
        </AnimatePresence>
      </span>
      {label}
    </span>
  );
}
