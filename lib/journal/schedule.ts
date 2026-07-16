export type ScheduleUnit = 'day' | 'week' | 'month' | 'year';

export type Schedule = {
  unit: ScheduleUnit;
  count: number;
  anchor: string; // YYYY-MM-DD
};

const PERIOD_REGEX =
  /^(?:every\s+(?:(\d+)\s+)?(day|week|month|year)s?|(daily|weekly|monthly|yearly))\s+from\s+(\d{4})[/-](\d{2})[/-](\d{2})$/i;

const ALIAS_UNITS: Record<string, ScheduleUnit> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
};

export const parseSchedule = (period: string): Schedule | null => {
  const match = period.trim().match(PERIOD_REGEX);
  if (!match) return null;
  const [, countRaw, unitRaw, aliasRaw, year, month, day] = match;
  const unit = unitRaw
    ? (unitRaw.toLowerCase() as ScheduleUnit)
    : ALIAS_UNITS[aliasRaw.toLowerCase()];
  const count = countRaw ? parseInt(countRaw, 10) : 1;
  if (count < 1 || count > 366) return null;
  const anchor = `${year}-${month}-${day}`;
  if (Number.isNaN(Date.parse(anchor))) return null;
  return { unit, count, anchor };
};

export const serializeSchedule = (schedule: Schedule): string =>
  `every ${schedule.count} ${schedule.unit}s from ${schedule.anchor.replaceAll('-', '/')}`;

// All arithmetic below is calendar-date-only (UTC to avoid DST edges). No
// monetary values pass through this module.
const toUtc = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const toIso = (date: Date): string => date.toISOString().slice(0, 10);

const daysInMonth = (year: number, monthIndex: number): number =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

/** k-th occurrence (k >= 0) of the schedule, anchored to the anchor date. */
const occurrenceAt = (schedule: Schedule, k: number): string => {
  const anchor = toUtc(schedule.anchor);
  if (schedule.unit === 'day' || schedule.unit === 'week') {
    const stepDays = schedule.count * (schedule.unit === 'week' ? 7 : 1);
    const result = new Date(anchor);
    result.setUTCDate(result.getUTCDate() + k * stepDays);
    return toIso(result);
  }
  const monthsPerStep =
    schedule.unit === 'month' ? schedule.count : schedule.count * 12;
  const totalMonths = anchor.getUTCMonth() + k * monthsPerStep;
  const year = anchor.getUTCFullYear() + Math.floor(totalMonths / 12);
  const monthIndex = ((totalMonths % 12) + 12) % 12;
  const day = Math.min(anchor.getUTCDate(), daysInMonth(year, monthIndex));
  return toIso(new Date(Date.UTC(year, monthIndex, day)));
};

/** Smallest k whose occurrence is strictly after `afterExclusive`. */
const firstIndexAfter = (
  schedule: Schedule,
  afterExclusive: string
): number => {
  if (schedule.anchor > afterExclusive) return 0;
  const anchor = toUtc(schedule.anchor);
  const after = toUtc(afterExclusive);
  const elapsedDays =
    (after.getTime() - anchor.getTime()) / (24 * 60 * 60 * 1000);
  // Estimate then correct: clamping (short months) can only push a date
  // earlier, so the estimate may be at most a couple of steps off.
  const approxStepDays =
    schedule.unit === 'day'
      ? schedule.count
      : schedule.unit === 'week'
        ? schedule.count * 7
        : schedule.unit === 'month'
          ? schedule.count * 28
          : schedule.count * 365;
  let k = Math.max(0, Math.floor(elapsedDays / approxStepDays) - 2);
  while (occurrenceAt(schedule, k) <= afterExclusive) k++;
  return k;
};

export const expandSchedule = (
  schedule: Schedule,
  afterExclusive: string,
  throughInclusive: string
): string[] => {
  const result: string[] = [];
  let k = firstIndexAfter(schedule, afterExclusive);
  for (;;) {
    const occurrence = occurrenceAt(schedule, k);
    if (occurrence > throughInclusive) return result;
    result.push(occurrence);
    k++;
  }
};

export const lastOccurrenceBefore = (
  schedule: Schedule,
  date: string
): string | null => {
  const k = firstIndexAfter(schedule, date) - 1;
  // firstIndexAfter uses strict >, so back up while the occurrence at k
  // equals `date` (we need strictly before).
  for (let i = k; i >= 0; i--) {
    const occurrence = occurrenceAt(schedule, i);
    if (occurrence < date) return occurrence;
  }
  return null;
};
