import { z } from 'zod';

export const WIDGET_IDS = [
  'stats',
  'trends',
  'upcomingBills',
  'savedViews',
  'recentTransactions',
  'journalHealth',
  'budgets',
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export type WidgetSetting = { id: WidgetId; hidden: boolean };

export const DEFAULT_WIDGETS: WidgetSetting[] = WIDGET_IDS.map((id) => ({
  id,
  hidden: false,
}));

// Canonical human-readable label for each widget. Shared by the Settings
// reorder UI so relabels can never drift from the dashboard sections.
export const WIDGET_LABELS: Record<WidgetId, string> = {
  stats: 'Stat cards',
  trends: 'Net worth & month in review',
  upcomingBills: 'Upcoming bills',
  savedViews: 'Saved views',
  recentTransactions: 'Recent transactions',
  journalHealth: 'Journal health',
  budgets: 'Budgets',
};

export const dashboardWidgetsSchema = z.array(
  z.object({ id: z.enum(WIDGET_IDS), hidden: z.boolean() })
);

const isWidgetId = (value: string): value is WidgetId =>
  (WIDGET_IDS as readonly string[]).includes(value);

// Keep the valid ids in the given order (first occurrence wins), then append
// any canonical widget the caller omitted as visible — so a widget added in a
// later release shows up for users with an older saved order.
export function normalizeWidgets(
  settings: readonly WidgetSetting[] | null | undefined
): WidgetSetting[] {
  const seen = new Set<WidgetId>();
  const result: WidgetSetting[] = [];
  for (const { id, hidden } of settings ?? []) {
    if (isWidgetId(id) && !seen.has(id)) {
      seen.add(id);
      result.push({ id, hidden });
    }
  }
  for (const id of WIDGET_IDS) {
    if (!seen.has(id)) result.push({ id, hidden: false });
  }
  return result;
}

// Serialized as a comma-joined id list; a "-" prefix marks a hidden widget
// (e.g. "stats,-savedViews,trends,...").
export function parseDashboardWidgets(
  raw: string | null | undefined
): WidgetSetting[] {
  if (!raw) return normalizeWidgets(null);
  return normalizeWidgets(
    raw.split(',').map((token) => {
      const hidden = token.startsWith('-');
      return {
        id: (hidden ? token.slice(1) : token) as WidgetId,
        hidden,
      };
    })
  );
}

export function serializeDashboardWidgets(
  settings: readonly WidgetSetting[]
): string {
  return normalizeWidgets(settings)
    .map(({ id, hidden }) => (hidden ? `-${id}` : id))
    .join(',');
}
