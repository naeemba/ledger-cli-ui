import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AccountDeletionChallengeRepository } from './repository';
import { AccountDeletionService } from './service';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('AccountDeletionService', () => {
  let ctx: TestDbContext;
  let repo: AccountDeletionChallengeRepository;
  let sent: { email: string; code: string }[];
  let purged: string[];
  let nowMs: number;

  const makeService = () =>
    new AccountDeletionService(repo, {
      sendCode: async (email, code) => {
        sent.push({ email, code });
      },
      purge: async (userId) => {
        purged.push(userId);
      },
      now: () => nowMs,
    });

  beforeEach(async () => {
    ctx = await setupTestDb('acct-svc-');
    await ctx.insertUser('alice', 'Alice', 'alice@example.com');
    repo = new AccountDeletionChallengeRepository(ctx.db);
    sent = [];
    purged = [];
    nowMs = 1_000_000;
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('issueCode emails a 6-digit code', async () => {
    const res = await makeService().issueCode('alice', 'alice@example.com');
    expect(res).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].email).toBe('alice@example.com');
    expect(sent[0].code).toMatch(/^\d{6}$/);
  });

  it('issueCode throttles a re-send within 30s', async () => {
    const svc = makeService();
    await svc.issueCode('alice', 'alice@example.com');
    nowMs += 10_000;
    const res = await svc.issueCode('alice', 'alice@example.com');
    expect(res).toEqual({ ok: false, reason: 'throttled' });
    expect(sent).toHaveLength(1);
  });

  it('issueCode allows a re-send after 30s', async () => {
    const svc = makeService();
    await svc.issueCode('alice', 'alice@example.com');
    nowMs += 31_000;
    const res = await svc.issueCode('alice', 'alice@example.com');
    expect(res).toEqual({ ok: true });
    expect(sent).toHaveLength(2);
  });

  it('verifyAndDelete purges on the correct code', async () => {
    const svc = makeService();
    await svc.issueCode('alice', 'alice@example.com');
    const res = await svc.verifyAndDelete('alice', sent[0].code);
    expect(res).toEqual({ ok: true });
    expect(purged).toEqual(['alice']);
  });

  it('verifyAndDelete returns no-code when none issued', async () => {
    const res = await makeService().verifyAndDelete('alice', '000000');
    expect(res).toEqual({ ok: false, reason: 'no-code' });
    expect(purged).toHaveLength(0);
  });

  it('verifyAndDelete rejects a wrong code and reports remaining attempts', async () => {
    const svc = makeService();
    await svc.issueCode('alice', 'alice@example.com');
    const wrong = sent[0].code === '000000' ? '111111' : '000000';
    const res = await svc.verifyAndDelete('alice', wrong);
    expect(res).toEqual({ ok: false, reason: 'invalid', remaining: 4 });
    expect(purged).toHaveLength(0);
  });

  it('verifyAndDelete invalidates after 5 failed attempts', async () => {
    const svc = makeService();
    await svc.issueCode('alice', 'alice@example.com');
    const wrong = sent[0].code === '000000' ? '111111' : '000000';
    let res;
    for (let i = 0; i < 5; i++) res = await svc.verifyAndDelete('alice', wrong);
    expect(res).toEqual({ ok: false, reason: 'too-many-attempts' });
    // challenge is gone — a follow-up reads as no-code
    expect(await svc.verifyAndDelete('alice', sent[0].code)).toEqual({
      ok: false,
      reason: 'no-code',
    });
  });

  it('verifyAndDelete rejects an expired code', async () => {
    const svc = makeService();
    await svc.issueCode('alice', 'alice@example.com');
    nowMs += 600_001;
    const res = await svc.verifyAndDelete('alice', sent[0].code);
    expect(res).toEqual({ ok: false, reason: 'expired' });
    expect(purged).toHaveLength(0);
  });
});
