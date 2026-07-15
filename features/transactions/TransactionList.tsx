// features/transactions/TransactionList.tsx
'use client';

import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { loadTransactionPageAction } from './actions';
import { type TransactionFilters } from './applyTransactionFilters';
import { PAGE_SIZE, appendPage } from './pageTransactions';
import TransactionRow from './row/TransactionRow';
import { transactionRowToView } from './row/rowView';
import { type TransactionRow as TransactionRowData } from './transactionRow';

type Props = {
  initialRows: TransactionRowData[];
  total: number;
  initialNextOffset: number | null;
  filters: TransactionFilters;
};

const rowKey = (r: TransactionRowData) => r.uid ?? `${r.file}:${r.startLine}`;

const TransactionList = ({
  initialRows,
  total,
  initialNextOffset,
  filters,
}: Props) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<{
    rows: TransactionRowData[];
    nextOffset: number | null;
  }>({ rows: initialRows, nextOffset: initialNextOffset });
  const loadingRef = useRef(false);
  // Window-scrolled virtualizer needs the list's offset from the top of the
  // document; measured post-mount since refs can't be read during render.
  const [scrollMargin, setScrollMargin] = useState(0);
  useEffect(() => {
    if (parentRef.current) setScrollMargin(parentRef.current.offsetTop);
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: page.rows.length,
    scrollMargin,
    estimateSize: () => 80,
    overscan: 8,
  });

  const loadMore = useCallback(async () => {
    if (loadingRef.current || page.nextOffset === null) return;
    loadingRef.current = true;
    try {
      const next = await loadTransactionPageAction({
        filters,
        offset: page.nextOffset,
        limit: PAGE_SIZE,
      });
      setPage((prev) => appendPage(prev, next));
    } catch {
      toast.error("Couldn't load more transactions.");
    } finally {
      loadingRef.current = false;
    }
  }, [page.nextOffset, filters]);

  const items = virtualizer.getVirtualItems();

  // Prefetch the next page when the last rendered item nears the loaded tail.
  useEffect(() => {
    const last = items[items.length - 1];
    if (!last) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (last.index >= page.rows.length - 10) void loadMore();
  }, [items, page.rows.length, loadMore]);

  if (total === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        No matches. Try clearing the filters.
      </div>
    );
  }

  return (
    <div ref={parentRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {items.map((vi) => {
          const row = page.rows[vi.index];
          return (
            <div
              key={rowKey(row)}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vi.start - scrollMargin}px)`,
              }}
            >
              <TransactionRow view={transactionRowToView(row)} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TransactionList;
