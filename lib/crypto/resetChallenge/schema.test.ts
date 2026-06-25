import { describe, it, expect } from 'vitest';
import { resetCodeSchema } from './schema';

describe('resetCodeSchema', () => {
  it('accepts a valid 6-digit code', () => {
    expect(resetCodeSchema.safeParse('123456').success).toBe(true);
  });

  it('trims whitespace before validating', () => {
    expect(resetCodeSchema.safeParse('  123456  ').success).toBe(true);
  });

  it('rejects fewer than 6 digits', () => {
    expect(resetCodeSchema.safeParse('12345').success).toBe(false);
  });

  it('rejects more than 6 digits', () => {
    expect(resetCodeSchema.safeParse('1234567').success).toBe(false);
  });

  it('rejects non-numeric characters', () => {
    expect(resetCodeSchema.safeParse('12345a').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(resetCodeSchema.safeParse('').success).toBe(false);
  });
});
