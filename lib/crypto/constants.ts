// lib/crypto/constants.ts
/** Size of a Data Encryption Key (DEK) in bytes (AES-256 → 32 bytes). Single
 * source of truth so the transport decoder, the in-RAM session store, and the
 * file-envelope subkey derivation can't drift apart. */
export const DEK_BYTES = 32;
