import { beforeEach, describe, expect, it, vi, MockedFunction } from 'vitest';
import { generateDek, derivePrfKek, wrapDek, toBase64 } from './clientCrypto';
import { getMaterial } from './cryptoMaterial';
import { buildPasskeyWrap, unlockWithPasskey } from './passkeyFlow';
import { postDek } from './unlockFlow';
import { assertPrfForCredential, assertPrfAny } from './webauthn';

vi.mock('./webauthn');
vi.mock('./cryptoMaterial');
vi.mock('./unlockFlow');

beforeEach(() => vi.clearAllMocks());

describe('buildPasskeyWrap', () => {
  it('asserts PRF and returns a wrap of the DEK', async () => {
    const prf = new Uint8Array(32).fill(3);
    (
      assertPrfForCredential as MockedFunction<typeof assertPrfForCredential>
    ).mockResolvedValue({
      credentialId: 'cred-A',
      prfOutput: prf,
    });
    const dek = generateDek();
    const out = await buildPasskeyWrap(dek, 'cred-A', 'Laptop');
    expect(out.credentialId).toBe('cred-A');
    expect(out.label).toBe('Laptop');
    expect(out.prfSalt.length).toBeGreaterThan(0);
    expect(out.wrap.length).toBeGreaterThan(0);
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
        {
          credentialId: 'cred-A',
          prfSalt: toBase64(new Uint8Array(32).fill(1)),
          wrap: 'x',
        },
        {
          credentialId: 'cred-B',
          prfSalt: toBase64(new Uint8Array(32).fill(2)),
          wrap,
        },
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
