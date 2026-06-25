// lib/crypto/sessionKeys.ts
const DEK_BYTES = 32;
const keys = new Map<string, Buffer>();

/** Thrown when an operation needs the DEK but the session is locked. */
export class LockedError extends Error {
  constructor(message = 'Journal is locked; unlock to continue.') {
    super(message);
    this.name = 'LockedError';
  }
}

export const setSessionDek = (userId: string, dek: Buffer): void => {
  if (dek.length !== DEK_BYTES) {
    throw new Error(`DEK must be ${DEK_BYTES} bytes, got ${dek.length}`);
  }
  keys.set(userId, Buffer.from(dek)); // defensive copy
};

export const getSessionDek = (userId: string): Buffer | undefined =>
  keys.get(userId);

export const hasSessionDek = (userId: string): boolean => keys.has(userId);

export const dropSessionDek = (userId: string): void => {
  keys.delete(userId);
};

/** Test-only: clear all in-RAM keys between tests. */
export const __resetSessionKeysForTest = (): void => {
  keys.clear();
};
