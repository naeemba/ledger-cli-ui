'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  endOfMonth,
  endOfQuarter,
  endOfYear,
  longMonthNames,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  toISODate,
} from '@/utils/date';
import { useRouter } from 'next/navigation';

type Props = {
  urlPattern: string;
  from?: string;
  to?: string;
};

const sectionLabel =
  'text-[0.65rem] font-semibold uppercase tracking-wider text-muted';

const inputClasses =
  'block rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-fg shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/40';

const YEAR_BUTTONS_BACK = 4;

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div>
    <div className="mb-2 flex items-center gap-3">
      <span className={sectionLabel}>{title}</span>
      <Separator className="flex-1" />
    </div>
    <div className="flex flex-wrap gap-1.5">{children}</div>
  </div>
);

const DateFilter = (props: Props) => {
  const { urlPattern, from: fromProp, to: toProp } = props;
  const [from, setFrom] = useState(fromProp ?? toISODate(startOfMonth()));
  const [to, setTo] = useState(toProp ?? toISODate(endOfMonth()));

  const router = useRouter();

  const pushNewURL = (newFrom: string, newTo: string) => {
    const newUrl = urlPattern.replace('{from}', newFrom).replace('{to}', newTo);
    router.push(newUrl);
  };

  const handleSubmit = () => {
    pushNewURL(from, to);
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from(
    { length: YEAR_BUTTONS_BACK + 1 },
    (_, i) => currentYear - i
  );

  const quarters = [0, 3, 6, 9].map((startMonth, idx) => ({
    label: `Q${idx + 1}`,
    startMonth,
  }));

  const months = longMonthNames();
  const refDate = new Date();

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={sectionLabel}>From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={`mt-1 ${inputClasses}`}
          />
        </div>
        <div>
          <label className={sectionLabel}>To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={`mt-1 ${inputClasses}`}
          />
        </div>
        <Button onClick={handleSubmit} size="sm" className="ml-auto">
          Apply
        </Button>
      </div>

      <div className="mt-5 space-y-4">
        <Section title="Monthly">
          {months.map((month, idx) => {
            const monthDate = new Date(refDate.getFullYear(), idx, 1);
            return (
              <Button
                key={month}
                variant="ghost"
                size="sm"
                onClick={() =>
                  pushNewURL(
                    toISODate(startOfMonth(monthDate)),
                    toISODate(endOfMonth(monthDate))
                  )
                }
              >
                {month}
              </Button>
            );
          })}
        </Section>

        <Section title="Quarterly">
          {quarters.map((q) => {
            const quarterDate = new Date(
              refDate.getFullYear(),
              q.startMonth,
              1
            );
            return (
              <Button
                key={q.label}
                variant="ghost"
                size="sm"
                onClick={() =>
                  pushNewURL(
                    toISODate(startOfQuarter(quarterDate)),
                    toISODate(endOfQuarter(quarterDate))
                  )
                }
              >
                {q.label}
              </Button>
            );
          })}
        </Section>

        <Section title="Yearly">
          {years.map((year) => {
            const yearDate = new Date(year, 0, 1);
            return (
              <Button
                key={year}
                variant="ghost"
                size="sm"
                onClick={() =>
                  pushNewURL(
                    toISODate(startOfYear(yearDate)),
                    toISODate(endOfYear(yearDate))
                  )
                }
              >
                {year}
              </Button>
            );
          })}
        </Section>
      </div>
    </div>
  );
};

export default DateFilter;
