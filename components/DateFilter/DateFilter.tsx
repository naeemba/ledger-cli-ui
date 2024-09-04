'use client';

import { Button } from '@material-tailwind/react';
import { useState } from 'react';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import { useRouter } from 'next/navigation';

dayjs.extend(quarterOfYear);

type Props = {
  urlPattern: string;
  from?: string;
  to?: string;
};

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
      <hr className="my-4" />
      <div className="space-x-4">
        <Button
          color="red"
          onClick={() =>
            pushNewURL(
              dayjs().startOf('month').format('YYYY-MM-DD'),
              dayjs().endOf('month').format('YYYY-MM-DD')
            )
          }
        >
          Current Month
        </Button>
        <Button
          color="green"
          onClick={() =>
            pushNewURL(
              dayjs().add(-1, 'month').startOf('month').format('YYYY-MM-DD'),
              dayjs().add(-1, 'month').endOf('month').format('YYYY-MM-DD')
            )
          }
        >
          Previous Month
        </Button>
        <Button
          color="blue"
          onClick={() =>
            pushNewURL(
              dayjs().startOf('quarter').format('YYYY-MM-DD'),
              dayjs().endOf('quarter').format('YYYY-MM-DD')
            )
          }
        >
          Current Quarter
        </Button>
        <Button
          color="teal"
          onClick={() =>
            pushNewURL(
              dayjs()
                .add(-1, 'quarter')
                .startOf('quarter')
                .format('YYYY-MM-DD'),
              dayjs().add(-1, 'quarter').endOf('quarter').format('YYYY-MM-DD')
            )
          }
        >
          Previous Quarter
        </Button>
      </div>
    </div>
  );
};

export default DateFilter;
