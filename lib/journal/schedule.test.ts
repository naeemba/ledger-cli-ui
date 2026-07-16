import { describe, it, expect } from 'vitest';
import {
  parseSchedule,
  serializeSchedule,
  expandSchedule,
  lastOccurrenceBefore,
} from './schedule';

describe('parseSchedule', () => {
  it('parses every-N form', () => {
    expect(parseSchedule('every 2 weeks from 2026/05/08')).toEqual({
      unit: 'week',
      count: 2,
      anchor: '2026-05-08',
    });
  });
  it('parses singular and alias forms', () => {
    expect(parseSchedule('every month from 2026-01-05')).toEqual({
      unit: 'month',
      count: 1,
      anchor: '2026-01-05',
    });
    expect(parseSchedule('Monthly from 2026/01/05')).toEqual({
      unit: 'month',
      count: 1,
      anchor: '2026-01-05',
    });
  });
  it('rejects anchor-less and freeform periods', () => {
    expect(parseSchedule('Monthly')).toBeNull();
    expect(parseSchedule('every friday')).toBeNull();
  });
});

describe('serializeSchedule', () => {
  it('round-trips through parseSchedule', () => {
    const schedule = { unit: 'month' as const, count: 1, anchor: '2026-01-05' };
    expect(serializeSchedule(schedule)).toBe('every 1 months from 2026/01/05');
    expect(parseSchedule(serializeSchedule(schedule))).toEqual(schedule);
  });
});

describe('expandSchedule', () => {
  const monthly = { unit: 'month' as const, count: 1, anchor: '2026-01-31' };
  it('anchors monthly to day-of-month with short-month clamping', () => {
    expect(expandSchedule(monthly, '2026-01-31', '2026-04-30')).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });
  it('is exclusive of afterExclusive and inclusive of throughInclusive', () => {
    const fifth = { unit: 'month' as const, count: 1, anchor: '2026-01-05' };
    expect(expandSchedule(fifth, '2026-02-05', '2026-04-05')).toEqual([
      '2026-03-05',
      '2026-04-05',
    ]);
  });
  it('keeps biweekly anchored to the anchor weekday', () => {
    const biweekly = { unit: 'week' as const, count: 2, anchor: '2026-05-08' };
    expect(expandSchedule(biweekly, '2026-05-08', '2026-06-20')).toEqual([
      '2026-05-22',
      '2026-06-05',
      '2026-06-19',
    ]);
  });
  it('includes the anchor itself when after the floor', () => {
    const fifth = { unit: 'month' as const, count: 1, anchor: '2026-08-05' };
    expect(expandSchedule(fifth, '2026-07-16', '2026-09-30')).toEqual([
      '2026-08-05',
      '2026-09-05',
    ]);
  });
  it('returns empty when anchor is beyond the window', () => {
    const fifth = { unit: 'month' as const, count: 1, anchor: '2027-01-05' };
    expect(expandSchedule(fifth, '2026-07-16', '2026-08-16')).toEqual([]);
  });
  it('handles yearly Feb 29 clamping', () => {
    const leap = { unit: 'year' as const, count: 1, anchor: '2024-02-29' };
    expect(expandSchedule(leap, '2024-02-29', '2026-03-01')).toEqual([
      '2025-02-28',
      '2026-02-28',
    ]);
  });
  it('does not drop monthly occurrences for a far-past anchor (regression)', () => {
    const monthlySince2000 = {
      unit: 'month' as const,
      count: 1,
      anchor: '2000-01-01',
    };
    expect(
      expandSchedule(monthlySince2000, '2026-07-16', '2026-09-30')
    ).toEqual(['2026-08-01', '2026-09-01']);
  });
  it('does not drop clamped monthly occurrences for a far-past anchor (regression)', () => {
    const monthly31Since2000 = {
      unit: 'month' as const,
      count: 1,
      anchor: '2000-01-31',
    };
    expect(
      expandSchedule(monthly31Since2000, '2026-07-16', '2026-09-30')
    ).toEqual(['2026-07-31', '2026-08-31', '2026-09-30']);
  });
  it('does not drop yearly occurrences for a far-past anchor (regression)', () => {
    const yearlySince1990 = {
      unit: 'year' as const,
      count: 1,
      anchor: '1990-06-15',
    };
    expect(expandSchedule(yearlySince1990, '2026-01-01', '2027-12-31')).toEqual(
      ['2026-06-15', '2027-06-15']
    );
  });
});

describe('lastOccurrenceBefore', () => {
  it('returns the most recent occurrence strictly before the date', () => {
    const fifth = { unit: 'month' as const, count: 1, anchor: '2026-01-05' };
    expect(lastOccurrenceBefore(fifth, '2026-07-16')).toBe('2026-07-05');
    expect(lastOccurrenceBefore(fifth, '2026-01-05')).toBeNull();
  });
  it('does not drop occurrences for a far-past anchor (regression)', () => {
    const monthlySince2000 = {
      unit: 'month' as const,
      count: 1,
      anchor: '2000-01-05',
    };
    expect(lastOccurrenceBefore(monthlySince2000, '2026-07-16')).toBe(
      '2026-07-05'
    );
  });
});
