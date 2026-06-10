import { describe, expect, it } from 'vitest';
import { routeLabel } from './routeLabel';

describe('routeLabel', () => {
  it('labels /transactions', () => {
    expect(routeLabel('/transactions')).toBe('Transactions');
    expect(routeLabel('/transactions?account=Expenses:Food')).toBe(
      'Transactions'
    );
  });
  it('labels /balance and ranged balance', () => {
    expect(routeLabel('/balance')).toBe('Balance');
    expect(routeLabel('/balance/2026-01-01/2026-03-31')).toBe('Balance');
  });
  it('labels /payees with range', () => {
    expect(routeLabel('/payees/2026-01-01/2026-03-31')).toBe('Payees');
  });
  it('labels /registers/monthly with account', () => {
    expect(routeLabel('/registers/monthly/Expenses:Food')).toBe(
      'Register: Expenses:Food'
    );
    expect(routeLabel('/registers/monthly/Expenses%3AFood')).toBe(
      'Register: Expenses:Food'
    );
  });
  it('labels /accounts with account', () => {
    expect(routeLabel('/accounts/Assets:Cash')).toBe('Account: Assets:Cash');
    expect(routeLabel('/accounts/Assets%3ACash')).toBe('Account: Assets:Cash');
  });
  it('falls back to the raw pathname for unknown routes', () => {
    expect(routeLabel('/portfolio')).toBe('/portfolio');
  });
});
