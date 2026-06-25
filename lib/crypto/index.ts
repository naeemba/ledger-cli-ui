import { PasskeyWrapRepository } from './passkeyWrapRepository';
import { UserCryptoRepository } from './userCryptoRepository';
import { db } from '@/lib/db';

let repo: UserCryptoRepository | null = null;
let passkeyWrapRepo: PasskeyWrapRepository | null = null;

/** Lazy singleton bound to the production db (connects on first query). */
export const getUserCryptoRepository = (): UserCryptoRepository =>
  (repo ??= new UserCryptoRepository(db));

export const getPasskeyWrapRepository = (): PasskeyWrapRepository =>
  (passkeyWrapRepo ??= new PasskeyWrapRepository(db));

export { UserCryptoRepository } from './userCryptoRepository';
export { PasskeyWrapRepository } from './passkeyWrapRepository';
