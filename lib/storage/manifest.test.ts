import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import {
  fingerprint,
  keyFor,
  localPathFor,
  readManifest,
  relPathFromKey,
  userPrefix,
  writeManifest,
} from './manifest';
import { getJournalDir } from '@/lib/journal/layout';

const USER = 'manifest-user';
afterEach(() => fs.rm(getJournalDir(USER), { recursive: true, force: true }));

describe('key helpers', () => {
  it('builds and reverses keys', () => {
    expect(userPrefix(USER)).toBe(`journals/${USER}/`);
    expect(keyFor(USER, 'sub/a.ledger')).toBe(`journals/${USER}/sub/a.ledger`);
    expect(relPathFromKey(USER, `journals/${USER}/sub/a.ledger`)).toBe(
      'sub/a.ledger'
    );
    expect(localPathFor(USER, 'a.ledger')).toBe(
      path.join(getJournalDir(USER), 'a.ledger')
    );
  });
});

describe('manifest io', () => {
  it('returns {} when no manifest exists', async () => {
    expect(await readManifest(USER)).toEqual({});
  });

  it('round-trips a manifest', async () => {
    await writeManifest(USER, { 'main.ledger': 'etag1' });
    expect(await readManifest(USER)).toEqual({ 'main.ledger': 'etag1' });
  });
});

describe('fingerprint', () => {
  it('is order-independent and changes with content', () => {
    const a = fingerprint([
      { key: 'k1', etag: 'e1' },
      { key: 'k2', etag: 'e2' },
    ]);
    const b = fingerprint([
      { key: 'k2', etag: 'e2' },
      { key: 'k1', etag: 'e1' },
    ]);
    const c = fingerprint([
      { key: 'k1', etag: 'eX' },
      { key: 'k2', etag: 'e2' },
    ]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('is a deterministic 64-char hex string for the empty set', () => {
    expect(fingerprint([])).toMatch(/^[a-f0-9]{64}$/);
  });
});
