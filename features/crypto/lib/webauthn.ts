import { PRF_SALT } from './clientCrypto';

export const base64urlToBytes = (s: string): Uint8Array<ArrayBuffer> => {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) =>
    c.charCodeAt(0)
  ) as Uint8Array<ArrayBuffer>;
};

export type PrfAssertion = { credentialId: string; prfOutput: Uint8Array };

const readPrf = (cred: PublicKeyCredential): Uint8Array => {
  const first = cred.getClientExtensionResults().prf?.results?.first;
  if (!first) throw new Error('This device does not support passkey unlock.');
  return new Uint8Array(first as ArrayBuffer);
};

const prfExtensions = () => ({
  prf: { eval: { first: PRF_SALT as unknown as BufferSource } },
});

/** Single-credential PRF assertion — used when enabling a specific passkey. */
export const assertPrfForCredential = async (
  credentialId: string
): Promise<PrfAssertion> => {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [
        { id: base64urlToBytes(credentialId), type: 'public-key' },
      ],
      userVerification: 'required',
      extensions: prfExtensions(),
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Passkey prompt was dismissed.');
  return { credentialId, prfOutput: readPrf(cred) };
};

/** Multi-credential PRF assertion — used by the standalone unlock screen. */
export const assertPrfAny = async (
  credentialIds: string[]
): Promise<PrfAssertion> => {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: credentialIds.map((id) => ({
        id: base64urlToBytes(id),
        type: 'public-key' as const,
      })),
      userVerification: 'required',
      extensions: prfExtensions(),
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Passkey prompt was dismissed.');
  return { credentialId: cred.id, prfOutput: readPrf(cred) };
};
