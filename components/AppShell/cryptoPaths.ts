export const CRYPTO_PATHS = new Set(['/crypto/setup', '/crypto/unlock']);
export const isCryptoPath = (pathname: string): boolean =>
  CRYPTO_PATHS.has(pathname);
