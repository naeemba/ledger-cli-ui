'use client';

import { ChevronsUpDown } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  emptyMessage?: string;
  allowFreeText?: boolean;
  triggerClassName?: string;
};

const Combobox = ({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  emptyMessage = 'No matches',
  allowFreeText = true,
  triggerClassName,
}: Props) => {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setSearch('');
  };

  const commit = (next: string) => {
    onChange(next);
    handleOpenChange(false);
  };

  const trimmed = search.trim();
  const hasExactMatch = options.some((o) => o === trimmed);

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
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>{emptyMessage}</CommandEmpty>
        {allowFreeText && trimmed && !hasExactMatch && (
          <CommandGroup>
            <CommandItem value={trimmed} onSelect={() => commit(trimmed)}>
              Use &quot;{trimmed}&quot;
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup>
          {options.map((opt) => (
            <CommandItem key={opt} value={opt} onSelect={commit}>
              {opt}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </>
  );

  // On touch screens a floating popover is fragile: the soft keyboard reflows
  // the layout and Base UI's hardcoded "sloppy" touch dismissal closes the
  // popup mid-tap, discarding the search. A modal dialog keeps the input and
  // list anchored so the create-new affordance stays reachable. CommandDialog
  // supplies its own Command wrapper plus sr-only title/description, so the
  // trigger stays a sibling driven by the existing open state.
  if (isMobile) {
    return (
      <>
        {React.cloneElement(trigger, { onClick: () => setOpen(true) })}
        <CommandDialog
          open={open}
          onOpenChange={handleOpenChange}
          title={placeholder}
          description="Search the list or type a new value"
        >
          {list}
        </CommandDialog>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent className="w-(--anchor-width) min-w-56 p-0" align="start">
        <Command>{list}</Command>
      </PopoverContent>
    </Popover>
  );
};

export default Combobox;
