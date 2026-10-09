import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { LogOut, Plus } from 'lucide-react';
import { ServiceStatus } from './ServiceStatus';
import { pageTransition, pageVariants } from '../motionPresets';
import { getAuthSession, logout } from '@/lib/api';

const navigation = [{ to: '/editor', label: '写作', icon: Plus, end: false }];

export function AppShell() {
  const location = useLocation();
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'guest'>('checking');
  const isEditorRoute =
    location.pathname === '/editor' || location.pathname.startsWith('/articles/');

  useEffect(() => {
    let cancelled = false;

    getAuthSession()
      .then((session) => {
        if (cancelled) return;
        setAuthState(session.authenticated ? 'authenticated' : 'guest');
      })
      .catch(() => {
        if (!cancelled) setAuthState('guest');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem('pagehush-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = storedTheme === 'dark' || (storedTheme !== 'light' && prefersDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  if (authState === 'checking') {
    return (
      <div className="grid min-h-dvh place-items-center bg-paper text-sm text-muted" role="status">
        正在检查访问状态…
      </div>
    );
  }

  if (authState === 'guest') {
    if (location.pathname.startsWith('/editor/demo') || location.pathname.startsWith('/articles/demo')) {
      return (
        <div className="flex min-h-dvh flex-col bg-paper text-ink">
          <main className="min-h-dvh flex-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.section
                key={location.pathname}
                className="min-h-dvh w-full"
                variants={pageVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                transition={pageTransition}
              >
                <Outlet />
              </motion.section>
            </AnimatePresence>
          </main>
        </div>
      );
    }

    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  const handleLogout = async () => {
    await logout().catch(() => undefined);
    window.location.assign('/login');
  };

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      {isEditorRoute ? (
        <main className="min-h-dvh flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.section
              key={location.pathname}
              className="min-h-dvh w-full"
              variants={pageVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={pageTransition}
            >
              <Outlet />
            </motion.section>
          </AnimatePresence>
        </main>
      ) : (
        <>
          <header className="bg-paper/95 backdrop-blur">
            <div className="mx-auto flex min-h-20 w-full max-w-[1400px] items-center gap-6 px-6 lg:px-10">
              <a
                className="flex items-center gap-3 sm:gap-4"
                href="/"
                aria-label="页息 PageHush 首页"
              >
                <img
                  src="/brand/logo-128.png"
                  alt=""
                  width="38"
                  height="38"
                  className="size-[34px] sm:size-[38px]"
                />
                <img
                  src="/brand/chinese-logo.png"
                  alt="页息"
                  width="68"
                  height="38"
                  className="h-[34px] w-auto sm:h-[38px]"
                />
              </a>
              <nav
                className="ml-auto flex items-center gap-1 text-sm font-medium"
                aria-label="主导航"
              >
                {navigation.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-[3px] px-3 py-2 transition ${
                        isActive
                          ? 'bg-selected text-ink'
                          : 'text-muted hover:bg-hover hover:text-ink'
                      }`
                    }
                  >
                    <item.icon size={17} strokeWidth={1.6} aria-hidden />
                    {item.label}
                  </NavLink>
                ))}
              </nav>
              <ServiceStatus />
              <button
                type="button"
                className="flex items-center gap-2 rounded-[3px] px-3 py-2 text-sm text-muted transition hover:bg-hover hover:text-ink"
                onClick={() => {
                  void handleLogout();
                }}
              >
                <LogOut size={16} strokeWidth={1.6} aria-hidden />
                退出
              </button>
            </div>
          </header>
          <main className="flex flex-1 flex-col">
            <div className="page-shell flex flex-1 flex-col">
              <AnimatePresence mode="wait" initial={false}>
                <motion.section
                  key={location.pathname}
                  className="flex w-full flex-1 flex-col"
                  variants={pageVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={pageTransition}
                >
                  <Outlet />
                </motion.section>
              </AnimatePresence>
            </div>
          </main>
          <footer className="border-t border-line py-5 text-center text-xs text-muted">
            PageHush 基础框架 · Markdown / MDX 源文本为内容真源
          </footer>
        </>
      )}
    </div>
  );
}
