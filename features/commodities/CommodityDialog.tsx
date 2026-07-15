'use client';

import { useState, useTransition } from 'react';
import {
  createCommodityAction,
  deleteCommodityAction,
  updateCommodityAction,
} from './actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CommodityRow } from '@/lib/commodities';

type Mode =
  | { kind: 'create'; symbol: string }
  | { kind: 'edit'; row: CommodityRow }
  | { kind: 'edit-raw'; row: CommodityRow };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  onSaved: () => void;
};

export default function CommodityDialog({
  open,
  onOpenChange,
  mode,
  onSaved,
}: Props) {
  const editingRow = mode.kind !== 'create' ? mode.row : null;
  const symbol = mode.kind === 'create' ? mode.symbol : mode.row.symbol;

  const [note, setNote] = useState(editingRow?.note ?? '');
  const [aliases, setAliases] = useState(editingRow?.aliases.join(', ') ?? '');
  const [decimalPlaces, setDecimalPlaces] = useState(
    editingRow?.decimalPlaces != null ? String(editingRow.decimalPlaces) : ''
  );
  const [nomarket, setNomarket] = useState(editingRow?.nomarket ?? false);
  const [isDefault, setIsDefault] = useState(editingRow?.isDefault ?? false);
  const [raw, setRaw] = useState(mode.kind === 'edit-raw' ? mode.row.raw : '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result =
        mode.kind === 'edit-raw'
          ? await updateCommodityAction({ symbol, raw })
          : mode.kind === 'edit'
            ? await updateCommodityAction({
                symbol,
                definition: {
                  symbol,
                  note: note.trim(),
                  aliases: aliases
                    .split(',')
                    .map((alias) => alias.trim())
                    .filter(Boolean),
                  decimalPlaces:
                    decimalPlaces === '' ? null : Number(decimalPlaces),
                  nomarket,
                  isDefault,
                },
              })
            : await createCommodityAction({
                symbol,
                note: note.trim(),
                aliases: aliases
                  .split(',')
                  .map((alias) => alias.trim())
                  .filter(Boolean),
                decimalPlaces:
                  decimalPlaces === '' ? null : Number(decimalPlaces),
                nomarket,
                isDefault,
              });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(null);
      onSaved();
    });

  const remove = () =>
    startTransition(async () => {
      const result = await deleteCommodityAction({ symbol });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(null);
      onSaved();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode.kind === 'create' ? 'Add definition' : `Edit ${symbol}`}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="commodity-symbol">Symbol</Label>
            <Input id="commodity-symbol" value={symbol} disabled />
          </div>

          {mode.kind === 'edit-raw' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="commodity-raw">Raw definition</Label>
              <textarea
                id="commodity-raw"
                value={raw}
                onChange={(event) => setRaw(event.target.value)}
                rows={8}
                className="w-full rounded-lg border border-input bg-transparent p-2.5 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="commodity-note">Note</Label>
                <Input
                  id="commodity-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="commodity-aliases">
                  Aliases (comma-separated)
                </Label>
                <Input
                  id="commodity-aliases"
                  value={aliases}
                  onChange={(event) => setAliases(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="commodity-decimals">Decimals</Label>
                <Input
                  id="commodity-decimals"
                  type="number"
                  min={0}
                  max={8}
                  value={decimalPlaces}
                  onChange={(event) => setDecimalPlaces(event.target.value)}
                />
              </div>
              <Label htmlFor="commodity-nomarket">
                <input
                  id="commodity-nomarket"
                  type="checkbox"
                  checked={nomarket}
                  onChange={(event) => setNomarket(event.target.checked)}
                />
                No market (never priced automatically)
              </Label>
              <Label htmlFor="commodity-default">
                <input
                  id="commodity-default"
                  type="checkbox"
                  checked={isDefault}
                  onChange={(event) => setIsDefault(event.target.checked)}
                />
                Default commodity
              </Label>
            </>
          )}

          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>

        <DialogFooter showCloseButton>
          {editingRow && (
            <Button variant="destructive" disabled={pending} onClick={remove}>
              Delete
            </Button>
          )}
          <Button disabled={pending} onClick={save}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { Mode as CommodityDialogMode };
