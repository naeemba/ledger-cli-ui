import {
  derivePassphraseKek,
  fromBase64,
  parseRecoveryCode,
  recoveryHkdfKey,
  toBase64,
  unwrapDek,
} from './clientCrypto';
import { getMaterial } from './cryptoMaterial';

export const postDek = async (dek: Uint8Array): Promise<void> => {
  const res = await fetch('/api/crypto/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dek: toBase64(dek) }),
  });
  if (!res.ok) {
    const { error } = await res
      .json()
      .catch(() => ({ error: 'Unlock failed' }));
    throw new Error(error ?? 'Unlock failed');
  }
};

export const unlockWithPassphrase = async (
  passphrase: string
): Promise<void> => {
  const m = await getMaterial();
  const kek = await derivePassphraseKek(
    passphrase,
    fromBase64(m.passSalt),
    m.argonParams
  );
  const dek = await unwrapDek(m.wrapPassphrase, kek).catch(() => {
    throw new Error('Incorrect passphrase.');
  });
  await postDek(dek);
};

export const unlockWithRecovery = async (code: string): Promise<void> => {
  const m = await getMaterial();
  const kek = await recoveryHkdfKey(parseRecoveryCode(code));
  const dek = await unwrapDek(m.wrapRecovery, kek).catch(() => {
    throw new Error('Incorrect recovery code.');
  });
  await postDek(dek);
};

export const lock = async (): Promise<void> => {
  await fetch('/api/crypto/lock', { method: 'POST' });
};
