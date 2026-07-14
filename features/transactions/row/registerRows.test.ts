import { describe, expect, it } from 'vitest';
import { parseAccountRegister } from './registerRows';

describe('parseAccountRegister', () => {
  it('parses date/payee/amount/total and extracts the uid from the note', () => {
    const stdout =
      'NNN2026/01/01|Coffee|$ -5.00|$ -5.00| :uid: 01HZY0Z9QK8G7F6E5D4C3B2A1Z';
    const [row] = parseAccountRegister(stdout);
    expect(row.date).toBe('2026/01/01');
    expect(row.payee).toBe('Coffee');
    expect(row.amount).toBe('$ -5.00');
    expect(row.runningTotal).toBe('$ -5.00');
    expect(row.uid).toBe('01HZY0Z9QK8G7F6E5D4C3B2A1Z');
  });

  it('has no uid when the note lacks one (actions disabled downstream)', () => {
    const stdout = 'NNN2026/01/02|Book|$ -20.00|$ -25.00|';
    const [row] = parseAccountRegister(stdout);
    expect(row.uid).toBeUndefined();
  });

  it('keeps a multi-commodity running total intact and preserves a note pipe', () => {
    const stdout =
      'NNN2026/03/01|Split|KIRT 100|$ -5.00\nKIRT 100|a|b :uid: 01HZY0Z9QK8G7F6E5D4C3B2A1Z';
    const [row] = parseAccountRegister(stdout);
    expect(row.runningTotal).toBe('$ -5.00\nKIRT 100');
    expect(row.uid).toBe('01HZY0Z9QK8G7F6E5D4C3B2A1Z');
  });
});
