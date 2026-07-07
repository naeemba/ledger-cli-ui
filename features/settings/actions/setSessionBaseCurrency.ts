'use server';

import { baseCurrencySchema, COOKIE_NAME } from '@/lib/settings';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

export type SetSessionBaseCurrencyResult =
  { ok: true } | { ok: false; message: string };

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export const setSessionBaseCurrencyAction = async (
  value: unknown
): Promise<SetSessionBaseCurrencyResult> => {
  const parsed = baseCurrencySchema.safeParse(value);
  if (!parsed.success) return { ok: false, message: 'Invalid currency code.' };

  const jar = await cookies();
  jar.set(COOKIE_NAME, parsed.data, {
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
    httpOnly: false,
    path: '/',
  });
  revalidatePath('/', 'layout');
  return { ok: true };
};
