'use client';

import { priceFormatter } from './format.util';
import { TableScroll } from '@/components/ui/table';
import type { KnownPrice } from '@/lib/prices';
import Link from 'next/link';

type Props = { rows: KnownPrice[] };

const sourceLabel: Record<KnownPrice['source'], string> = {
  fetched: 'Fetched',
  manual: 'Manual',
  journal: 'Journal',
  base: 'Base',
  none: '—',
};

const ageLabel = (row: KnownPrice): string => {
  if (row.ageDays === null) return '—';
  if (row.ageDays === 0) return 'today';
  if (row.ageDays === 1) return '1 day ago';
  return `${row.ageDays} days ago`;
};

export const KnownPricesView = ({ rows }: Props) => (
  <div className="space-y-3">
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <TableScroll bleed={false}>
        <table>
          <thead>
            <tr>
              <th>Commodity</th>
              <th className="text-right">Latest price</th>
              <th>Date</th>
              <th>Age</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="py-6 text-center text-muted-foreground"
                >
                  No commodities
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.symbol}>
                  <td className="font-medium">
                    <Link
                      href={`/prices/${encodeURIComponent(row.symbol)}`}
                      className="hover:underline"
                    >
                      {row.symbol}
                    </Link>
                  </td>
                  <td className="text-right tabular-nums whitespace-nowrap">
                    {row.price === null ? (
                      <span className="text-muted-foreground">no price</span>
                    ) : (
                      `${priceFormatter.format(row.price)} ${row.quote ?? ''}`.trim()
                    )}
                  </td>
                  <td className="whitespace-nowrap text-muted-foreground">
                    {row.date ?? '—'}
                  </td>
                  <td className="whitespace-nowrap">
                    <span
                      className={
                        row.stale
                          ? 'text-amber-600 dark:text-amber-500'
                          : 'text-muted-foreground'
                      }
                    >
                      {ageLabel(row)}
                      {row.stale ? ' · stale' : ''}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-muted-foreground">
                    {sourceLabel[row.source]}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableScroll>
    </div>
  </div>
);
