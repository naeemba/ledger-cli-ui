// features/transactions/TransactionList.tsx
'use client';

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
  const [page, setPage] = useState<{
    rows: TransactionRowData[];
    nextOffset: number | null;
  }>({ rows: initialRows, nextOffset: initialNextOffset });
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

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

  // Load the next page when the sentinel below the list scrolls into view.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: '600px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  if (total === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        No matches. Try clearing the filters.
      </div>
    );
  }

  return (
    <div>
      {page.rows.map((row) => (
        <TransactionRow key={rowKey(row)} view={transactionRowToView(row)} />
      ))}
      {page.nextOffset !== null && <div ref={sentinelRef} aria-hidden />}
    </div>
  );
};

export default TransactionList;
