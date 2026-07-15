'use client';

import { useState } from 'react';
import CommodityDialog, { type CommodityDialogMode } from './CommodityDialog';
import { Button } from '@/components/ui/button';
import { TableScroll } from '@/components/ui/table';
import type { CommodityRow } from '@/lib/commodities';
import { useRouter } from 'next/navigation';

type UndefinedRow = { symbol: string; undefined: true };

type Props = {
  rows: CommodityRow[];
  observedSymbols: string[];
};

export default function CommoditiesView({ rows, observedSymbols }: Props) {
  const router = useRouter();
  const [dialogMode, setDialogMode] = useState<CommodityDialogMode | null>(
    null
  );

  const knownSymbols = new Set(
    rows.flatMap((row) => [row.symbol, ...row.aliases])
  );
  const undefinedRows: UndefinedRow[] = observedSymbols
    .filter((symbol) => !knownSymbols.has(symbol))
    .map((symbol) => ({ symbol, undefined: true }));

  const closeDialog = () => setDialogMode(null);
  const onSaved = () => {
    closeDialog();
    router.refresh();
  };

  return (
    <>
      <TableScroll>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-2 pr-4 font-medium">Symbol</th>
              <th className="pb-2 pr-4 font-medium">Note</th>
              <th className="pb-2 pr-4 font-medium">Aliases</th>
              <th className="pb-2 pr-4 font-medium">Decimals</th>
              <th className="pb-2 pr-4 font-medium">Flags</th>
              <th className="pb-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.symbol} className="border-b last:border-0">
                <td className="py-2 pr-4 font-mono font-medium">
                  {row.symbol}
                </td>
                <td className="py-2 pr-4">{row.note}</td>
                <td className="py-2 pr-4">{row.aliases.join(', ')}</td>
                <td className="py-2 pr-4">
                  {row.decimalPlaces == null ? '—' : row.decimalPlaces}
                </td>
                <td className="py-2 pr-4">
                  <div className="flex gap-1">
                    {row.nomarket && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        nomarket
                      </span>
                    )}
                    {row.isDefault && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        default
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2">
                  {row.editable ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setDialogMode(
                          row.opaque
                            ? { kind: 'edit-raw', row }
                            : { kind: 'edit', row }
                        )
                      }
                    >
                      {row.opaque ? 'Edit raw' : 'Edit'}
                    </Button>
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      defined in {row.file}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {undefinedRows.map((row) => (
              <tr key={row.symbol} className="border-b last:border-0">
                <td className="py-2 pr-4 font-mono font-medium">
                  {row.symbol}
                </td>
                <td className="py-2 pr-4 text-muted-foreground" colSpan={4}>
                  No definition
                </td>
                <td className="py-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDialogMode({ kind: 'create', symbol: row.symbol })
                    }
                  >
                    Add definition
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>

      {dialogMode && (
        <CommodityDialog
          open={dialogMode !== null}
          onOpenChange={(next) => {
            if (!next) closeDialog();
          }}
          mode={dialogMode}
          onSaved={onSaved}
        />
      )}
    </>
  );
}
