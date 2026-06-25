import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EncryptionResetChallengeRepository } from './repository';
import { EncryptionResetService } from './service';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('EncryptionResetService', () => {
  let ctx: TestDbContext;
  let repo: EncryptionResetChallengeRepository;
  let sent: { email: string; code: string }[];
  let reset: string[];
  let nowMs: number;

  const makeService = () =>
    new EncryptionResetService(repo, {
      sendCode: async (email, code) => {
        sent.push({ email, code });
      },
      reset: async (userId) => {
        reset.push(userId);
      },
      now: () => nowMs,
    });

  beforeEach(async () => {
    ctx = await setupTestDb('enc-reset-svc-');
    await ctx.insertUser('alice', 'Alice', 'alice@example.com');
    repo = new EncryptionResetChallengeRepository(ctx.db);
    sent = [];
    reset = [];
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

  it('issueCode rolls back the challenge when the email send fails', async () => {
    const svc = new EncryptionResetService(repo, {
      sendCode: async () => {
        throw new Error('smtp down');
      },
      reset: async () => {},
      now: () => nowMs,
    });
    await expect(svc.issueCode('alice', 'alice@example.com')).rejects.toThrow(
      'smtp down'
    );
    // The throttle must not be armed by a failed send: a retry can issue again.
    expect(await repo.get('alice')).toBeNull();
    const retry = new EncryptionResetService(repo, {
      sendCode: async (email, code) => {
        sent.push({ email, code });
      },
      reset: async () => {},
      now: () => nowMs,
    });
    const res = await retry.issueCode('alice', 'alice@example.com');
    expect(res).toEqual({ ok: true });
  });

  it('issueCode throttles within 30 s', async () => {
    const svc = makeService();
    await svc.issueCode('alice', 'alice@example.com');
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

  it('verifyAndReset calls reset and deletes the challenge row on the correct code', async () => {
    const svc = makeService();
    await svc.issueCode('alice', 'alice@example.com');
    const res = await svc.verifyAndReset('alice', sent[0].code);
    expect(res).toEqual({ ok: true });
    expect(reset).toEqual(['alice']);
    // KEY: challenge row must be explicitly deleted (no user cascade on reset)
    expect(await repo.get('alice')).toBeNull();
  });

  it('verifyAndReset returns no-code when none issued', async () => {
    const res = await makeService().verifyAndReset('alice', '000000');
    expect(res).toEqual({ ok: false, reason: 'no-code' });
    expect(reset).toHaveLength(0);
  });

  it('verifyAndReset rejects a wrong code and reports remaining attempts', async () => {
    const svc = makeService();
    await svc.issueCode('alice', 'alice@example.com');
    const wrong = sent[0].code === '000000' ? '111111' : '000000';
    const res = await svc.verifyAndReset('alice', wrong);
    expect(res).toEqual({ ok: false, reason: 'invalid', remaining: 4 });
    expect(reset).toHaveLength(0);
  });

  it('verifyAndReset invalidates after 5 failed attempts', async () => {
    const svc = makeService();
    await svc.issueCode('alice', 'alice@example.com');
    const wrong = sent[0].code === '000000' ? '111111' : '000000';
    let res;
    for (let i = 0; i < 5; i++) res = await svc.verifyAndReset('alice', wrong);
    expect(res).toEqual({ ok: false, reason: 'too-many-attempts' });
    // challenge is gone — a follow-up reads as no-code
    expect(await svc.verifyAndReset('alice', sent[0].code)).toEqual({
      ok: false,
      reason: 'no-code',
    });
  });

  it('verifyAndReset rejects an expired code', async () => {
    const svc = makeService();
    await svc.issueCode('alice', 'alice@example.com');
    nowMs += 600_001;
    const res = await svc.verifyAndReset('alice', sent[0].code);
    expect(res).toEqual({ ok: false, reason: 'expired' });
    expect(reset).toHaveLength(0);
  });
});
