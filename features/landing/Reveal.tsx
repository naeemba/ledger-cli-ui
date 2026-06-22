'use client';

import * as React from 'react';

type Props = {
  children: React.ReactNode;
  className?: string;
  /** Stagger delay in seconds, applied once the element scrolls into view. */
  delay?: number;
  as?: 'div' | 'section' | 'li' | 'span';
};

/**
 * Reveals its children with a fade-and-rise the first time they enter the
 * viewport. Uses IntersectionObserver so nothing animates off-screen, and
 * degrades to immediately-visible when the observer is unavailable or the user
 * prefers reduced motion (handled in CSS).
 */
export default function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = 'div',
}: Props) {
  const ref = React.useRef<HTMLElement | null>(null);
  const [shown, setShown] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    if (typeof IntersectionObserver === 'undefined') {
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          obs.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [shown]);

  return (
    <Tag
      ref={ref as never}
      className={`lp-reveal${shown ? ' is-in' : ''}${className ? ` ${className}` : ''}`}
      style={{ ['--d' as string]: `${delay}s` }}
    >
      {children}
    </Tag>
  );
}
