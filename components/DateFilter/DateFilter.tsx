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

const buttonClasses =
  'my-2 mx-2 rounded-lg bg-gray-900 px-4 py-2 text-xs font-bold uppercase text-white shadow-md transition-all hover:shadow-lg hover:bg-gray-800';

const YEAR_BUTTONS_BACK = 4;

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
    <div className="border p-4">
      <div className="flex">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="mr-4 rounded px-4"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded px-4"
        />
        <button className={`${buttonClasses} ml-auto`} onClick={handleSubmit}>
          Apply
        </button>
      </div>

      <div className="my-4 flex">
        Monthly <hr className="my-auto ml-4 flex-1" />
      </div>
      <div className="flex flex-wrap">
        {dayjs.months().map((month, idx) => (
          <button
            className={buttonClasses}
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
      </div>

      <div className="my-4 flex">
        Quarterly <hr className="my-auto ml-4 flex-1" />
      </div>
      <div className="flex flex-wrap">
        {quarters.map((q) => (
          <button
            key={q.label}
            className={buttonClasses}
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
      </div>

      <div className="my-4 flex">
        Yearly <hr className="my-auto ml-4 flex-1" />
      </div>
      <div className="flex flex-wrap">
        {years.map((year) => (
          <button
            key={year}
            className={buttonClasses}
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
      </div>
    </div>
  );
};

export default DateFilter;
