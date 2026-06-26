import cron, { type ScheduledTask } from 'node-cron';
import 'server-only';
import { priceService } from './index';
import { env } from '@/lib/env';
import { createLogger } from '@/lib/log';

const log = createLogger('prices');

let scheduled: ScheduledTask | null = null;

/**
 * Idempotent — calling more than once (HMR, double startup) returns silently.
 * No-op when PRICE_REFRESH_ENABLED is false.
 */
export const registerPriceCron = (): void => {
  if (scheduled) return;
  if (!env.PRICE_REFRESH_ENABLED) {
    log.info('cron disabled via PRICE_REFRESH_ENABLED=false');
    return;
  }
  const expr = `0 ${env.PRICE_REFRESH_HOUR} * * *`;
  scheduled = cron.schedule(expr, () => {
    log.info('scheduled refresh starting');
    void priceService.refreshAll().then(
      (r) => log.info({ result: r }, 'scheduled refresh done'),
      (err) => log.error({ err }, 'scheduled refresh threw')
    );
  });
  log.info({ schedule: expr }, 'cron registered');
};
