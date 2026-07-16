'use client';

import { useState, useTransition } from 'react';
import { postOccurrenceAction } from '../recurring/actions/postOccurrence';
import { skipOccurrenceAction } from '../recurring/actions/skipOccurrence';
import type {
  RecurringDueList,
  RecurringOccurrenceView,
} from '../recurring/dueList';
import { Button } from '@/components/ui/button';
import { Card as ShadcnCard } from '@/components/ui/card';
import { Format, formatDateWithLocale } from '@/utils/formatDateCore';
import Link from 'next/link';

type Props = { dueList: RecurringDueList };

const occurrenceAmount = (occurrence: RecurringOccurrenceView): string => {
  const posting = occurrence.postings.find((p) => p.amount.trim() !== '');
  return posting ? `${posting.currency} ${posting.amount}` : '';
};

const UpcomingBillsWidget = ({ dueList }: Props) => {
  const { due, upcoming, unsupported } = dueList;
  const [isPending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const seenRuleUids = new Set<string>();

  const runAction = (
    action: typeof postOccurrenceAction,
    occurrence: RecurringOccurrenceView
  ) => {
    setError(null);
    const key = `${occurrence.ruleUid}:${occurrence.date}`;
    setPendingKey(key);
    startTransition(async () => {
      const result = await action(
        occurrence.ruleUid,
        occurrence.fingerprint,
        occurrence.date
      );
      setPendingKey(null);
      if (!result.ok) setError(result.message);
    });
  };

  const isEmpty = due.length === 0 && upcoming.length === 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Upcoming bills</h2>
        <Link
          href="/recurring"
          className="text-sm font-medium text-primary hover:underline"
        >
          Manage recurring →
        </Link>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {isEmpty ? (
        <ShadcnCard className="p-6 text-center text-sm text-muted-foreground">
          Nothing due or upcoming.{' '}
          <Link href="/recurring" className="underline">
            Add recurring bills
          </Link>{' '}
          to see them here.
        </ShadcnCard>
      ) : (
        <>
          {due.length > 0 && (
            <ShadcnCard className="divide-y px-6 py-2">
              {due.map((occurrence) => {
                const isOldestForRule = !seenRuleUids.has(occurrence.ruleUid);
                seenRuleUids.add(occurrence.ruleUid);
                const key = `${occurrence.ruleUid}:${occurrence.date}`;
                const rowPending = isPending && pendingKey === key;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-4 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {occurrence.label}
                    </span>
                    <span
                      className={`whitespace-nowrap ${occurrence.overdue ? 'text-destructive' : 'text-muted-foreground'}`}
                    >
                      {formatDateWithLocale(occurrence.date, Format.DATE)}
                    </span>
                    <span className="whitespace-nowrap font-medium tabular-nums">
                      {occurrenceAmount(occurrence)}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!isOldestForRule || rowPending}
                        onClick={() =>
                          runAction(postOccurrenceAction, occurrence)
                        }
                      >
                        Post
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!isOldestForRule || rowPending}
                        onClick={() =>
                          runAction(skipOccurrenceAction, occurrence)
                        }
                      >
                        Skip
                      </Button>
                    </div>
                  </div>
                );
              })}
            </ShadcnCard>
          )}

          {upcoming.length > 0 && (
            <ShadcnCard className="divide-y px-6 py-2">
              {upcoming.map((occurrence, i) => (
                <div
                  key={`${occurrence.ruleUid}:${occurrence.date}:${i}`}
                  className="flex items-center justify-between gap-4 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {occurrence.label}
                  </span>
                  <span className="whitespace-nowrap text-muted-foreground">
                    {formatDateWithLocale(occurrence.date, Format.DATE)}
                  </span>
                  <span className="whitespace-nowrap font-medium tabular-nums">
                    {occurrenceAmount(occurrence)}
                  </span>
                </div>
              ))}
            </ShadcnCard>
          )}

          {unsupported.length > 0 && (
            <p className="text-sm text-muted-foreground">
              <Link href="/recurring" className="underline">
                {unsupported.length} rules have schedules this view can&apos;t
                expand.
              </Link>
            </p>
          )}
        </>
      )}
    </section>
  );
};

export default UpcomingBillsWidget;
