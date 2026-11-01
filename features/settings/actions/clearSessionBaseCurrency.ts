'use server';

import { COOKIE_NAME } from '@/lib/settings/cookieName';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

export const clearSessionBaseCurrencyAction = async (): Promise<void> => {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
  revalidatePath('/', 'layout');
};
