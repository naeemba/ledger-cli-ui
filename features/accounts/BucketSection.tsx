// features/accounts/BucketSection.tsx
'use client';

import { useState } from 'react';

type Props = {
  title: string;
  count: number;
  defaultOpen: boolean;
  forceOpen?: boolean;
  children: React.ReactNode;
};

const BucketSection = ({
  title,
  count,
  defaultOpen,
  forceOpen = false,
  children,
}: Props) => {
  const [open, setOpen] = useState(defaultOpen);
  const expanded = forceOpen || open;
  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span aria-hidden="true" className="text-muted-foreground">
          {expanded ? '▾' : '▸'}
        </span>
        <h2 className="text-sm font-semibold uppercase tracking-wider">
          {title}
        </h2>
        <span className="ml-auto text-xs text-muted-foreground">{count}</span>
      </button>
      {expanded && <div className="border-t border-border p-2">{children}</div>}
    </section>
  );
};

export default BucketSection;
