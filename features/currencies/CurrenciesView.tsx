'use client';

import { useState, useTransition } from 'react';
import CommodityCombobox from '@/components/CommodityCombobox/CommodityCombobox';
import { TableScroll } from '@/components/ui/table';
import {
  upsertMappingAction,
  type CommoditySuggestion,
  type MappingRow,
} from '@/features/currencies/actions';

function sortedRows(rows: MappingRow[]): MappingRow[] {
  return [...rows].sort((rowA, rowB) => {
    // Unmapped rows first (need a mapping set), then auto-detected rows (need
    // user confirmation), then confirmed user-set rows.
    const priorityOf = (row: MappingRow): number => {
      if (row.kind === 'unmapped') return 0;
      if (row.source === 'auto') return 1;
      return 2;
    };
    const difference = priorityOf(rowA) - priorityOf(rowB);
    return difference !== 0
      ? difference
      : rowA.symbol.localeCompare(rowB.symbol);
  });
}

function mappedToLabel(row: MappingRow): string {
  if (row.kind === 'unmapped') return '';
  if (row.providerId) return `${row.providerId} (${row.kind})`;
  return `${row.symbol} (${row.kind})`;
}

type Props = {
  rows: MappingRow[];
};

export default function CurrenciesView({ rows: initial }: Props) {
  const [rows, setRows] = useState(() => sortedRows(initial));
  const [isSaving, startSave] = useTransition();
  const [savingSymbol, setSavingSymbol] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = (row: MappingRow, suggestion: CommoditySuggestion) => {
    setSavingSymbol(row.symbol);
    startSave(async () => {
      const result = await upsertMappingAction({
        symbol: row.symbol,
        kind: suggestion.kind,
        providerId: suggestion.providerId,
      });
      setSavingSymbol(null);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(null);
      setRows((previous) =>
        sortedRows(
          previous.map((previousRow) =>
            previousRow.symbol === row.symbol
              ? {
                  ...previousRow,
                  kind: suggestion.kind,
                  providerId: suggestion.providerId,
                  source: 'user',
                }
              : previousRow
          )
        )
      );
    });
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Currencies</h1>
        <p className="text-muted-foreground text-sm">
          Every commodity symbol in your journal. Confirm or override how each
          is tracked for automatic price lookups. Rows highlighted in amber need
          your attention.
        </p>
      </header>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <section className="rounded-lg border p-4 text-sm">
        <p className="mb-1 font-medium">Mapping kinds</p>
        <ul className="text-muted-foreground space-y-0.5">
          <li>
            <span className="text-foreground font-medium">Crypto</span> — price
            fetched automatically from CoinGecko.
          </li>
          <li>
            <span className="text-foreground font-medium">Fiat</span> — priced
            in USD via CoinGecko.
          </li>
          <li>
            <span className="text-foreground font-medium">Manual</span> — no
            automatic pricing; add dated rates on the Prices page.
          </li>
        </ul>
      </section>

      <TableScroll>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-2 pr-4 font-medium">Symbol</th>
              <th className="pb-2 pr-4 font-medium">In use</th>
              <th className="pb-2 pr-4 font-medium">Mapped to</th>
              <th className="pb-2 pr-4 font-medium">Source</th>
              <th className="pb-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const needsReview =
                row.kind === 'unmapped' || row.source === 'auto';
              const isRowSaving = isSaving && savingSymbol === row.symbol;
              return (
                <tr
                  key={row.symbol}
                  className={[
                    'border-b last:border-0',
                    needsReview ? 'bg-amber-50 dark:bg-amber-950/20' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <td className="py-2 pr-4 font-mono font-medium">
                    {row.symbol}
                  </td>
                  <td className="py-2 pr-4">{row.inUse ? 'Yes' : 'No'}</td>
                  <td className="py-2 pr-4">
                    {row.kind === 'unmapped' ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      mappedToLabel(row)
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {row.source === 'user' ? (
                      'User'
                    ) : row.source === 'auto' ? (
                      <span className="text-amber-600 dark:text-amber-400">
                        Auto
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 min-w-48">
                    <CommodityCombobox
                      value={mappedToLabel(row)}
                      onSelect={(suggestion) => handleSelect(row, suggestion)}
                      placeholder="Set mapping…"
                      triggerClassName="h-8 text-xs"
                    />
                    {isRowSaving && (
                      <p className="text-muted-foreground mt-1 text-xs">
                        Saving…
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}
