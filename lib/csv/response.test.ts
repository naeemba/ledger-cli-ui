import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { csvDownload } from './response';

describe('csvDownload', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-24T12:00:00Z'));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('returns a 200 Response with the CSV body and date-stamped attachment headers', async () => {
    const res = csvDownload('a,b\n1,2\n', 'foo');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="foo-2026-05-24.csv"'
    );
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.text()).toBe('a,b\n1,2\n');
  });
});
