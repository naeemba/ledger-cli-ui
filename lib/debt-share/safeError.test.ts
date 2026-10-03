import { describe, expect, it } from 'vitest';
import { safeErrorFields } from './safeError';

describe('safeErrorFields', () => {
  it('keeps only name and code, never command, stderr or message', () => {
    const error = Object.assign(
      new Error('Command failed: ledger -- ^Assets:Receivable:Bashir'),
      {
        code: 1,
        cmd: 'ledger bal -- ^Assets:Receivable:Bashir',
        stderr: 'While parsing "Lent cash Bashir"',
      }
    );
    const fields = safeErrorFields(error);
    expect(fields).toEqual({ errorName: 'Error', code: 1 });
    expect(JSON.stringify(fields)).not.toContain('Bashir');
  });

  it('returns nothing for non-error values', () => {
    expect(safeErrorFields('Bashir')).toEqual({});
    expect(safeErrorFields(null)).toEqual({});
  });
});
