import { derivePrfKek, toBase64, unwrapDek, wrapDek } from './clientCrypto';
import { getMaterial } from './cryptoMaterial';
import { postDek } from './unlockFlow';
import { assertPrfAny, assertPrfForCredential } from './webauthn';
import { enablePasskeyUnlockAction } from '@/features/crypto/actions/enablePasskeyUnlock';
import { authClient } from '@/lib/auth-client';

export type EnablePasskeyInput = {
  credentialId: string;
  prfSalt: string;
  wrap: string;
  label: string;
};

/** A passkey as returned by better-auth's list-user-passkeys endpoint. */
export type AuthPasskey = { credentialID: string; name?: string };

/**
 * List the current user's registered passkeys via better-auth. Returns `[]` on
 * any network/HTTP error so callers can treat "no passkeys" and "couldn't load"
 * uniformly; callers that need to distinguish should fetch directly.
 */
export const fetchUserPasskeys = async (): Promise<AuthPasskey[]> => {
  try {
    const res = await fetch('/api/auth/passkey/list-user-passkeys', {
      method: 'GET',
      credentials: 'include',
    });
    if (!res.ok) return [];
    return (await res.json()) as AuthPasskey[];
  } catch {
    return [];
  }
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

/**
 * Register a new passkey via better-auth and resolve its credentialId. PRF is
 * requested at registration by the server config (lib/auth.ts:
 * passkey.registration.extensions.prf = {}), so the created credential supports
 * PRF — no client-side extension needed here. Throws if the user cancels or the
 * server rejects.
 */
export const registerPasskey = async (
  name: string
): Promise<{ credentialId: string }> => {
  const res = await authClient.passkey.addPasskey({ name });
  if (!res || res.error || !res.data) {
    throw new Error(res?.error?.message ?? 'Could not create a passkey.');
  }
  const id = (res.data as { credentialID?: unknown }).credentialID;
  if (typeof id !== 'string' || !id) {
    throw new Error('Could not create a passkey.');
  }
  return { credentialId: id };
};

/**
 * Enroll a passkey for unlock: wrap the DEK with the passkey's PRF-derived KEK
 * and persist the wrap. The caller already holds the DEK (wizard: in-memory;
 * settings: obtained via an authorizer). Throws if the PRF assertion or the
 * server action fails.
 */
export const enrollPasskeyForUnlock = async (
  dek: Uint8Array,
  credentialId: string,
  label: string
): Promise<void> => {
  const input = await buildPasskeyWrap(dek, credentialId, label);
  const res = await enablePasskeyUnlockAction(input);
  if (!res.ok) throw new Error(res.message);
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
