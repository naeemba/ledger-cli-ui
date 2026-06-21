import { cache } from 'react';
import 'server-only';
import { userSettingRepository } from './instances';
import { baseCurrencySchema } from './schema';
import { getOptionalUser } from '@/lib/auth/require-user';
import { env } from '@/lib/env';
import { cookies } from 'next/headers';

export const COOKIE_NAME = 'baseCurrency';

export const getBaseCurrency = cache(async (): Promise<string> => {
  const jar = await cookies();
  const cookieValue = jar.get(COOKIE_NAME)?.value;
  if (cookieValue) {
    const parsed = baseCurrencySchema.safeParse(cookieValue);
    if (parsed.success) return parsed.data;
  }

  const user = await getOptionalUser();
  if (user) {
    const row = await userSettingRepository.get(user.id);
    if (row?.baseCurrency) return row.baseCurrency;
  }

  return env.DEFAULT_CURRENCY;
});
