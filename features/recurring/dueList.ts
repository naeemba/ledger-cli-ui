import type { ParsedRecurring } from '@/lib/journal/recurring';
import {
  parseSchedule,
  expandSchedule,
  dayBefore,
} from '@/lib/journal/schedule';

export type RecurringOccurrenceView = {
  ruleUid: string;
  fingerprint: string;
  date: string; // YYYY-MM-DD
  label: string; // rule note first line, or first posting account
  postings: { account: string; amount: string; currency: string }[];
  overdue: boolean;
};

export type RecurringDueList = {
  due: RecurringOccurrenceView[]; // date <= today, oldest first
  upcoming: RecurringOccurrenceView[]; // today < date <= horizon
  unsupported: { ruleUid: string | undefined; period: string }[];
};

export const buildDueList = (
  rules: readonly ParsedRecurring[],
  today: string,
  horizon: string
): RecurringDueList => {
  const due: RecurringOccurrenceView[] = [];
  const upcoming: RecurringOccurrenceView[] = [];
  const unsupported: { ruleUid: string | undefined; period: string }[] = [];

  for (const rule of rules) {
    const schedule = rule.uid ? parseSchedule(rule.period) : null;
    if (!rule.uid || !schedule) {
      unsupported.push({ ruleUid: rule.uid, period: rule.period });
      continue;
    }

    const floor = rule.handled ?? dayBefore(today);
    const label =
      (rule.note ?? '').split('\n')[0] || rule.postings[0]?.account || '';
    const postings = rule.postings.map((posting) => ({
      account: posting.account,
      amount: posting.amount,
      currency: posting.currency,
    }));

    for (const date of expandSchedule(schedule, floor, horizon)) {
      const occurrence: RecurringOccurrenceView = {
        ruleUid: rule.uid,
        fingerprint: rule.fingerprint,
        date,
        label,
        postings,
        overdue: date < today,
      };
      if (date <= today) due.push(occurrence);
      else upcoming.push(occurrence);
    }
  }

  due.sort((a, b) => a.date.localeCompare(b.date));
  upcoming.sort((a, b) => a.date.localeCompare(b.date));

  return { due, upcoming, unsupported };
};
