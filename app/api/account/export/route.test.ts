import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import AdmZip from 'adm-zip';
import { buildJournalZip } from './route';

describe('buildJournalZip', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zip-test-'));
    await fs.writeFile(path.join(dir, 'main.ledger'), '; main\n');
    await fs.mkdir(path.join(dir, 'sub'), { recursive: true });
    await fs.writeFile(path.join(dir, 'sub', 'jan.ledger'), '; jan\n');
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('zips every file with its relative path', async () => {
    const buf = await buildJournalZip(dir);
    const names = new AdmZip(buf)
      .getEntries()
      .map((e) => e.entryName)
      .sort();
    expect(names).toEqual(['main.ledger', 'sub/jan.ledger']);
  });

  it('preserves file contents', async () => {
    const buf = await buildJournalZip(dir);
    const entry = new AdmZip(buf).getEntry('main.ledger');
    expect(entry?.getData().toString('utf-8')).toBe('; main\n');
  });
});
