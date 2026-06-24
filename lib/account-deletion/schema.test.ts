import { describe, it, expect } from 'vitest';
import { deletionCodeSchema } from './schema';

describe('deletionCodeSchema', () => {
  it('accepts exactly 6 digits', () => {
    expect(deletionCodeSchema.safeParse('012345').success).toBe(true);
  });
  it('rejects fewer than 6 digits', () => {
    expect(deletionCodeSchema.safeParse('12345').success).toBe(false);
  });
  it('rejects more than 6 digits', () => {
    expect(deletionCodeSchema.safeParse('1234567').success).toBe(false);
  });
  it('rejects non-numeric input', () => {
    expect(deletionCodeSchema.safeParse('12a456').success).toBe(false);
  });
});
