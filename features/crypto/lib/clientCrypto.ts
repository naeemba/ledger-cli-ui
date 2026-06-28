import { argon2id } from 'hash-wasm';

const GCM_NONCE = 12;
const RECOVERY_INFO = new TextEncoder().encode('ledger-recovery-v1');
const PASSKEY_INFO = new TextEncoder().encode('ledger-passkey-v1');
const PRF_SALT_BYTES = new TextEncoder().encode('ledger-prf-v1');

/**
 * Fixed PRF eval input for passkey-derived KEKs. Not a secret and not entropy:
 * the PRF output is already uniquely bound to (authenticator secret, rpId) by the
 * hardware, and domain separation is handled by derivePrfKek's HKDF info. A fixed
 * value lets the login ceremony request PRF without a pre-auth salt fetch. The
 * version suffix leaves a rotation handle.
 *
 * Returns a fresh copy on each call so the shared crypto-input buffer can never
 * be mutated by a caller.
 */
export const prfSalt = (): Uint8Array => new Uint8Array(PRF_SALT_BYTES);

export const toBase64 = (b: Uint8Array): string =>
  btoa(String.fromCharCode(...b));
export const fromBase64 = (s: string): Uint8Array =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const generateDek = (): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(32));

export const derivePassphraseKek = async (
  passphrase: string,
  salt: Uint8Array,
  params: { m: number; t: number; p: number }
): Promise<CryptoKey> => {
  const rawBuf = await argon2id({
    password: passphrase,
    salt: new Uint8Array(salt) as Uint8Array<ArrayBuffer>,
    parallelism: params.p,
    iterations: params.t,
    memorySize: params.m, // KiB
    hashLength: 32,
    outputType: 'binary',
  });
  return crypto.subtle.importKey(
    'raw',
    new Uint8Array(rawBuf) as Uint8Array<ArrayBuffer>,
    'AES-GCM',
    false,
    ['encrypt', 'decrypt']
  );
};

export const recoveryHkdfKey = async (
  recovery: Uint8Array
): Promise<CryptoKey> => {
  const base = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(recovery) as Uint8Array<ArrayBuffer>,
    'HKDF',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0) as Uint8Array<ArrayBuffer>,
      info: RECOVERY_INFO,
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

/** Derive an AES-GCM KEK from a passkey's PRF output (HKDF, empty salt). */
export const derivePrfKek = async (
  prfOutput: Uint8Array
): Promise<CryptoKey> => {
  const base = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(prfOutput) as Uint8Array<ArrayBuffer>,
    'HKDF',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0) as Uint8Array<ArrayBuffer>,
      info: PASSKEY_INFO,
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

export const wrapDek = async (
  dek: Uint8Array,
  kek: CryptoKey
): Promise<string> => {
  const iv = new Uint8Array(GCM_NONCE) as Uint8Array<ArrayBuffer>;
  crypto.getRandomValues(iv);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      kek,
      new Uint8Array(dek) as Uint8Array<ArrayBuffer>
    )
  );
  const blob = new Uint8Array(iv.length + ct.length);
  blob.set(iv, 0);
  blob.set(ct, iv.length);
  return toBase64(blob);
};

export const unwrapDek = async (
  wrapB64: string,
  kek: CryptoKey
): Promise<Uint8Array> => {
  const blob = fromBase64(wrapB64);
  const iv = new Uint8Array(
    blob.subarray(0, GCM_NONCE)
  ) as Uint8Array<ArrayBuffer>;
  const ct = new Uint8Array(
    blob.subarray(GCM_NONCE)
  ) as Uint8Array<ArrayBuffer>;
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, kek, ct)
  );
};

// RFC 4648 Base32, grouped XXXX-XXXX for readability.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const base32Encode = (bytes: Uint8Array): string => {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
};
const base32Decode = (s: string): Uint8Array => {
  const clean = s.replace(/-/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Invalid recovery code character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
};

export const generateRecoveryCode = (): { code: string; bytes: Uint8Array } => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = base32Encode(bytes); // 52 chars for 256 bits
  const code = (raw.match(/.{1,4}/g) ?? []).join('-');
  return { code, bytes };
};

export const parseRecoveryCode = (code: string): Uint8Array =>
  base32Decode(code).subarray(0, 32);
