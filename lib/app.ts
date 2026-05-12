import { clientEnv, type AppEnv } from '@/lib/env/client';

export type { AppEnv };

const APP_NAME_BASE = 'Ledger';

export const APP_ENV: AppEnv =
  clientEnv.NEXT_PUBLIC_APP_ENV ??
  (clientEnv.NODE_ENV === 'production' ? 'production' : 'local');

export const APP_NAME: string =
  APP_ENV === 'production' ? APP_NAME_BASE : `${APP_NAME_BASE} (${APP_ENV})`;
