// lib/crypto/sessionKeys.ts
import { DEK_BYTES } from './constants';

// The in-RAM DEK store MUST live on `globalThis`, not in a plain module-level
// `const`. Next.js evaluates this module in separate instances per server
// context (route handlers, RSC render, instrumentation), so a module-scoped Map
// would let the unlock API route (setSessionDek) and the CryptoGate render
// (hasSessionDek) write to and read from *different* maps — the gate would never
// see the unlocked DEK and would bounce every unlocked user back to
// /crypto/unlock. Pinning the Map on globalThis gives every instance one shared
// store for the lifetime of the process.
const globalForSessionKeys = globalThis as typeof globalThis & {
  __ledgerSessionDeks?: Map<string, Buffer>;
};
const keys = (globalForSessionKeys.__ledgerSessionDeks ??= new Map<
  string,
  Buffer
>());

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
