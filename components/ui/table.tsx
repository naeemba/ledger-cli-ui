import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * TableScroll — reusable responsive scroll container for wide data tables.
 *
 * On mobile a wide `<table>` overflows the viewport and clips. Wrapping it in
 * `<TableScroll>` makes only the table scroll horizontally (with iOS momentum)
 * while the rest of the page stays put. It also:
 *  - bleeds to the card edges on mobile (`-mx-3`) so the scroll track uses the
 *    full width, then restores normal flow at `sm:` (`sm:mx-0`);
 *  - re-applies a small inner gutter on mobile (`px-3`) so text isn't flush
 *    against the screen edge, removed again at `sm:` so desktop is unchanged.
 *
 * Designed to wrap raw `<table>` elements (the app's current pattern) as well
 * as the shadcn `<Table>` primitive below. M1 PRs consume this directly.
 */
function TableScroll({
  className,
  bleed = true,
  ...props
}: React.ComponentProps<'div'> & {
  /**
   * When true (default) the container bleeds to the card edges on mobile with a
   * matching inner gutter so content breathes. Set false to keep the scroll
   * container within the normal content box (no negative margins).
   */
  bleed?: boolean;
}) {
  return (
    <div
      data-slot="table-scroll"
      className={cn(
        'w-full overflow-x-auto [-webkit-overflow-scrolling:touch]',
        bleed && '-mx-3 px-3 sm:mx-0 sm:px-0',
        className
      )}
      {...props}
    />
  );
}

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <TableScroll>
      <table
        data-slot="table"
        className={cn('w-full caption-bottom text-sm', className)}
        {...props}
      />
    </TableScroll>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('[&_tr]:border-b', className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'border-t bg-muted/50 font-medium [&>tr]:last:border-b-0',
        className
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
        className
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Table,
  TableScroll,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
