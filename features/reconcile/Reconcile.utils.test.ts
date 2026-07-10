import { describe, it, expect } from 'vitest';
import { parseReconcileRows } from './Reconcile.utils';

const NOW = Date.UTC(2026, 4, 22);

describe('parseReconcileRows', () => {
  it('returns an empty array for empty stdout', () => {
    expect(parseReconcileRows('', NOW)).toEqual([]);
  });

  it('parses NNN-delimited rows into typed records', () => {
    const stdout =
      "NNN2026-05-01|Trader Joe's|Expenses:Food|USD 42\n" +
      'NNN2026-05-15|Landlord|Expenses:Rent|USD 1500\n';
    const rows = parseReconcileRows(stdout, NOW);
    expect(rows).toHaveLength(2);
    expect(rows[0].account).toBe('Expenses:Food');
    expect(rows[1].account).toBe('Expenses:Rent');
  });

  it('preserves ledger order (which is oldest-first via --sort date)', () => {
    // ledger emits oldest-first; the parser must not reorder.
    const stdout =
      'NNN2026-01-01|old|Expenses:Rent|USD 1500\n' +
      'NNN2026-05-15|recent|Expenses:Coffee|USD 5\n';
    const rows = parseReconcileRows(stdout, NOW);
    expect(rows[0].account).toBe('Expenses:Rent');
    expect(rows[1].account).toBe('Expenses:Coffee');
    expect(rows[0].days).toBeGreaterThan(rows[1].days);
  });

  it('computes days since the row date', () => {
    const stdout = 'NNN2026-05-15|x|Expenses:Coffee|USD 5\n';
    const rows = parseReconcileRows(stdout, NOW);
    expect(rows[0].days).toBe(7);
  });

  it('skips malformed rows', () => {
    const stdout =
      'NNN\n' + // empty date column
      'NNN2026-05-15|||\n' + // valid (empty payee/account/amount but date present)
      'NNN2026-05-01|p|a|amt\n';
    const rows = parseReconcileRows(stdout, NOW);
    // The fully empty entry is filtered; the others keep going.
    expect(rows.every((r) => r.date)).toBe(true);
  });

  it('trims whitespace from columns', () => {
    const stdout = 'NNN 2026-05-01 |  payee  | account | amount\n';
    const rows = parseReconcileRows(stdout, NOW);
    expect(rows[0].payee).toBe('payee');
    expect(rows[0].account).toBe('account');
    expect(rows[0].amount).toBe('amount');
  });
});
