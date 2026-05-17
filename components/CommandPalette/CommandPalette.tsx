'use client';

import * as React from 'react';
import { useCommandPalette } from './CommandPaletteContext';
import { getNavSections } from '@/components/nav/config';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useRouter } from 'next/navigation';

const CommandPalette = () => {
  const { open, setOpen } = useCommandPalette();
  const router = useRouter();
  const sections = React.useMemo(() => getNavSections(), []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search pages"
      description="Jump to any page in the app"
    >
      <CommandInput placeholder="Search pages…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        {sections.map((section) => (
          <CommandGroup key={section.id} heading={section.title}>
            {section.items.map((item) => {
              const Icon = item.icon;
              const searchValue = [
                item.title,
                item.description,
                section.title,
                ...(item.keywords ?? []),
              ].join(' ');
              return (
                <CommandItem
                  key={item.id}
                  value={searchValue}
                  onSelect={() => go(item.href)}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate">{item.title}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
};

export default CommandPalette;
