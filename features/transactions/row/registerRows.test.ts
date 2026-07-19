import { describe, expect, it } from 'vitest';
import {
  FIELD_SEPARATOR,
  RECORD_SEPARATOR,
  parseAccountRegister,
} from './registerRows';

// Build a register line the way ledger would, using the real separators.
const row = (...fields: string[]) =>
  `${RECORD_SEPARATOR}${fields.join(FIELD_SEPARATOR)}\n`;

describe('parseAccountRegister', () => {
  it('parses date/payee/amount/total and extracts the uid from the note', () => {
    const stdout = row(
      '2026/01/01',
      'Coffee',
      '$ -5.00',
      '$ -5.00',
      ' :uid: 01HZY0Z9QK8G7F6E5D4C3B2A1Z'
    );
    const [parsed] = parseAccountRegister(stdout);
    expect(parsed.date).toBe('2026/01/01');
    expect(parsed.payee).toBe('Coffee');
    expect(parsed.amount).toBe('$ -5.00');
    expect(parsed.runningTotal).toBe('$ -5.00');
    expect(parsed.uid).toBe('01HZY0Z9QK8G7F6E5D4C3B2A1Z');
  });

  it('has no uid when the note lacks one (actions disabled downstream)', () => {
    const stdout = row('2026/01/02', 'Book', '$ -20.00', '$ -25.00', '');
    const [parsed] = parseAccountRegister(stdout);
    expect(parsed.uid).toBeUndefined();
  });

  it('keeps a multi-commodity running total intact and preserves a note pipe', () => {
    const stdout = row(
      '2026/03/01',
      'Split',
      'KIRT 100',
      '$ -5.00\nKIRT 100',
      'a|b :uid: 01HZY0Z9QK8G7F6E5D4C3B2A1Z'
    );
    const [parsed] = parseAccountRegister(stdout);
    expect(parsed.runningTotal).toBe('$ -5.00\nKIRT 100');
    expect(parsed.uid).toBe('01HZY0Z9QK8G7F6E5D4C3B2A1Z');
  });

  it('parses a row whose uid contains the old "NNN" marker without corruption', () => {
    // Regression: a ULID may contain "NNN" (its alphabet includes N). Splitting
    // on "NNN" shifted the next chunk into an "Invalid Date" row and dropped
    // the uid. Control-char separators keep the row and uid intact.
    const stdout =
      row(
        '2026/07/12',
        'ghaza khoshk',
        'KIRT -9000',
        'KIRT -9000',
        ' :uid: 01HZXNNN8E5T0DJC5G5KJDQRYK'
      ) + row('2026/07/10', 'earlier', 'KIRT -100', 'KIRT -9100', '');
    const rows = parseAccountRegister(stdout);
    expect(rows).toHaveLength(2);
    expect(rows[0].date).toBe('2026/07/12');
    expect(rows[0].uid).toBe('01HZXNNN8E5T0DJC5G5KJDQRYK');
    expect(rows[1].date).toBe('2026/07/10');
  });
});
