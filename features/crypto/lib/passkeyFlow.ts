import { derivePrfKek, toBase64, unwrapDek, wrapDek } from './clientCrypto';
import { getMaterial } from './cryptoMaterial';
import { postDek } from './unlockFlow';
import { assertPrfAny, assertPrfForCredential } from './webauthn';

export type EnablePasskeyInput = {
  credentialId: string;
  prfSalt: string;
  wrap: string;
  label: string;
};

/**
 * Build the wrap for a passkey. The caller must already hold the DEK (obtained
 * via obtainDek with a passphrase/recovery authorizer). Generates a fresh PRF
 * salt, asserts the passkey to read its PRF output, and wraps the DEK with the
 * derived KEK. The result is POSTed to enablePasskeyUnlockAction.
 */
export const buildPasskeyWrap = async (
  dek: Uint8Array,
  credentialId: string,
  label: string
): Promise<EnablePasskeyInput> => {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const { prfOutput } = await assertPrfForCredential(credentialId, salt);
  const wrap = await wrapDek(dek, await derivePrfKek(prfOutput));
  return { credentialId, prfSalt: toBase64(salt), wrap, label };
};

/** Unlock the session using any enrolled passkey. */
export const unlockWithPasskey = async (): Promise<void> => {
  const m = await getMaterial();
  if (!m.passkeys.length) throw new Error('No passkey is set up for unlock.');
  const { credentialId, prfOutput } = await assertPrfAny(
    m.passkeys.map((p) => ({
      credentialId: p.credentialId,
      prfSalt: p.prfSalt,
    }))
  );
  const match = m.passkeys.find((p) => p.credentialId === credentialId);
  if (!match) throw new Error('Passkey is not enrolled for unlock.');
  const dek = await unwrapDek(match.wrap, await derivePrfKek(prfOutput)).catch(
    () => {
      throw new Error('Passkey unlock failed.');
    }
  );
  await postDek(dek);
};
