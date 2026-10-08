import type { ReactNode } from 'react';
import { motion, type Variants } from 'motion/react';
import { editorLayoutTransition } from '../motionPresets';

const toolbarStageVariants: Variants = {
  normal: {
    opacity: [0, 0, 1],
    transition: {
      duration: 0.84,
      times: [0, 0.7, 1],
      ease: [0.38, 0, 0.16, 1],
    },
  },
  fullscreen: {
    opacity: [0, 0, 1],
    transition: {
      duration: 0.84,
      times: [0, 0.7, 1],
      ease: [0.38, 0, 0.16, 1],
    },
  },
};

interface EditorLayoutProps {
  isFullscreen: boolean;
  headerBefore: ReactNode;
  title: ReactNode;
  headerAfter: ReactNode;
  toolbar: ReactNode;
  search: ReactNode;
  children: ReactNode;
}

export function EditorLayout({
  isFullscreen,
  headerBefore,
  title,
  headerAfter,
  toolbar,
  search,
  children,
}: EditorLayoutProps) {
  return (
    <div className="simple-editor-wrapper">
      {headerBefore}
      {title}
      {headerAfter}
      <motion.div
        className="simple-editor-toolbar-stage"
        initial={false}
        animate={isFullscreen ? 'fullscreen' : 'normal'}
        variants={toolbarStageVariants}
      >
        {toolbar}
      </motion.div>
      {search}
      <motion.div
        className="simple-editor-content-stage"
        layout
        transition={editorLayoutTransition}
      >
        {children}
      </motion.div>
    </div>
  );
}
