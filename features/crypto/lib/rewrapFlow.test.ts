import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  derivePassphraseKek,
  fromBase64,
  generateDek,
  generateRecoveryCode,
  recoveryHkdfKey,
  toBase64,
  unwrapDek,
  wrapDek,
} from './clientCrypto';
import { changePassphrase, obtainDek, rotateRecovery } from './rewrapFlow';

const ARGON = { m: 512, t: 2, p: 1 };

async function fixtureMaterial(
  dek: Uint8Array,
  passphrase: string,
  recoveryBytes: Uint8Array
) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrapPassphrase = await wrapDek(
    dek,
    await derivePassphraseKek(passphrase, salt, ARGON)
  );
  const wrapRecovery = await wrapDek(dek, await recoveryHkdfKey(recoveryBytes));
  return {
    passSalt: toBase64(salt),
    argonParams: ARGON,
    wrapPassphrase,
    wrapRecovery,
  };
}
function stubFetch(material: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/crypto/material')
        return new Response(JSON.stringify(material), { status: 200 });
      return new Response(null, { status: 204 }); // unused here
    })
  );
}
afterEach(() => vi.unstubAllGlobals());

describe('rewrapFlow', () => {
  it('obtainDek returns the DEK for a correct passphrase', async () => {
    const dek = generateDek();
    const { code, bytes } = generateRecoveryCode();
    stubFetch(await fixtureMaterial(dek, 'right', bytes));
    const out = await obtainDek({ kind: 'passphrase', passphrase: 'right' });
    expect([...out]).toEqual([...dek]);
    void code;
  });

  it('obtainDek throws on a wrong passphrase', async () => {
    const dek = generateDek();
    const { bytes } = generateRecoveryCode();
    stubFetch(await fixtureMaterial(dek, 'right', bytes));
    await expect(
      obtainDek({ kind: 'passphrase', passphrase: 'wrong' })
    ).rejects.toThrow('Incorrect passphrase.');
  });

  it('changePassphrase produces a wrap the new passphrase can unwrap to the same DEK', async () => {
    const dek = generateDek();
    const { bytes } = generateRecoveryCode();
    stubFetch(await fixtureMaterial(dek, 'old', bytes));
    const next = await changePassphrase(
      { kind: 'passphrase', passphrase: 'old' },
      'brand-new'
    );
    const kek = await derivePassphraseKek(
      'brand-new',
      fromBase64(next.passSalt),
      next.argonParams
    );
    expect([...(await unwrapDek(next.wrapPassphrase, kek))]).toEqual([...dek]);
  });

  it('rotateRecovery produces a new code+wrap that unwraps the same DEK', async () => {
    const dek = generateDek();
    const { bytes } = generateRecoveryCode();
    stubFetch(await fixtureMaterial(dek, 'pw', bytes));
    const { wrapRecovery, code } = await rotateRecovery({
      kind: 'passphrase',
      passphrase: 'pw',
    });
    const { parseRecoveryCode } = await import('./clientCrypto');
    const kek = await recoveryHkdfKey(parseRecoveryCode(code));
    expect([...(await unwrapDek(wrapRecovery, kek))]).toEqual([...dek]);
  });
});
