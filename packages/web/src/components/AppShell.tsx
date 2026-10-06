import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Plus } from 'lucide-react';
import { ServiceStatus } from './ServiceStatus';
import { pageTransition, pageVariants } from '../motionPresets';

const navigation = [{ to: '/editor', label: '写作', icon: Plus, end: false }];

export function AppShell() {
  const location = useLocation();
  const isEditorRoute =
    location.pathname === '/editor' || location.pathname.startsWith('/articles/');

  useEffect(() => {
    const storedTheme = window.localStorage.getItem('pagehush-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = storedTheme === 'dark' || (storedTheme !== 'light' && prefersDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

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
            </div>
          </header>
          <main className="flex-1">
            <div className="page-shell">
              <AnimatePresence mode="wait" initial={false}>
                <motion.section
                  key={location.pathname}
                  className="w-full"
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
