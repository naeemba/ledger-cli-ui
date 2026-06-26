import { describe, expect, it } from 'vitest';
import {
  buildActivityQuery,
  decodeCursor,
  encodeCursor,
  parseResult,
  parseType,
} from './params';

describe('activity params', () => {
  it('parseType accepts known values and defaults to all', () => {
    expect(parseType('security')).toBe('security');
    expect(parseType('transactions')).toBe('transactions');
    expect(parseType('bogus')).toBe('all');
    expect(parseType(undefined)).toBe('all');
  });

  it('parseResult accepts known values and defaults to all', () => {
    expect(parseResult('failure')).toBe('failure');
    expect(parseResult('nope')).toBe('all');
    expect(parseResult(undefined)).toBe('all');
  });

  it('encode/decode cursor round-trips a ULID id', () => {
    const id = '01KW2SBP2HX0HR2QGZ7QEGD50D';
    const token = encodeCursor({ id });
    expect(token).toBe(id);
    expect(decodeCursor(token)).toEqual({ id });
  });

  it('decodeCursor rejects garbage', () => {
    expect(decodeCursor(undefined)).toBeUndefined();
    expect(decodeCursor('')).toBeUndefined();
    expect(decodeCursor('notaulid')).toBeUndefined();
    expect(decodeCursor('123')).toBeUndefined();
    // Lowercase / wrong-length strings are not valid ULIDs.
    expect(decodeCursor('01hsampleulid00000000000000')).toBeUndefined();
  });

  it('buildActivityQuery omits defaults and includes cursor', () => {
    expect(buildActivityQuery({ type: 'all', result: 'all' })).toBe('');
    expect(
      buildActivityQuery({
        type: 'security',
        result: 'failure',
        before: '01KW2SBP2HX0HR2QGZ7QEGD50D',
      })
    ).toBe('?type=security&result=failure&before=01KW2SBP2HX0HR2QGZ7QEGD50D');
  });
});
