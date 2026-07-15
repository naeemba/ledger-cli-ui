import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureIncluded } from './include';

const repo = {
  readFile: (p: string) => fs.readFile(p, 'utf-8'),
  writeFileAtomic: async (p: string, c: string) => {
    await fs.writeFile(p, c, 'utf-8');
  },
};

describe('ensureIncluded', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'include-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('prepends an include directive when missing', async () => {
    const main = path.join(dir, 'main.ledger');
    await fs.writeFile(main, '2026-01-01 x\n', 'utf-8');
    await ensureIncluded(repo, main, path.join(dir, 'definitions.ledger'));
    expect(await fs.readFile(main, 'utf-8')).toBe(
      'include ./definitions.ledger\n2026-01-01 x\n'
    );
  });

  it('is idempotent', async () => {
    const main = path.join(dir, 'main.ledger');
    await fs.writeFile(main, 'include ./definitions.ledger\n', 'utf-8');
    await ensureIncluded(repo, main, path.join(dir, 'definitions.ledger'));
    expect(await fs.readFile(main, 'utf-8')).toBe(
      'include ./definitions.ledger\n'
    );
  });
});
