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

  it('encode/decode cursor round-trips', () => {
    const createdAt = new Date('2026-06-26T14:02:03.000Z');
    const token = encodeCursor({ createdAt, id: '01HSAMPLE' });
    const back = decodeCursor(token);
    expect(back?.id).toBe('01HSAMPLE');
    expect(back?.createdAt.getTime()).toBe(createdAt.getTime());
  });

  it('decodeCursor rejects garbage', () => {
    expect(decodeCursor(undefined)).toBeUndefined();
    expect(decodeCursor('')).toBeUndefined();
    expect(decodeCursor('notanumber_id')).toBeUndefined();
    expect(decodeCursor('123')).toBeUndefined();
  });

  it('buildActivityQuery omits defaults and includes cursor', () => {
    expect(buildActivityQuery({ type: 'all', result: 'all' })).toBe('');
    expect(
      buildActivityQuery({
        type: 'security',
        result: 'failure',
        before: '123_x',
      })
    ).toBe('?type=security&result=failure&before=123_x');
  });
});
