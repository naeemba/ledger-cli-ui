import { UserCryptoRepository } from './userCryptoRepository';
import { db } from '@/lib/db';

let repo: UserCryptoRepository | null = null;

/** Lazy singleton bound to the production db (connects on first query). */
export const getUserCryptoRepository = (): UserCryptoRepository =>
  (repo ??= new UserCryptoRepository(db));

export { UserCryptoRepository } from './userCryptoRepository';
