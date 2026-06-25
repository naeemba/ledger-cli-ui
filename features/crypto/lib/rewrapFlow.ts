import {
  derivePassphraseKek,
  generateRecoveryCode,
  parseRecoveryCode,
  recoveryHkdfKey,
  toBase64,
  unwrapDek,
  wrapDek,
  fromBase64,
} from './clientCrypto';
import { getMaterial } from './cryptoMaterial';

const ARGON = { m: 65536, t: 3, p: 1 } as const;

export type Authorizer =
  | { kind: 'passphrase'; passphrase: string }
  | { kind: 'recovery'; code: string };

/** Re-obtain the DEK client-side by unwrapping with the current secret. */
export const obtainDek = async (
  authorizer: Authorizer
): Promise<Uint8Array> => {
  const m = await getMaterial();
  if (authorizer.kind === 'passphrase') {
    const kek = await derivePassphraseKek(
      authorizer.passphrase,
      fromBase64(m.passSalt),
      m.argonParams
    );
    return unwrapDek(m.wrapPassphrase, kek).catch(() => {
      throw new Error('Incorrect passphrase.');
    });
  }
  const kek = await recoveryHkdfKey(parseRecoveryCode(authorizer.code));
  return unwrapDek(m.wrapRecovery, kek).catch(() => {
    throw new Error('Incorrect recovery code.');
  });
};

export const changePassphrase = async (
  authorizer: Authorizer,
  newPassphrase: string
): Promise<{
  wrapPassphrase: string;
  passSalt: string;
  argonParams: { m: number; t: number; p: number };
}> => {
  const dek = await obtainDek(authorizer);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrapPassphrase = await wrapDek(
    dek,
    await derivePassphraseKek(newPassphrase, salt, ARGON)
  );
  return {
    wrapPassphrase,
    passSalt: toBase64(salt),
    argonParams: { ...ARGON },
  };
};

export const rotateRecovery = async (
  authorizer: Authorizer
): Promise<{ wrapRecovery: string; code: string }> => {
  const dek = await obtainDek(authorizer);
  const { code, bytes } = generateRecoveryCode();
  const wrapRecovery = await wrapDek(dek, await recoveryHkdfKey(bytes));
  return { wrapRecovery, code };
};
