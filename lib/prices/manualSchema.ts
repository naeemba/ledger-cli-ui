import { z } from 'zod';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export const manualPriceDraftSchema = z.object({
  date: z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD'),
  time: z
    .union([z.string().regex(TIME_RE, 'Time must be HH:MM'), z.literal('')])
    .optional(),
  quote: z.string().min(1, 'Quote currency is required'),
  rows: z
    .array(
      z.object({
        symbol: z.string().min(1),
        price: z.number().finite().positive(),
      })
    )
    .min(1, 'Add at least one price'),
});

export type ManualPriceDraft = z.infer<typeof manualPriceDraftSchema>;

/**
 * Build the UTC instant a manual rate applies to. Blank time → end-of-day
 * (23:59:59Z) so a date-only rate is authoritative for the whole calendar day
 * and beats any intraday fetched rate. Returns null if the result is invalid.
 */
export const buildPricedAt = (date: string, time?: string): Date | null => {
  const t = time && time.length > 0 ? `${time}:00` : '23:59:59';
  const d = new Date(`${date}T${t}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};
