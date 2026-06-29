import { describe, it, expect } from 'vitest';
import { negateAmount, absAmount } from './amount';

describe('negateAmount', () => {
  it('prepends a minus to a positive amount', () => {
    expect(negateAmount('42.50')).toBe('-42.50');
  });
  it('strips the minus from a negative amount', () => {
    expect(negateAmount('-42.50')).toBe('42.50');
  });
  it('leaves empty and zero untouched', () => {
    expect(negateAmount('')).toBe('');
    expect(negateAmount('0')).toBe('0');
  });
});

describe('absAmount', () => {
  it('drops a leading minus', () => {
    expect(absAmount('-42.50')).toBe('42.50');
  });
  it('leaves a positive amount untouched', () => {
    expect(absAmount('42.50')).toBe('42.50');
  });
});
