import 'server-only';
import { getUserCryptoRepository } from '@/lib/crypto';
import { hasSessionDek } from '@/lib/crypto/sessionKeys';

export type CryptoStatus = 'unset' | 'locked' | 'ready';

export const cryptoStatus = async (userId: string): Promise<CryptoStatus> => {
  if (!(await getUserCryptoRepository().exists(userId))) return 'unset';
  return hasSessionDek(userId) ? 'ready' : 'locked';
};
