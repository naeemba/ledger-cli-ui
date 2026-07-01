import { describe, it, expect } from 'vitest';
import { balanceDisplay } from './balanceDisplay';

describe('balanceDisplay', () => {
  it('asset with money is in your favor, no chip', () => {
    expect(balanceDisplay('asset', 2340)).toEqual({ direction: 'favor' });
  });
  it('overdrawn asset is against you, with overdrawn chip', () => {
    expect(balanceDisplay('asset', -50)).toEqual({
      direction: 'against',
      chip: 'overdrawn',
    });
  });
  it('liability you owe (credit balance) is against you, no chip', () => {
    expect(balanceDisplay('liability', -500)).toEqual({ direction: 'against' });
  });
  it('reversed liability (they owe you) is in your favor, with owed-to-you chip', () => {
    expect(balanceDisplay('liability', 200)).toEqual({
      direction: 'favor',
      chip: 'owed to you',
    });
  });
  it('income earned (credit balance) is in your favor, no chip', () => {
    expect(balanceDisplay('income', -5000)).toEqual({ direction: 'favor' });
  });
  it('reversed income (refund/reversal) is against you, with reduced chip', () => {
    expect(balanceDisplay('income', 80)).toEqual({
      direction: 'against',
      chip: 'reduced',
    });
  });
  it('expense spent (debit balance) is against you, no chip', () => {
    expect(balanceDisplay('expense', 412)).toEqual({ direction: 'against' });
  });
  it('rebated expense (credit balance) is in your favor, with refunded chip', () => {
    expect(balanceDisplay('expense', -30)).toEqual({
      direction: 'favor',
      chip: 'refunded',
    });
  });
  it('zero balance is neutral (favor), no chip', () => {
    expect(balanceDisplay('liability', 0)).toEqual({ direction: 'favor' });
  });
  it('equity/unknown show direction by raw sign, no chip', () => {
    expect(balanceDisplay('equity', -1000)).toEqual({ direction: 'against' });
    expect(balanceDisplay('unknown', 20)).toEqual({ direction: 'favor' });
  });
});
