'use client';

import { ChevronsUpDown } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { CommoditySuggestion } from '@/features/currencies/actions';
import { searchCommoditiesAction } from '@/features/currencies/actions';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

type Props = {
  value: string;
  onSelect: (suggestion: CommoditySuggestion) => void;
  onFreeText?: (raw: string) => void;
  placeholder?: string;
  triggerClassName?: string;
};

const CommodityCombobox = ({
  value,
  onSelect,
  onFreeText,
  placeholder = 'Search commodities…',
  triggerClassName,
}: Props) => {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<CommoditySuggestion[]>([]);
  const [isPending, startSearch] = React.useTransition();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery('');
      setResults([]);
    }
  };

  const commit = (suggestion: CommoditySuggestion) => {
    onSelect(suggestion);
    handleOpenChange(false);
  };

  React.useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const handle = setTimeout(() => {
      startSearch(async () => {
        const found = await searchCommoditiesAction(trimmed);
        setResults(found);
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const trimmedQuery = query.trim();
  // Do not show stale results when the query box is empty.
  const displayedResults = trimmedQuery ? results : [];

  const emptyMessage =
    isPending && trimmedQuery
      ? 'Searching…'
      : trimmedQuery
        ? 'No matches'
        : 'Start typing to search';

  const trigger = (
    <Button
      type="button"
      variant="outline"
      role="combobox"
      aria-expanded={open}
      className={cn(
        'w-full justify-between font-normal',
        !value && 'text-muted-foreground',
        triggerClassName
      )}
    >
      <span className="truncate">{value || placeholder}</span>
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  );

  const list = (
    <>
      <CommandInput
        placeholder={placeholder}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{emptyMessage}</CommandEmpty>
        {displayedResults.length > 0 && (
          <CommandGroup>
            {displayedResults.map((suggestion) => (
              <CommandItem
                key={`${suggestion.kind}:${suggestion.symbol}:${suggestion.providerId ?? ''}`}
                value={`${suggestion.kind}:${suggestion.symbol}:${suggestion.providerId ?? ''}`}
                onSelect={() => commit(suggestion)}
              >
                <div className="flex flex-col gap-0.5">
                  <span>{suggestion.label}</span>
                  {suggestion.detail !== null && (
                    <span className="text-xs text-muted-foreground">
                      {suggestion.detail}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {onFreeText && trimmedQuery && (
          <CommandGroup>
            <CommandItem
              value={`freetext:${trimmedQuery}`}
              onSelect={() => {
                onFreeText(trimmedQuery);
                handleOpenChange(false);
              }}
            >
              Use &quot;{trimmedQuery}&quot;
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </>
  );

  // On touch screens a floating popover is fragile: the soft keyboard reflows
  // the layout and Base UI's hardcoded "sloppy" touch dismissal closes the
  // popup mid-tap, discarding the search. A modal dialog keeps the input and
  // list anchored so the create-new affordance stays reachable. The Command
  // wrapper must carry shouldFilter={false} since results are pre-filtered by
  // the server action; inlining the dialog (rather than using CommandDialog)
  // is the only way to thread that prop through.
  if (isMobile) {
    return (
      <>
        {React.cloneElement(trigger, { onClick: () => setOpen(true) })}
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent
            className="top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0"
            showCloseButton={false}
          >
            <DialogHeader className="sr-only">
              <DialogTitle>{placeholder}</DialogTitle>
              <DialogDescription>
                Search commodities or type a new value
              </DialogDescription>
            </DialogHeader>
            <Command shouldFilter={false}>{list}</Command>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent className="w-(--anchor-width) min-w-56 p-0" align="start">
        <Command shouldFilter={false}>{list}</Command>
      </PopoverContent>
    </Popover>
  );
};

export default CommodityCombobox;
