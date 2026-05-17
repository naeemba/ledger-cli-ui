'use client';

import { SearchIcon } from 'lucide-react';
import * as React from 'react';
import { useCommandPalette } from './CommandPaletteContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Platform doesn't change during a session, so this "store" is static —
// useSyncExternalStore is just the cleanest way to read a client-only value
// without warring with the set-state-in-effect rule.
const subscribePlatform = () => () => {};
const getMacSnapshot = () => {
  const platform =
    (
      navigator as Navigator & {
        userAgentData?: { platform?: string };
      }
    ).userAgentData?.platform ?? navigator.platform;
  return /Mac|iPhone|iPad|iPod/i.test(platform);
};
const getMacServerSnapshot = () => false;

const CommandPaletteTrigger = ({ className }: { className?: string }) => {
  const { setOpen } = useCommandPalette();
  const isMac = React.useSyncExternalStore(
    subscribePlatform,
    getMacSnapshot,
    getMacServerSnapshot
  );
  const shortcut = isMac ? '⌘ K' : 'Ctrl K';

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setOpen(true)}
      aria-label="Search pages"
      className={cn(
        'h-8 justify-between gap-2 font-normal text-muted-foreground',
        className
      )}
    >
      <span className="flex items-center gap-2">
        <SearchIcon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Search pages…</span>
      </span>
      <kbd className="pointer-events-none ml-2 hidden h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
        {shortcut}
      </kbd>
    </Button>
  );
};

export default CommandPaletteTrigger;
