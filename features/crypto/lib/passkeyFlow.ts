import { derivePrfKek, prfSalt, unwrapDek, wrapDek } from './clientCrypto';
import { getMaterial } from './cryptoMaterial';
import { postDek } from './unlockFlow';
import { assertPrfAny, assertPrfForCredential } from './webauthn';
import { enablePasskeyUnlockAction } from '@/features/crypto/actions/enablePasskeyUnlock';
import { authClient } from '@/lib/auth-client';

export type EnablePasskeyInput = {
  credentialId: string;
  wrap: string;
  label: string;
};

/** A passkey as returned by better-auth's list-user-passkeys endpoint. */
export type AuthPasskey = { credentialID: string; name?: string };

/**
 * List the current user's registered passkeys via better-auth. Returns `null`
 * on any network/HTTP error so callers can distinguish "no passkeys" (`[]`) from
 * "couldn't load" (`null`): the wizard step treats both as empty (optional
 * step), while the settings card surfaces a load error.
 */
export const fetchUserPasskeys = async (): Promise<AuthPasskey[] | null> => {
  try {
    const res = await fetch('/api/auth/passkey/list-user-passkeys', {
      method: 'GET',
      credentials: 'include',
    });
    if (!res.ok) return null;
    return (await res.json()) as AuthPasskey[];
  } catch {
    return null;
  }
};

/**
 * Build the wrap for a passkey. The caller must already hold the DEK (obtained
 * via obtainDek with a passphrase/recovery authorizer). Asserts the passkey to
 * read its PRF output using the fixed salt, then wraps the DEK with the derived
 * KEK. The result is POSTed to enablePasskeyUnlockAction.
 */
export const buildPasskeyWrap = async (
  dek: Uint8Array,
  credentialId: string,
  label: string
): Promise<EnablePasskeyInput> => {
  const { prfOutput } = await assertPrfForCredential(credentialId);
  const wrap = await wrapDek(dek, await derivePrfKek(prfOutput));
  return { credentialId, wrap, label };
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

/**
 * Unwrap the DEK using a PRF output already obtained from a ceremony and post it
 * to the session. Shared by the standalone unlock and the single-tap login path.
 * Throws if the responding credential has no enrolled wrap.
 */
export const unlockWithPrfOutput = async (
  credentialId: string,
  prfOutput: Uint8Array
): Promise<void> => {
  const m = await getMaterial();
  const match = m.passkeys.find((p) => p.credentialId === credentialId);
  if (!match) throw new Error('Passkey is not enrolled for unlock.');
  const dek = await unwrapDek(match.wrap, await derivePrfKek(prfOutput)).catch(
    () => {
      throw new Error('Passkey unlock failed.');
    }
  );
  await postDek(dek);
};

/** Shape of better-auth's returned WebAuthn assertion (the bits we read). */
export type WebAuthnResult = {
  response: { id: string };
  clientExtensionResults: { prf?: { results?: { first?: BufferSource } } };
};

/**
 * Best-effort unlock from a login ceremony's PRF output. No-ops when PRF is
 * absent (device unsupported / passkey not registered with PRF) and swallows
 * unlock failures (passkey not enrolled for unlock, no encryption set up) so the
 * caller can proceed to the normal passphrase unlock. Never throws.
 */
export const tryUnlockFromWebAuthn = async (
  webauthn: WebAuthnResult | undefined
): Promise<void> => {
  const first = webauthn?.clientExtensionResults?.prf?.results?.first;
  const credentialId = webauthn?.response?.id;
  if (!first || !credentialId) return;
  try {
    await unlockWithPrfOutput(
      credentialId,
      new Uint8Array(first as ArrayBuffer)
    );
  } catch {
    // Not enrolled for unlock / no encryption — fall through to passphrase unlock.
  }
};

/**
 * Drive the passkey login ceremony and the best-effort single-tap unlock from
 * one assertion. Requests PRF with the fixed salt, surfaces any better-auth
 * error to the caller (so the AuthForm can show it and skip the redirect), and
 * otherwise attempts to unlock the journal from the ceremony's PRF output before
 * the caller redirects. Unlock is best-effort and never blocks login: when PRF
 * or an enrolled wrap is unavailable, the user falls through to passphrase
 * unlock. Returns the better-auth result so callers can inspect `error`.
 */
export const signInWithPasskey = async (): Promise<{
  error: { message?: string | null } | null | undefined;
}> => {
  const res = await authClient.signIn.passkey({
    extensions: {
      prf: { eval: { first: prfSalt() as unknown as BufferSource } },
    },
    returnWebAuthnResponse: true,
  } as Parameters<typeof authClient.signIn.passkey>[0]);
  if (res?.error) return { error: res.error };
  let webauthn: WebAuthnResult | undefined;
  if (res && 'webauthn' in res && res.webauthn) {
    webauthn = res.webauthn as unknown as WebAuthnResult;
  }
  await tryUnlockFromWebAuthn(webauthn);
  return { error: null };
};

/** Unlock the session using any enrolled passkey (standalone unlock screen). */
export const unlockWithPasskey = async (): Promise<void> => {
  const m = await getMaterial();
  if (!m.passkeys.length) throw new Error('No passkey is set up for unlock.');
  const { credentialId, prfOutput } = await assertPrfAny(
    m.passkeys.map((p) => p.credentialId)
  );
  await unlockWithPrfOutput(credentialId, prfOutput);
};
