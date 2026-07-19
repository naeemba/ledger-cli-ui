import { describe, it, expect } from 'vitest';
import { parseReconcileRows } from './Reconcile.utils';
import {
  FIELD_SEP,
  RECORD_SEP,
} from '@/features/transactions/row/registerRows';

const NOW = Date.UTC(2026, 4, 22);

// Build a reconcile register line with the real separators, trailing newline
// as ledger emits it.
const row = (...fields: string[]) => `${RECORD_SEP}${fields.join(FIELD_SEP)}\n`;

describe('parseReconcileRows', () => {
  it('returns an empty array for empty stdout', () => {
    expect(parseReconcileRows('', NOW)).toEqual([]);
  });

  it('parses delimited rows into typed records', () => {
    const stdout =
      row('2026-05-01', "Trader Joe's", 'Expenses:Food', 'USD 42') +
      row('2026-05-15', 'Landlord', 'Expenses:Rent', 'USD 1500');
    const rows = parseReconcileRows(stdout, NOW);
    expect(rows).toHaveLength(2);
    expect(rows[0].account).toBe('Expenses:Food');
    expect(rows[1].account).toBe('Expenses:Rent');
  });

  it('preserves ledger order (which is oldest-first via --sort date)', () => {
    const stdout =
      row('2026-01-01', 'old', 'Expenses:Rent', 'USD 1500') +
      row('2026-05-15', 'recent', 'Expenses:Coffee', 'USD 5');
    const rows = parseReconcileRows(stdout, NOW);
    expect(rows[0].account).toBe('Expenses:Rent');
    expect(rows[1].account).toBe('Expenses:Coffee');
    expect(rows[0].days).toBeGreaterThan(rows[1].days);
  });

  it('computes days since the row date', () => {
    const stdout = row('2026-05-15', 'x', 'Expenses:Coffee', 'USD 5');
    const rows = parseReconcileRows(stdout, NOW);
    expect(rows[0].days).toBe(7);
  });

  it('skips malformed rows', () => {
    const stdout =
      row('') + // empty date column
      row('2026-05-15', '', '', '') + // valid (empty fields but date present)
      row('2026-05-01', 'p', 'a', 'amt');
    const rows = parseReconcileRows(stdout, NOW);
    expect(rows.every((r) => r.date)).toBe(true);
  });

  it('trims whitespace from columns', () => {
    const stdout = row(' 2026-05-01 ', '  payee  ', ' account ', ' amount ');
    const rows = parseReconcileRows(stdout, NOW);
    expect(rows[0].payee).toBe('payee');
    expect(rows[0].account).toBe('account');
    expect(rows[0].amount).toBe('amount');
  });

  it('extracts uid from a 5th %(note) column', () => {
    const stdout = row(
      '2026-05-01',
      'Coffee',
      'Expenses:Food',
      'USD 5',
      ' :uid: 01HZY0Z9QK8G7F6E5D4C3B2A1Z'
    );
    const [r] = parseReconcileRows(stdout, NOW);
    expect(r.uid).toBe('01HZY0Z9QK8G7F6E5D4C3B2A1Z');
  });

  it('leaves uid undefined when the note has no uid tag', () => {
    const stdout = row('2026-05-01', 'Coffee', 'Expenses:Food', 'USD 5', '');
    const [r] = parseReconcileRows(stdout, NOW);
    expect(r.uid).toBeUndefined();
  });

  it('rejoins note columns so a separator inside the note cannot drop the uid', () => {
    const stdout = row(
      '2026-05-01',
      'Coffee',
      'Expenses:Food',
      'USD 5',
      'a',
      'b',
      ' :uid: 01HZY0Z9QK8G7F6E5D4C3B2A1Z'
    );
    const [r] = parseReconcileRows(stdout, NOW);
    expect(r.uid).toBe('01HZY0Z9QK8G7F6E5D4C3B2A1Z');
  });
});
