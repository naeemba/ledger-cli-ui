import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import formatAmount from './formatAmount';

const html = (node: React.ReactNode): string => renderToStaticMarkup(node);

describe('formatAmount', () => {
  it('renders an em-dash placeholder for empty input', () => {
    expect(html(formatAmount('', true))).toContain('—');
    expect(html(formatAmount(null, true))).toContain('—');
    expect(html(formatAmount(undefined, true))).toContain('—');
  });

  it('formats a positive unit-less amount with the positive color class', () => {
    const out = html(formatAmount('42', true));
    expect(out).toContain('42');
    expect(out).toContain('text-positive');
    expect(out).not.toContain('text-negative');
  });

  it('formats a negative unit-less amount with the negative color class and parens', () => {
    const out = html(formatAmount('-42', true));
    expect(out).toContain('text-negative');
    expect(out).toMatch(/\(42\.000\)/);
  });

  it('renders unit prefix when withUnit is true and stdout has a unit', () => {
    const out = html(formatAmount('USD 100', true));
    expect(out).toContain('USD');
    expect(out).toContain('100');
  });

  it('omits unit prefix when withUnit is false', () => {
    const out = html(formatAmount('USD 100', false));
    expect(out).not.toContain('USD');
    expect(out).toContain('100');
  });

  it('formats a negative amount with comma thousands', () => {
    const out = html(formatAmount('USD -1234567.89', true));
    expect(out).toContain('text-negative');
    expect(out).toMatch(/1,234,567\.890/);
  });
});
