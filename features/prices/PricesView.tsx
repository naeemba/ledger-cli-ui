'use client';

import { Trash2 } from 'lucide-react';
import { useActionState, useState, useTransition } from 'react';
import Combobox from '@/components/Combobox/Combobox';
import CommodityCombobox from '@/components/CommodityCombobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TableScroll } from '@/components/ui/table';
import type { ManualPrice } from '@/db/schema';
import { upsertMappingAction } from '@/features/currencies/actions';
import {
  addManualPricesAction,
  deleteManualPriceAction,
  type PriceActionState,
} from '@/features/prices/actions';
import { formatLedgerInstant } from '@/utils/formatDateCore';

type Row = { symbol: string; price: string };

type Props = {
  prices: ManualPrice[];
  commodities: string[];
  baseCurrency: string;
};

const todayUtc = () => new Date().toISOString().slice(0, 10);

export const PricesView = ({ prices, commodities, baseCurrency }: Props) => {
  const [state, formAction, isPending] = useActionState<
    PriceActionState,
    FormData
  >(addManualPricesAction, { ok: false });

  const [date, setDate] = useState(todayUtc());
  const [time, setTime] = useState('');
  const [quote, setQuote] = useState(baseCurrency);
  const [rows, setRows] = useState<Row[]>([{ symbol: '', price: '' }]);

  const [isDeleting, startDelete] = useTransition();
  const [, startPersist] = useTransition();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = (id: number) => {
    setDeleteError(null);
    setDeletingId(id);
    startDelete(async () => {
      const result = await deleteManualPriceAction(id);
      setDeletingId(null);
      if (!result.ok) setDeleteError(result.message);
    });
  };

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { symbol: '', price: '' }]);
  const removeRow = (i: number) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));

  const draft = JSON.stringify({
    date,
    time: time || undefined,
    quote,
    rows: rows
      .filter((r) => r.symbol.trim() && r.price.trim())
      .map((r) => ({ symbol: r.symbol.trim(), price: Number(r.price) })),
  });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 p-4">
      <header>
        <h1 className="text-2xl font-semibold">Prices</h1>
        <p className="text-muted-foreground text-sm">
          Record exchange rates for commodities (e.g. KIRT) your price provider
          doesn&apos;t cover. Each rate is dated, so historical reports use the
          rate in effect at the time.
        </p>
      </header>

      <form action={formAction} className="space-y-4 rounded-lg border p-4">
        <input type="hidden" name="draft" value={draft} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="price-date">Date</Label>
            <Input
              id="price-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="price-time">Time (optional)</Label>
            <Input
              id="price-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Quote currency</Label>
            <Combobox
              value={quote}
              onChange={setQuote}
              options={commodities}
              placeholder="USD"
              allowFreeText
            />
          </div>
        </div>

        <div className="space-y-2">
          {rows.map((row, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-lg border p-2 sm:flex-row sm:items-end sm:rounded-none sm:border-0 sm:p-0"
            >
              <div className="flex-1 space-y-1">
                {i === 0 && <Label>Commodity</Label>}
                <CommodityCombobox
                  value={row.symbol}
                  placeholder="KIRT"
                  onSelect={(suggestion) => {
                    updateRow(i, { symbol: suggestion.symbol });
                    startPersist(
                      () =>
                        void upsertMappingAction({
                          symbol: suggestion.symbol,
                          kind: suggestion.kind,
                          providerId: suggestion.providerId,
                        })
                    );
                  }}
                  onFreeText={(raw) =>
                    updateRow(i, { symbol: raw.toUpperCase() })
                  }
                />
              </div>
              <div className="flex items-end gap-2 sm:contents">
                <div className="flex-1 space-y-1">
                  {i === 0 && <Label htmlFor={`price-${i}`}>Rate</Label>}
                  <Input
                    id={`price-${i}`}
                    type="number"
                    step="any"
                    min="0"
                    inputMode="decimal"
                    value={row.price}
                    onChange={(e) => updateRow(i, { price: e.target.value })}
                    placeholder="0.0000033"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove row"
                  onClick={() => removeRow(i)}
                  disabled={rows.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            Add another commodity
          </Button>
        </div>

        {state.formError && (
          <p className="text-destructive text-sm">{state.formError}</p>
        )}
        {state.ok && <p className="text-sm text-green-600">Prices saved.</p>}

        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save prices'}
        </Button>
      </form>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">History</h2>
        {deleteError && (
          <p className="text-destructive text-sm">{deleteError}</p>
        )}
        {prices.length === 0 ? (
          <p className="text-muted-foreground text-sm">No manual prices yet.</p>
        ) : (
          <TableScroll>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <th className="py-1 whitespace-nowrap">When</th>
                  <th>Commodity</th>
                  <th className="text-right whitespace-nowrap">Rate</th>
                  <th>Quote</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {prices.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="py-1 whitespace-nowrap">
                      {formatLedgerInstant(new Date(p.pricedAt))}
                    </td>
                    <td>{p.symbol}</td>
                    <td className="text-right tabular-nums whitespace-nowrap">
                      {p.price}
                    </td>
                    <td>{p.quote}</td>
                    <td className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${p.symbol} rate`}
                        disabled={isDeleting && deletingId === p.id}
                        onClick={() => handleDelete(p.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </section>
    </div>
  );
};
