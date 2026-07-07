'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TableScroll } from '@/components/ui/table';
import type { PricePoint } from '@/lib/prices';
import Link from 'next/link';

type Props = { symbol: string; points: PricePoint[] };

const priceFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 8,
});

export const PriceHistoryView = ({ symbol, points }: Props) => {
  const quote = points.at(-1)?.quote ?? '';

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4">
      <header className="space-y-1">
        <Link
          href="/prices"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to prices
        </Link>
        <h1 className="text-2xl font-semibold">{symbol} price history</h1>
      </header>

      {points.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Ledger has no price history for {symbol}.
        </p>
      ) : (
        <>
          <div className="h-72 w-full rounded-2xl border border-border bg-card p-4 shadow-sm">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={points}
                margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} minTickGap={24} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  width={72}
                  domain={['auto', 'auto']}
                  tickFormatter={(value) =>
                    priceFormatter.format(value as number)
                  }
                />
                <Tooltip
                  formatter={(value) => [
                    `${priceFormatter.format(value as number)} ${quote}`,
                    'Price',
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <TableScroll bleed={false}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="text-right">Price</th>
                    <th>Quote</th>
                  </tr>
                </thead>
                <tbody>
                  {[...points].reverse().map((point) => (
                    <tr key={`${point.date}-${point.price}`}>
                      <td className="whitespace-nowrap text-muted-foreground">
                        {point.date}
                      </td>
                      <td className="text-right tabular-nums whitespace-nowrap">
                        {priceFormatter.format(point.price)}
                      </td>
                      <td className="whitespace-nowrap">{point.quote}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </div>
        </>
      )}
    </div>
  );
};
