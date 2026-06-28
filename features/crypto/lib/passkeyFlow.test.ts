import { beforeEach, describe, expect, it, vi, MockedFunction } from 'vitest';
import { generateDek, derivePrfKek, wrapDek } from './clientCrypto';
import { getMaterial } from './cryptoMaterial';
import {
  buildPasskeyWrap,
  unlockWithPasskey,
  unlockWithPrfOutput,
  tryUnlockFromWebAuthn,
  registerPasskey,
  enrollPasskeyForUnlock,
} from './passkeyFlow';
import { postDek } from './unlockFlow';
import { assertPrfForCredential, assertPrfAny } from './webauthn';
import { enablePasskeyUnlockAction } from '@/features/crypto/actions/enablePasskeyUnlock';
import { authClient } from '@/lib/auth-client';

vi.mock('./webauthn');
vi.mock('./cryptoMaterial');
vi.mock('./unlockFlow');
vi.mock('@/lib/auth-client', () => ({
  authClient: { passkey: { addPasskey: vi.fn() } },
}));
vi.mock('@/features/crypto/actions/enablePasskeyUnlock');

beforeEach(() => vi.clearAllMocks());

describe('buildPasskeyWrap', () => {
  it('asserts PRF and returns a wrap of the DEK', async () => {
    const prf = new Uint8Array(32).fill(3);
    (
      assertPrfForCredential as MockedFunction<typeof assertPrfForCredential>
    ).mockResolvedValue({ credentialId: 'cred-A', prfOutput: prf });
    const dek = generateDek();
    const out = await buildPasskeyWrap(dek, 'cred-A', 'Laptop');
    expect(out).toEqual({
      credentialId: 'cred-A',
      label: 'Laptop',
      wrap: expect.any(String),
    });
    expect(assertPrfForCredential).toHaveBeenCalledWith('cred-A');
  });
});

describe('unlockWithPasskey', () => {
  it('unwraps with the responding credential and posts the DEK', async () => {
    // Arrange: enroll cred-B with a known PRF output.
    const prf = new Uint8Array(32).fill(5);
    const dek = generateDek();
    const wrap = await wrapDek(dek, await derivePrfKek(prf));
    (getMaterial as MockedFunction<typeof getMaterial>).mockResolvedValue({
      passSalt: 'salt',
      argonParams: { m: 19, t: 2, p: 1 },
      wrapPassphrase: 'pp',
      wrapRecovery: 'rec',
      passkeys: [
        { credentialId: 'cred-A', wrap: 'x' },
        { credentialId: 'cred-B', wrap },
      ],
    });
    (assertPrfAny as MockedFunction<typeof assertPrfAny>).mockResolvedValue({
      credentialId: 'cred-B',
      prfOutput: prf,
    });

    await unlockWithPasskey();

    expect(postDek).toHaveBeenCalledTimes(1);
    const posted = (postDek as MockedFunction<typeof postDek>).mock
      .calls[0][0] as Uint8Array;
    expect(Array.from(posted)).toEqual(Array.from(dek));
  });

  it('throws when no passkeys are enrolled', async () => {
    (getMaterial as MockedFunction<typeof getMaterial>).mockResolvedValue({
      passSalt: 'salt',
      argonParams: { m: 19, t: 2, p: 1 },
      wrapPassphrase: 'pp',
      wrapRecovery: 'rec',
      passkeys: [],
    });
    await expect(unlockWithPasskey()).rejects.toThrow(/no passkey/i);
  });
});

describe('unlockWithPrfOutput', () => {
  it('unwraps the matching wrap and posts the DEK', async () => {
    const prf = new Uint8Array(32).fill(5);
    const dek = generateDek();
    const wrap = await wrapDek(dek, await derivePrfKek(prf));
    (getMaterial as MockedFunction<typeof getMaterial>).mockResolvedValue({
      passSalt: 'salt',
      argonParams: { m: 19, t: 2, p: 1 },
      wrapPassphrase: 'pp',
      wrapRecovery: 'rec',
      passkeys: [{ credentialId: 'cred-B', wrap }],
    });
    await unlockWithPrfOutput('cred-B', prf);
    const posted = (postDek as MockedFunction<typeof postDek>).mock
      .calls[0][0] as Uint8Array;
    expect(Array.from(posted)).toEqual(Array.from(dek));
  });

  it('throws when the credential has no enrolled wrap', async () => {
    (getMaterial as MockedFunction<typeof getMaterial>).mockResolvedValue({
      passSalt: 'salt',
      argonParams: { m: 19, t: 2, p: 1 },
      wrapPassphrase: 'pp',
      wrapRecovery: 'rec',
      passkeys: [],
    });
    await expect(
      unlockWithPrfOutput('cred-X', new Uint8Array(32))
    ).rejects.toThrow(/not enrolled/i);
  });
});

describe('tryUnlockFromWebAuthn', () => {
  it('unlocks when PRF output is present', async () => {
    const prf = new Uint8Array(32).fill(5);
    const dek = generateDek();
    const wrap = await wrapDek(dek, await derivePrfKek(prf));
    (getMaterial as MockedFunction<typeof getMaterial>).mockResolvedValue({
      passSalt: 'salt',
      argonParams: { m: 19, t: 2, p: 1 },
      wrapPassphrase: 'pp',
      wrapRecovery: 'rec',
      passkeys: [{ credentialId: 'cred-B', wrap }],
    });
    await tryUnlockFromWebAuthn({
      response: { id: 'cred-B' },
      clientExtensionResults: { prf: { results: { first: prf.buffer } } },
    });
    expect(postDek).toHaveBeenCalledTimes(1);
  });

  it('no-ops when PRF output is absent', async () => {
    await tryUnlockFromWebAuthn({
      response: { id: 'cred-B' },
      clientExtensionResults: {},
    });
    expect(postDek).not.toHaveBeenCalled();
  });

  it('swallows unlock errors (not enrolled) without throwing', async () => {
    (getMaterial as MockedFunction<typeof getMaterial>).mockResolvedValue({
      passSalt: 'salt',
      argonParams: { m: 19, t: 2, p: 1 },
      wrapPassphrase: 'pp',
      wrapRecovery: 'rec',
      passkeys: [],
    });
    await expect(
      tryUnlockFromWebAuthn({
        response: { id: 'cred-Z' },
        clientExtensionResults: {
          prf: { results: { first: new Uint8Array(32).buffer } },
        },
      })
    ).resolves.toBeUndefined();
    expect(postDek).not.toHaveBeenCalled();
  });
});

describe('registerPasskey', () => {
  it('returns the new credentialId on success', async () => {
    (
      authClient.passkey.addPasskey as MockedFunction<
        typeof authClient.passkey.addPasskey
      >
    ).mockResolvedValue({
      data: { credentialID: 'cred-new' },
      error: null,
    } as never);
    const out = await registerPasskey('This device');
    expect(out.credentialId).toBe('cred-new');
    expect(authClient.passkey.addPasskey).toHaveBeenCalledWith({
      name: 'This device',
    });
  });

  it('throws with the server message when registration errors', async () => {
    (
      authClient.passkey.addPasskey as MockedFunction<
        typeof authClient.passkey.addPasskey
      >
    ).mockResolvedValue({ data: null, error: { message: 'denied' } } as never);
    await expect(registerPasskey('x')).rejects.toThrow('denied');
  });
});

describe('enrollPasskeyForUnlock', () => {
  it('builds a wrap and enables it', async () => {
    (
      assertPrfForCredential as MockedFunction<typeof assertPrfForCredential>
    ).mockResolvedValue({
      credentialId: 'cred-A',
      prfOutput: new Uint8Array(32).fill(7),
    });
    (
      enablePasskeyUnlockAction as MockedFunction<
        typeof enablePasskeyUnlockAction
      >
    ).mockResolvedValue({ ok: true });

    await enrollPasskeyForUnlock(generateDek(), 'cred-A', 'Laptop');

    expect(enablePasskeyUnlockAction).toHaveBeenCalledTimes(1);
    const arg = (
      enablePasskeyUnlockAction as MockedFunction<
        typeof enablePasskeyUnlockAction
      >
    ).mock.calls[0][0] as { credentialId: string; label: string };
    expect(arg.credentialId).toBe('cred-A');
    expect(arg.label).toBe('Laptop');
  });

  it('throws with the action message when enabling fails', async () => {
    (
      assertPrfForCredential as MockedFunction<typeof assertPrfForCredential>
    ).mockResolvedValue({
      credentialId: 'cred-A',
      prfOutput: new Uint8Array(32).fill(7),
    });
    (
      enablePasskeyUnlockAction as MockedFunction<
        typeof enablePasskeyUnlockAction
      >
    ).mockResolvedValue({ ok: false, message: 'rate limited' });

    await expect(
      enrollPasskeyForUnlock(generateDek(), 'cred-A', 'L')
    ).rejects.toThrow('rate limited');
  });
});
