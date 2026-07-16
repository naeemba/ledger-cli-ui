'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { setDashboardWidgetsAction } from '@/features/settings/actions';
import {
  WIDGET_LABELS,
  serializeDashboardWidgets,
  type WidgetSetting,
} from '@/lib/dashboard/widgets';

type Props = { initial: WidgetSetting[] };

const move = (
  arr: WidgetSetting[],
  from: number,
  to: number
): WidgetSetting[] => {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

const DashboardWidgetsForm = ({ initial }: Props) => {
  const [widgets, setWidgets] = useState<WidgetSetting[]>(initial);
  const [pending, startTransition] = useTransition();
  const dirty =
    serializeDashboardWidgets(widgets) !== serializeDashboardWidgets(initial);

  const onSave = () => {
    startTransition(async () => {
      const result = await setDashboardWidgetsAction(widgets);
      if (result.ok) toast.success('Dashboard layout saved');
      else toast.error(result.message);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2">
        {widgets.map(({ id, hidden }, i) => (
          <li
            key={id}
            className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
          >
            <span
              className={`text-sm font-medium ${hidden ? 'text-muted-foreground line-through' : ''}`}
            >
              {WIDGET_LABELS[id]}
            </span>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`${hidden ? 'Show' : 'Hide'} ${WIDGET_LABELS[id]}`}
                onClick={() =>
                  setWidgets((w) =>
                    w.map((item) =>
                      item.id === id ? { ...item, hidden: !item.hidden } : item
                    )
                  )
                }
              >
                {hidden ? 'Show' : 'Hide'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Move ${WIDGET_LABELS[id]} up`}
                disabled={i === 0}
                onClick={() => setWidgets((w) => move(w, i, i - 1))}
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Move ${WIDGET_LABELS[id]} down`}
                disabled={i === widgets.length - 1}
                onClick={() => setWidgets((w) => move(w, i, i + 1))}
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

export default DashboardWidgetsForm;
