'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { setEntryTabOrderAction } from '@/features/settings/actions';
import { type TabId } from '@/lib/transactions/entryTabs';

const LABELS: Record<TabId, string> = {
  types: 'Types',
  form: 'Form',
  raw: 'Raw',
};

type Props = { initial: TabId[] };

const move = (arr: TabId[], from: number, to: number): TabId[] => {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

const EntryTabOrderForm = ({ initial }: Props) => {
  const [order, setOrder] = useState<TabId[]>(initial);
  const [pending, startTransition] = useTransition();
  const dirty = order.join(',') !== initial.join(',');

  const onSave = () => {
    startTransition(async () => {
      const result = await setEntryTabOrderAction(order);
      if (result.ok) toast.success('Tab order saved');
      else toast.error(result.message);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2">
        {order.map((id, i) => (
          <li
            key={id}
            className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
          >
            <span className="text-sm font-medium">
              {LABELS[id]}
              {i === 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  Default
                </span>
              )}
            </span>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Move ${LABELS[id]} up`}
                disabled={i === 0}
                onClick={() => setOrder((o) => move(o, i, i - 1))}
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Move ${LABELS[id]} down`}
                disabled={i === order.length - 1}
                onClick={() => setOrder((o) => move(o, i, i + 1))}
              >
                ↓
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <div>
        <Button onClick={onSave} disabled={pending || !dirty}>
          Save
        </Button>
      </div>
    </div>
  );
};

export default EntryTabOrderForm;
