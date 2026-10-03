import {
  sharedDebtPageSchema,
  type SharedDebtPage,
} from '@/lib/debt-share/payload';

const NONCE_LENGTH = 12;
const KEY_LENGTH = 32;

const base64ToBytes = (text: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(text);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const base64UrlToBytes = (text: string): Uint8Array<ArrayBuffer> => {
  const standard = text.replace(/-/g, '+').replace(/_/g, '/');
  return base64ToBytes(
    standard.padEnd(Math.ceil(standard.length / 4) * 4, '=')
  );
};

/**
 * Decrypt a shared debt page in the visitor's browser with the key from the
 * link's fragment. Any failure (no page stored for the id because it is
 * unknown or revoked, wrong key, tampered blob, a body that isn't a page) is
 * null, so the caller shows one "no longer active"
 * screen and never half a page.
 */
export const openSharedPage = async (
  shareId: string,
  sealed: string | null,
  keyText: string
): Promise<SharedDebtPage | null> => {
  if (!sealed || !keyText) return null;
  try {
    const keyBytes = base64UrlToBytes(keyText);
    if (keyBytes.length !== KEY_LENGTH) return null;
    const raw = base64ToBytes(sealed);
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      'AES-GCM',
      false,
      ['decrypt']
    );
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: raw.slice(0, NONCE_LENGTH),
        additionalData: new TextEncoder().encode(shareId),
      },
      key,
      raw.slice(NONCE_LENGTH)
    );
    const parsed = sharedDebtPageSchema.safeParse(
      JSON.parse(new TextDecoder().decode(plaintext))
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};
