import { describe, it, expect } from 'vitest';
import { fingerprintDraft } from './fingerprint';

describe('fingerprintDraft', () => {
  const base = {
    date: '2024-09-01',
    payee: 'lunch',
    status: 'none' as const,
    uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
    postings: [
      { account: 'Expenses:Food', amount: '10', currency: 'USD' },
      { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
    ],
  };

  it('returns a 64-char hex string', () => {
    const fp = fingerprintDraft(base);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable across identical drafts', () => {
    expect(fingerprintDraft(base)).toBe(fingerprintDraft(base));
  });

  it('changes when any field changes', () => {
    const baseFp = fingerprintDraft(base);
    expect(fingerprintDraft({ ...base, payee: 'dinner' })).not.toBe(baseFp);
    expect(
      fingerprintDraft({
        ...base,
        postings: [
          ...base.postings.slice(0, 1),
          { ...base.postings[1], amount: '-11' },
        ],
      })
    ).not.toBe(baseFp);
  });
});
