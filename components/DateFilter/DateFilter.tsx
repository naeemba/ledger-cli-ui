'use client';

import { Button } from '@material-tailwind/react';
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
const colors = [
  'blue-gray',
  'gray',
  'brown',
  'deep-orange',
  'orange',
  'light-green',
  'green',
  'teal',
  'cyan',
  'light-blue',
  'blue',
  'indigo',
  'deep-purple',
  'purple',
  'pink',
  'red',
];

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

  return (
    <div className="border p-4">
      <div className="flex">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="mr-4 px-4 rounded"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="px-4 rounded"
        />
        <Button className="ml-auto" onClick={handleSubmit}>
          Apply
        </Button>
      </div>
      <div className="flex my-4">
        Monthly <hr className="ml-4 my-auto flex-1" />
      </div>
      <div className="flex flex-wrap">
        {dayjs.months().map((month, idx) => (
          <Button
            color={colors[idx]}
            className="my-4 mx-4"
            key={month}
            onClick={() =>
              pushNewURL(
                dayjs().month(idx).startOf('month').format('YYYY-MM-DD'),
                dayjs().month(idx).endOf('month').format('YYYY-MM-DD')
              )
            }
          >
            {month}
          </Button>
        ))}
      </div>
      <div className="flex my-4">
        Quarterly <hr className="ml-4 my-auto flex-1" />
      </div>

      <div className="flex flex-wrap">
        <Button
          color="blue"
          className="my-4 mx-4"
          onClick={() =>
            pushNewURL(
              dayjs().month(0).startOf('quarter').format('YYYY-MM-DD'),
              dayjs().month(0).endOf('quarter').format('YYYY-MM-DD')
            )
          }
        >
          Q1
        </Button>
        <Button
          color="teal"
          className="my-4 mx-4"
          onClick={() =>
            pushNewURL(
              dayjs().month(4).startOf('quarter').format('YYYY-MM-DD'),
              dayjs().month(4).endOf('quarter').format('YYYY-MM-DD')
            )
          }
        >
          Q2
        </Button>
        <Button
          color="brown"
          className="my-4 mx-4"
          onClick={() =>
            pushNewURL(
              dayjs().month(7).startOf('quarter').format('YYYY-MM-DD'),
              dayjs().month(7).endOf('quarter').format('YYYY-MM-DD')
            )
          }
        >
          Q3
        </Button>
        <Button
          color="red"
          className="my-4 mx-4"
          onClick={() =>
            pushNewURL(
              dayjs().month(10).startOf('quarter').format('YYYY-MM-DD'),
              dayjs().month(10).endOf('quarter').format('YYYY-MM-DD')
            )
          }
        >
          Q4
        </Button>
      </div>
      <div className="flex my-4">
        Yearly <hr className="ml-4 my-auto flex-1" />
      </div>
      <div className="flex flex-wrap">
        <Button
          color="pink"
          className="my-4 mx-4"
          onClick={() =>
            pushNewURL(
              dayjs().year(2024).startOf('year').format('YYYY-MM-DD'),
              dayjs().year(2024).endOf('year').format('YYYY-MM-DD')
            )
          }
        >
          2024
        </Button>
        <Button
          color="gray"
          className="my-4 mx-4"
          onClick={() =>
            pushNewURL(
              dayjs().year(2023).startOf('year').format('YYYY-MM-DD'),
              dayjs().year(2023).endOf('quarter').format('YYYY-MM-DD')
            )
          }
        >
          2023
        </Button>
        <Button
          color="blue-gray"
          className="my-4 mx-4"
          onClick={() =>
            pushNewURL(
              dayjs().year(2022).startOf('year').format('YYYY-MM-DD'),
              dayjs().year(2022).endOf('year').format('YYYY-MM-DD')
            )
          }
        >
          2022
        </Button>
      </div>
    </div>
  );
};

export default DateFilter;
