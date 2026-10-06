import type { Transition, Variants } from 'motion/react';

export const pageTransition: Transition = {
  duration: 0.18,
  ease: 'easeOut',
};

export const pageVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

export const statusIconVariants: Variants = {
  hidden: { opacity: 0, scale: 0.82 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.92 },
};

export const statusIconTransition: Transition = {
  duration: 0.16,
  ease: 'easeOut',
};
