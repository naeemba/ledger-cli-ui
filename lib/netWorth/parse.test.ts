import { describe, it, expect } from 'vitest';
import { parseNetWorthRows } from './parse';

describe('parseNetWorthRows', () => {
  it('returns an empty array for empty input', () => {
    expect(parseNetWorthRows('')).toEqual([]);
  });

  it('parses one row per non-empty NNN-split chunk', () => {
    const stdout = 'NNN2024-01-31|USD 12,000.00\nNNN2024-02-29|USD 12,500.00\n';
    expect(parseNetWorthRows(stdout)).toEqual([
      { date: '2024-01-31', value: 12000 },
      { date: '2024-02-29', value: 12500 },
    ]);
  });

  it('handles bare numeric amounts (no currency prefix)', () => {
    const stdout = 'NNN2024-01-31|12,000.00\n';
    expect(parseNetWorthRows(stdout)).toEqual([
      { date: '2024-01-31', value: 12000 },
    ]);
  });
});
