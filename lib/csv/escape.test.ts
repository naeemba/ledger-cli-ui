import { describe, it, expect } from 'vitest';
import { escapeField, formatRow } from './escape';

describe('escapeField', () => {
  it('passes through plain ascii', () => {
    expect(escapeField('USD')).toBe('USD');
  });
  it('returns empty string for null and undefined', () => {
    expect(escapeField(null)).toBe('');
    expect(escapeField(undefined)).toBe('');
  });
  it('quotes a field containing a comma', () => {
    expect(escapeField('Smith, John')).toBe('"Smith, John"');
  });
  it('quotes and doubles a field containing a double-quote', () => {
    expect(escapeField('say "hi"')).toBe('"say ""hi"""');
  });
  it('quotes a field containing LF', () => {
    expect(escapeField('line1\nline2')).toBe('"line1\nline2"');
  });
  it('quotes a field containing CR', () => {
    expect(escapeField('line1\rline2')).toBe('"line1\rline2"');
  });
});

describe('formatRow', () => {
  it('joins escaped fields with commas', () => {
    expect(formatRow(['a', 'b', 'c'])).toBe('a,b,c');
  });
  it('escapes individual fields', () => {
    expect(formatRow(['a,b', 'c"d', null])).toBe('"a,b","c""d",');
  });
});
