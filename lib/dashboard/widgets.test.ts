import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WIDGETS,
  parseDashboardWidgets,
  serializeDashboardWidgets,
  WIDGET_IDS,
} from './widgets';

describe('parseDashboardWidgets', () => {
  it('falls back to all visible widgets on null', () => {
    expect(parseDashboardWidgets(null)).toEqual(DEFAULT_WIDGETS);
  });

  it('round-trips order and hidden flags', () => {
    const raw = '-savedViews,journalHealth,stats';
    const parsed = parseDashboardWidgets(raw);
    expect(parsed[0]).toEqual({ id: 'savedViews', hidden: true });
    expect(parsed[1]).toEqual({ id: 'journalHealth', hidden: false });
    expect(parsed[2]).toEqual({ id: 'stats', hidden: false });
    expect(serializeDashboardWidgets(parsed)).toBe(
      '-savedViews,journalHealth,stats,trends,upcomingBills,recentTransactions,budgets'
    );
  });

  it('drops unknown ids, dedupes, and appends missing widgets visible', () => {
    const parsed = parseDashboardWidgets('bogus,stats,stats,-stats');
    expect(parsed.map(({ id }) => id)).toEqual([
      'stats',
      ...WIDGET_IDS.filter((id) => id !== 'stats'),
    ]);
    expect(parsed.every(({ hidden }) => !hidden)).toBe(true);
  });
});
