import { describe, expect, it } from 'vitest';
import {
  derivePrfKek,
  derivePassphraseKek,
  generateDek,
  generateRecoveryCode,
  parseRecoveryCode,
  PRF_SALT,
  recoveryHkdfKey,
  unwrapDek,
  wrapDek,
} from './clientCrypto';

const PARAMS = { m: 512, t: 2, p: 1 }; // small for test speed

describe('clientCrypto', () => {
  it('generates a 32-byte DEK', () => {
    expect(generateDek().length).toBe(32);
  });

  it('passphrase wrap/unwrap round-trips and is deterministic for same salt+params', async () => {
    const dek = generateDek();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kek1 = await derivePassphraseKek('correct horse', salt, PARAMS);
    const wrap = await wrapDek(dek, kek1);
    const kek2 = await derivePassphraseKek('correct horse', salt, PARAMS);
    const out = await unwrapDek(wrap, kek2);
    expect([...out]).toEqual([...dek]);
  });

  it('wrong passphrase fails to unwrap', async () => {
    const dek = generateDek();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const wrap = await wrapDek(
      dek,
      await derivePassphraseKek('right', salt, PARAMS)
    );
    const wrongKek = await derivePassphraseKek('wrong', salt, PARAMS);
    await expect(unwrapDek(wrap, wrongKek)).rejects.toBeTruthy();
  });

  it('recovery code round-trips and unwraps the DEK', async () => {
    const dek = generateDek();
    const { code, bytes } = generateRecoveryCode();
    expect(parseRecoveryCode(code)).toEqual(bytes);
    const wrap = await wrapDek(dek, await recoveryHkdfKey(bytes));
    const out = await unwrapDek(
      wrap,
      await recoveryHkdfKey(parseRecoveryCode(code))
    );
    expect([...out]).toEqual([...dek]);
  });

  it('recovery code is grouped Base32 of 256 bits', () => {
    const { code, bytes } = generateRecoveryCode();
    expect(bytes.length).toBe(32);
    expect(code).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4})+$/);
  });
});

describe('derivePrfKek', () => {
  it('round-trips a DEK wrap and is deterministic for the same PRF output', async () => {
    const prf = crypto.getRandomValues(new Uint8Array(32));
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const kek = await derivePrfKek(prf);
    const wrapped = await wrapDek(dek, kek);
    const kek2 = await derivePrfKek(prf); // same PRF → same key
    const back = await unwrapDek(wrapped, kek2);
    expect(Array.from(back)).toEqual(Array.from(dek));
  });

  it('a different PRF output cannot unwrap', async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await wrapDek(
      dek,
      await derivePrfKek(crypto.getRandomValues(new Uint8Array(32)))
    );
    await expect(
      unwrapDek(
        wrapped,
        await derivePrfKek(crypto.getRandomValues(new Uint8Array(32)))
      )
    ).rejects.toBeTruthy();
  });
});

describe('PRF_SALT', () => {
  it('is the fixed versioned salt bytes', () => {
    expect(new TextDecoder().decode(PRF_SALT)).toBe('ledger-prf-v1');
  });
});
