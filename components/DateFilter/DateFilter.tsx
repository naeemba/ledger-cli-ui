'use client';

import { useState } from 'react';
import dayjs from 'dayjs';
import localeData from 'dayjs/plugin/localeData';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import { useRouter } from 'next/navigation';

dayjs.extend(quarterOfYear);
dayjs.extend(localeData);

type Props = {
  urlPattern: string;
  from?: string;
  to?: string;
};

const chipClasses =
  'rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-fg transition-colors hover:bg-subtle';

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
      <div className="h-px flex-1 bg-border" />
    </div>
    <div className="flex flex-wrap gap-1.5">{children}</div>
  </div>
);

const DateFilter = (props: Props) => {
  const { urlPattern, from: fromProp, to: toProp } = props;
  const [from, setFrom] = useState(
    fromProp ?? dayjs().startOf('month').format('YYYY-MM-DD')
  );
  const [to, setTo] = useState(
    toProp ?? dayjs().endOf('month').format('YYYY-MM-DD')
  );

  const router = useRouter();

  const pushNewURL = (newFrom: string, newTo: string) => {
    const newUrl = urlPattern.replace('{from}', newFrom).replace('{to}', newTo);
    router.push(newUrl);
  };

  const handleSubmit = () => {
    pushNewURL(from, to);
  };

  const currentYear = dayjs().year();
  const years = Array.from(
    { length: YEAR_BUTTONS_BACK + 1 },
    (_, i) => currentYear - i
  );

  const quarters = [0, 3, 6, 9].map((startMonth, idx) => ({
    label: `Q${idx + 1}`,
    startMonth,
  }));

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
        <button
          onClick={handleSubmit}
          className="ml-auto rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg shadow-sm transition-opacity hover:opacity-90"
        >
          Apply
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <Section title="Monthly">
          {dayjs.months().map((month, idx) => (
            <button
              className={chipClasses}
              key={month}
              onClick={() =>
                pushNewURL(
                  dayjs().month(idx).startOf('month').format('YYYY-MM-DD'),
                  dayjs().month(idx).endOf('month').format('YYYY-MM-DD')
                )
              }
            >
              {month}
            </button>
          ))}
        </Section>

        <Section title="Quarterly">
          {quarters.map((q) => (
            <button
              key={q.label}
              className={chipClasses}
              onClick={() =>
                pushNewURL(
                  dayjs()
                    .month(q.startMonth)
                    .startOf('quarter')
                    .format('YYYY-MM-DD'),
                  dayjs()
                    .month(q.startMonth)
                    .endOf('quarter')
                    .format('YYYY-MM-DD')
                )
              }
            >
              {q.label}
            </button>
          ))}
        </Section>

        <Section title="Yearly">
          {years.map((year) => (
            <button
              key={year}
              className={chipClasses}
              onClick={() =>
                pushNewURL(
                  dayjs().year(year).startOf('year').format('YYYY-MM-DD'),
                  dayjs().year(year).endOf('year').format('YYYY-MM-DD')
                )
              }
            >
              {year}
            </button>
          ))}
        </Section>
      </div>
    </div>
  );
};

export default DateFilter;
