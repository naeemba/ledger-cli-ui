import type { CryptoMaterial } from '@/lib/crypto/setupSchema';

/**
 * Fetch the wrapped key-material the server hands back (GET /api/crypto/material).
 * Single source of truth for the `/api/crypto/material` contract so the unlock
 * and rewrap unwrap paths can't drift.
 */
export const getMaterial = async (): Promise<CryptoMaterial> => {
  const res = await fetch('/api/crypto/material');
  if (!res.ok) throw new Error('Encryption is not set up.');
  return res.json() as Promise<CryptoMaterial>;
};
