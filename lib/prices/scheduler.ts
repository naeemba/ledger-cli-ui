import cron, { type ScheduledTask } from 'node-cron';
import 'server-only';
import { priceService } from './index';
import { env } from '@/lib/env';

let scheduled: ScheduledTask | null = null;

/**
 * Idempotent — calling more than once (HMR, double startup) returns silently.
 * No-op when PRICE_REFRESH_ENABLED is false.
 */
export const registerPriceCron = (): void => {
  if (scheduled) return;
  if (!env.PRICE_REFRESH_ENABLED) {
    console.log('[prices] cron disabled via PRICE_REFRESH_ENABLED=false');
    return;
  }
  const expr = `0 ${env.PRICE_REFRESH_HOUR} * * *`;
  scheduled = cron.schedule(expr, () => {
    console.log('[prices] scheduled refresh starting');
    void priceService.refreshAll().then(
      (r) => console.log('[prices] scheduled refresh done:', r),
      (err) => console.error('[prices] scheduled refresh threw:', err)
    );
  });
  console.log(`[prices] cron registered (schedule: "${expr}")`);
};
